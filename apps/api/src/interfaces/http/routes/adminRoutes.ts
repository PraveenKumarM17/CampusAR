import { Router } from 'express';
import { z } from 'zod';
import { analyticsRepository } from '../../../infrastructure/repositories/analyticsRepository';
import { campusRepository } from '../../../infrastructure/repositories/campusRepository';
import { notificationRepository } from '../../../infrastructure/repositories/analyticsRepository';
import { siteAreaRepository } from '../../../infrastructure/repositories/siteAreaRepository';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth';
import { requireMapEditor } from '../middleware/mapEditorAuth';
import {
  assertResourceInSite,
  resolveEditorSiteId,
  resolveRequestSiteId,
} from '../../../application/siteContext';
import { validateSiteMap } from '../../../application/mapValidation';
import { validateIndoorLayout } from '../../../application/indoorLayoutValidation';
import {
  graphEdgeCreateSchema,
  graphHandoffSchema,
  graphNodeFromPlanSchema,
  graphNodeMoveSchema,
  graphRoomLinkSchema,
  indoorGraphEditorService,
} from '../../../application/indoorGraphEditorService';
import { floorLayoutRepository } from '../../../infrastructure/repositories/floorLayoutRepository';
import { AppError } from '../../../domain/errors';
import { haversineMeters } from '../../../domain/routing/astar';

export const adminRouter = Router();
adminRouter.use(requireAuth);

const geoPointSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

const footprintSchema = z.array(geoPointSchema).min(3);

const localVec2Schema = z.object({ x: z.number(), y: z.number() });
const localPolygonSchema = z.array(localVec2Schema).min(3);

const roomCategorySchema = z.enum([
  'classroom',
  'lab',
  'office',
  'library',
  'cafeteria',
  'restroom',
  'auditorium',
  'ward',
  'meeting_room',
  'storage',
  'other',
]);

const floorPoiCategorySchema = z.enum([
  'reception',
  'restroom',
  'elevator',
  'stairs',
  'information',
  'waiting',
  'other',
]);

async function assertBuildingInEditorSite(buildingId: string, siteId: string) {
  const building = await campusRepository.getBuildingById(buildingId);
  if (!building) throw new AppError('NOT_FOUND', 'Building not found', 404);
  await assertResourceInSite(building.siteId, siteId, 'Building');
  return building;
}

const mapEditorRouter = Router();
mapEditorRouter.use(requireMapEditor);

async function editorSiteStrict(req: AuthedRequest): Promise<string> {
  return resolveEditorSiteId(req);
}

mapEditorRouter.get('/map-builder/snapshot', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    const [buildings, nodes, edges, areas] = await Promise.all([
      campusRepository.listBuildings(siteId),
      campusRepository.listActiveNodes(siteId),
      campusRepository.listEdges(siteId),
      siteAreaRepository.listBySite(siteId),
    ]);
    res.json({ siteId, buildings, nodes, edges, areas });
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.get('/map-builder/validate', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    res.json(await validateSiteMap(siteId));
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.post('/buildings', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    const body = z
      .object({
        name: z.string().min(1),
        code: z.string().min(1),
        description: z.string().nullable().optional(),
        latitude: z.number(),
        longitude: z.number(),
        floorsCount: z.number().int().positive(),
        footprint: footprintSchema.optional(),
      })
      .parse(req.body);
    res.status(201).json(
      await campusRepository.createBuilding({
        ...body,
        description: body.description ?? null,
        siteId,
      }),
    );
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.put('/buildings/:id', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    const id = String(req.params.id);
    const existing = await campusRepository.getBuildingById(id);
    if (!existing) return res.status(404).json({ code: 'NOT_FOUND', message: 'Building not found' });
    await assertResourceInSite(existing.siteId, siteId, 'Building');
    const body = z
      .object({
        name: z.string().min(1).optional(),
        code: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        floorsCount: z.number().int().positive().optional(),
        footprint: footprintSchema.nullable().optional(),
        expectedUpdatedAt: z.string().datetime().optional(),
      })
      .parse(req.body);
    const updated = await campusRepository.updateBuilding(id, {
      name: body.name,
      code: body.code,
      description: body.description,
      floorsCount: body.floorsCount,
      footprint: body.footprint === null ? [] : body.footprint,
      expectedUpdatedAt: body.expectedUpdatedAt,
      latitude: body.latitude,
      longitude: body.longitude,
    });
    if (!updated) return res.status(404).json({ code: 'NOT_FOUND', message: 'Building not found' });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.delete('/buildings/:id', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    await campusRepository.deleteBuildingSafe(String(req.params.id), siteId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.get('/paths/nodes', async (req, res, next) => {
  try {
    const siteId = await resolveRequestSiteId(req);
    res.json(await campusRepository.listNodes(siteId));
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.post('/paths/nodes', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    const body = z
      .object({
        name: z.string().nullable().optional(),
        latitude: z.number(),
        longitude: z.number(),
        floorId: z.string().uuid().nullable().optional(),
        buildingId: z.string().uuid().nullable().optional(),
        kind: z.enum(['outdoor', 'indoor', 'entrance', 'elevator', 'stairs', 'ramp', 'exit']),
      })
      .parse(req.body);
    if (body.buildingId) {
      const building = await campusRepository.getBuildingById(body.buildingId);
      if (!building) throw new AppError('NOT_FOUND', 'Building not found', 404);
      await assertResourceInSite(building.siteId, siteId, 'Building');
    }
    res.status(201).json(
      await campusRepository.createNode({
        name: body.name ?? null,
        latitude: body.latitude,
        longitude: body.longitude,
        floorId: body.floorId ?? null,
        buildingId: body.buildingId ?? null,
        kind: body.kind,
        siteId,
      }),
    );
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.put('/paths/nodes/:id', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    const id = String(req.params.id);
    const existing = await campusRepository.getNodeById(id);
    if (!existing) return res.status(404).json({ code: 'NOT_FOUND', message: 'Node not found' });
    await assertResourceInSite(existing.siteId, siteId, 'Node');
    const body = z
      .object({
        name: z.string().nullable().optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        floorId: z.string().uuid().nullable().optional(),
        buildingId: z.string().uuid().nullable().optional(),
        kind: z
          .enum(['outdoor', 'indoor', 'entrance', 'elevator', 'stairs', 'ramp', 'exit'])
          .optional(),
      })
      .parse(req.body);
    if (body.buildingId) {
      const building = await campusRepository.getBuildingById(body.buildingId);
      if (!building) throw new AppError('NOT_FOUND', 'Building not found', 404);
      await assertResourceInSite(building.siteId, siteId, 'Building');
    }
    const updated = await campusRepository.updateNode(id, body);
    if (!updated) return res.status(404).json({ code: 'NOT_FOUND', message: 'Node not found' });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.delete('/paths/nodes/:id', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    const cascade = req.query.cascade === 'true';
    await campusRepository.deleteNodeSafe(String(req.params.id), siteId, cascade);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.get('/paths/edges', async (req, res, next) => {
  try {
    const siteId = await resolveRequestSiteId(req);
    res.json(await campusRepository.listEdges(siteId));
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.post('/paths/edges', async (req: AuthedRequest, res, next) => {
  try {
    await editorSiteStrict(req);
    const body = z
      .object({
        fromNodeId: z.string().uuid(),
        toNodeId: z.string().uuid(),
        distanceM: z.number().positive().optional(),
        kind: z.enum(['walkway', 'stairs', 'elevator', 'ramp', 'corridor']).default('walkway'),
        bidirectional: z.boolean().default(true),
        blocked: z.boolean().default(false),
        safetyScore: z.number().min(0).max(1).default(0.9),
        crowdScore: z.number().min(0).max(1).default(0.2),
        accessibilityScore: z.number().min(0).max(1).default(0.9),
      })
      .parse(req.body);
    const from = await campusRepository.getNodeById(body.fromNodeId);
    const to = await campusRepository.getNodeById(body.toNodeId);
    if (!from || !to) throw new AppError('INVALID_NODE', 'Edge endpoints must be existing nodes', 422);
    if (!from.siteId || !to.siteId || from.siteId !== to.siteId) {
      throw new AppError('CROSS_SITE_EDGE', 'Edges cannot connect nodes from different sites', 422);
    }
    const siteId = from.siteId;
    await assertResourceInSite(from.siteId, siteId, 'Start node');
    await assertResourceInSite(to.siteId, siteId, 'End node');
    const distanceM =
      body.distanceM ??
      haversineMeters(from.latitude, from.longitude, to.latitude, to.longitude);
    const edge = await campusRepository.createEdge({ ...body, distanceM });
    res.status(201).json(edge);
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.put('/paths/edges/:id', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    const id = String(req.params.id);
    const existing = await campusRepository.getEdgeById(id);
    if (!existing) return res.status(404).json({ code: 'NOT_FOUND', message: 'Edge not found' });
    await assertResourceInSite(existing.siteId, siteId, 'Edge');
    const body = z
      .object({
        fromNodeId: z.string().uuid().optional(),
        toNodeId: z.string().uuid().optional(),
        distanceM: z.number().positive().optional(),
        kind: z.enum(['walkway', 'stairs', 'elevator', 'ramp', 'corridor']).optional(),
        bidirectional: z.boolean().optional(),
        blocked: z.boolean().optional(),
        safetyScore: z.number().min(0).max(1).optional(),
        crowdScore: z.number().min(0).max(1).optional(),
        accessibilityScore: z.number().min(0).max(1).optional(),
      })
      .parse(req.body);
    const updated = await campusRepository.updateEdge(id, body);
    if (!updated) return res.status(404).json({ code: 'NOT_FOUND', message: 'Edge not found' });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.delete('/paths/edges/:id', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    const existing = await campusRepository.getEdgeById(String(req.params.id));
    if (!existing) return res.status(404).json({ code: 'NOT_FOUND', message: 'Edge not found' });
    await assertResourceInSite(existing.siteId, siteId, 'Edge');
    await campusRepository.deleteEdge(String(req.params.id));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.get('/areas', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    res.json(await siteAreaRepository.listBySite(siteId));
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.post('/areas', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    const body = z
      .object({
        name: z.string().min(1),
        type: z.enum(['parking', 'open_area', 'restricted', 'assembly']),
        footprint: footprintSchema,
      })
      .parse(req.body);
    res.status(201).json(
      await siteAreaRepository.create({
        siteId,
        name: body.name,
        type: body.type,
        footprint: body.footprint,
      }),
    );
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.put('/areas/:id', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    const id = String(req.params.id);
    const existing = await siteAreaRepository.getById(id);
    if (!existing) return res.status(404).json({ code: 'NOT_FOUND', message: 'Area not found' });
    await assertResourceInSite(existing.siteId, siteId, 'Area');
    const body = z
      .object({
        name: z.string().min(1).optional(),
        type: z.enum(['parking', 'open_area', 'restricted', 'assembly']).optional(),
        footprint: footprintSchema.optional(),
      })
      .parse(req.body);
    const updated = await siteAreaRepository.update(id, body);
    if (!updated) return res.status(404).json({ code: 'NOT_FOUND', message: 'Area not found' });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.delete('/areas/:id', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    const existing = await siteAreaRepository.getById(String(req.params.id));
    if (!existing) return res.status(404).json({ code: 'NOT_FOUND', message: 'Area not found' });
    await assertResourceInSite(existing.siteId, siteId, 'Area');
    await siteAreaRepository.delete(String(req.params.id));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.get('/map-builder/indoor/snapshot', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    const buildingId = z.string().uuid().parse(req.query.buildingId);
    await assertBuildingInEditorSite(buildingId, siteId);
    res.json(await floorLayoutRepository.loadSnapshot(buildingId, siteId));
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.get('/map-builder/indoor/validate', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    const buildingId = z.string().uuid().parse(req.query.buildingId);
    await assertBuildingInEditorSite(buildingId, siteId);
    res.json(await validateIndoorLayout(buildingId, siteId));
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.post('/map-builder/indoor/floors', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    const body = z
      .object({
        buildingId: z.string().uuid(),
        level: z.number().int(),
        name: z.string().min(1),
      })
      .parse(req.body);
    await assertBuildingInEditorSite(body.buildingId, siteId);
    try {
      res.status(201).json(await floorLayoutRepository.createFloor(body));
    } catch (err: unknown) {
      const pg = err as { code?: string };
      if (pg.code === '23505') {
        throw new AppError(
          'DUPLICATE_FLOOR',
          'A floor with this level already exists for the building',
          422,
        );
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.put('/map-builder/indoor/floors/:id', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    const id = String(req.params.id);
    const floor = await floorLayoutRepository.getFloorById(id);
    if (!floor) return res.status(404).json({ code: 'NOT_FOUND', message: 'Floor not found' });
    await assertBuildingInEditorSite(floor.buildingId, siteId);
    const body = z
      .object({
        level: z.number().int().optional(),
        name: z.string().min(1).optional(),
        expectedUpdatedAt: z.string().datetime().optional(),
      })
      .parse(req.body);
    try {
      const updated = await floorLayoutRepository.updateFloor(id, body);
      if (!updated) return res.status(404).json({ code: 'NOT_FOUND', message: 'Floor not found' });
      res.json(updated);
    } catch (err: unknown) {
      const pg = err as { code?: string };
      if (pg.code === '23505') {
        throw new AppError(
          'DUPLICATE_FLOOR',
          'A floor with this level already exists for the building',
          422,
        );
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.delete('/map-builder/indoor/floors/:id', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    const id = String(req.params.id);
    const floor = await floorLayoutRepository.getFloorById(id);
    if (!floor) return res.status(404).json({ code: 'NOT_FOUND', message: 'Floor not found' });
    await assertBuildingInEditorSite(floor.buildingId, siteId);
    await floorLayoutRepository.deleteFloor(id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.post('/map-builder/indoor/rooms', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    const body = z
      .object({
        buildingId: z.string().uuid(),
        floorId: z.string().uuid(),
        name: z.string().min(1),
        code: z.string().min(1),
        category: roomCategorySchema,
        wheelchairAccessible: z.boolean().optional(),
        localGeometry: localPolygonSchema,
      })
      .parse(req.body);
    await assertBuildingInEditorSite(body.buildingId, siteId);
    res.status(201).json(await floorLayoutRepository.createRoom(body));
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.put('/map-builder/indoor/rooms/:id', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    const id = String(req.params.id);
    const room = await floorLayoutRepository.getRoomById(id);
    if (!room) return res.status(404).json({ code: 'NOT_FOUND', message: 'Room not found' });
    await assertBuildingInEditorSite(room.buildingId, siteId);
    const body = z
      .object({
        name: z.string().min(1).optional(),
        code: z.string().min(1).optional(),
        category: roomCategorySchema.optional(),
        wheelchairAccessible: z.boolean().optional(),
        localGeometry: localPolygonSchema.optional(),
        floorId: z.string().uuid().optional(),
        expectedUpdatedAt: z.string().datetime().optional(),
      })
      .parse(req.body);
    const updated = await floorLayoutRepository.updateRoom(id, body);
    if (!updated) return res.status(404).json({ code: 'NOT_FOUND', message: 'Room not found' });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.delete('/map-builder/indoor/rooms/:id', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    const id = String(req.params.id);
    const room = await floorLayoutRepository.getRoomById(id);
    if (!room) return res.status(404).json({ code: 'NOT_FOUND', message: 'Room not found' });
    await assertBuildingInEditorSite(room.buildingId, siteId);
    await floorLayoutRepository.deleteRoom(id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.post('/map-builder/indoor/corridors', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    const body = z
      .object({
        buildingId: z.string().uuid(),
        floorId: z.string().uuid(),
        name: z.string().nullable().optional(),
        category: z.string().optional(),
        localGeometry: localPolygonSchema,
      })
      .parse(req.body);
    await assertBuildingInEditorSite(body.buildingId, siteId);
    res.status(201).json(await floorLayoutRepository.createCorridor(body));
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.put('/map-builder/indoor/corridors/:id', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    const id = String(req.params.id);
    const corridor = await floorLayoutRepository.getCorridorById(id);
    if (!corridor) return res.status(404).json({ code: 'NOT_FOUND', message: 'Corridor not found' });
    await assertBuildingInEditorSite(corridor.buildingId, siteId);
    const body = z
      .object({
        name: z.string().nullable().optional(),
        category: z.string().optional(),
        localGeometry: localPolygonSchema.optional(),
        floorId: z.string().uuid().optional(),
        expectedUpdatedAt: z.string().datetime().optional(),
      })
      .parse(req.body);
    const updated = await floorLayoutRepository.updateCorridor(id, body);
    if (!updated) return res.status(404).json({ code: 'NOT_FOUND', message: 'Corridor not found' });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.delete('/map-builder/indoor/corridors/:id', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    const id = String(req.params.id);
    const corridor = await floorLayoutRepository.getCorridorById(id);
    if (!corridor) return res.status(404).json({ code: 'NOT_FOUND', message: 'Corridor not found' });
    await assertBuildingInEditorSite(corridor.buildingId, siteId);
    await floorLayoutRepository.deleteCorridor(id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.post('/map-builder/indoor/pois', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    const body = z
      .object({
        buildingId: z.string().uuid(),
        floorId: z.string().uuid(),
        name: z.string().min(1),
        category: floorPoiCategorySchema,
        localX: z.number(),
        localY: z.number(),
      })
      .parse(req.body);
    await assertBuildingInEditorSite(body.buildingId, siteId);
    res.status(201).json(await floorLayoutRepository.createPoi(body));
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.put('/map-builder/indoor/pois/:id', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    const id = String(req.params.id);
    const poi = await floorLayoutRepository.getPoiById(id);
    if (!poi) return res.status(404).json({ code: 'NOT_FOUND', message: 'POI not found' });
    await assertBuildingInEditorSite(poi.buildingId, siteId);
    const body = z
      .object({
        name: z.string().min(1).optional(),
        category: floorPoiCategorySchema.optional(),
        localX: z.number().optional(),
        localY: z.number().optional(),
        floorId: z.string().uuid().optional(),
        expectedUpdatedAt: z.string().datetime().optional(),
      })
      .parse(req.body);
    const updated = await floorLayoutRepository.updatePoi(id, body);
    if (!updated) return res.status(404).json({ code: 'NOT_FOUND', message: 'POI not found' });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.delete('/map-builder/indoor/pois/:id', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    const id = String(req.params.id);
    const poi = await floorLayoutRepository.getPoiById(id);
    if (!poi) return res.status(404).json({ code: 'NOT_FOUND', message: 'POI not found' });
    await assertBuildingInEditorSite(poi.buildingId, siteId);
    await floorLayoutRepository.deletePoi(id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.get('/map-builder/indoor/graph/snapshot', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    const buildingId = z.string().uuid().parse(req.query.buildingId);
    await assertBuildingInEditorSite(buildingId, siteId);
    res.json(await indoorGraphEditorService.loadGraphSnapshot(buildingId, siteId));
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.post('/map-builder/indoor/graph/ensure-map', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    const body = z.object({ buildingId: z.string().uuid() }).parse(req.body);
    await assertBuildingInEditorSite(body.buildingId, siteId);
    res.status(201).json(
      await indoorGraphEditorService.ensureDraftMap(body.buildingId, siteId, req.user?.sub ?? null),
    );
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.post('/map-builder/indoor/graph/nodes', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    const body = graphNodeFromPlanSchema.parse(req.body);
    await assertBuildingInEditorSite(body.buildingId, siteId);
    res.status(201).json(
      await indoorGraphEditorService.createNodeFromPlan(siteId, body, req.user?.sub ?? null),
    );
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.put('/map-builder/indoor/graph/nodes/:id', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    const body = graphNodeMoveSchema.parse(req.body);
    res.json(await indoorGraphEditorService.moveNodeFromPlan(siteId, String(req.params.id), body));
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.delete('/map-builder/indoor/graph/nodes/:id', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    await indoorGraphEditorService.deleteNode(siteId, String(req.params.id));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.post('/map-builder/indoor/graph/edges', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    const body = graphEdgeCreateSchema.parse(req.body);
    await assertBuildingInEditorSite(body.buildingId, siteId);
    res.status(201).json(await indoorGraphEditorService.createEdge(siteId, body, req.user?.sub ?? null));
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.delete('/map-builder/indoor/graph/edges/:id', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    await indoorGraphEditorService.deleteEdge(siteId, String(req.params.id));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.post('/map-builder/indoor/graph/rooms/link', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    const body = graphRoomLinkSchema.parse(req.body);
    await assertBuildingInEditorSite(body.buildingId, siteId);
    res.status(201).json(await indoorGraphEditorService.linkRoom(siteId, body, req.user?.sub ?? null));
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.delete('/map-builder/indoor/graph/rooms/:roomId/link', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    const buildingId = z.string().uuid().parse(req.query.buildingId);
    const mapId = typeof req.query.mapId === 'string' ? req.query.mapId : undefined;
    await assertBuildingInEditorSite(buildingId, siteId);
    await indoorGraphEditorService.unlinkRoom(siteId, buildingId, String(req.params.roomId), mapId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.post('/map-builder/indoor/graph/handoffs', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    const body = graphHandoffSchema.parse(req.body);
    await assertBuildingInEditorSite(body.buildingId, siteId);
    res.status(201).json(await indoorGraphEditorService.createHandoff(siteId, body, req.user?.sub ?? null));
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.delete('/map-builder/indoor/graph/handoffs/:id', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    await indoorGraphEditorService.deleteHandoff(siteId, String(req.params.id));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

adminRouter.use(mapEditorRouter);

const platformAdminRouter = Router();
platformAdminRouter.use(requireRole('admin'));

platformAdminRouter.get('/weights', async (_req, res, next) => {
  try {
    res.json(await campusRepository.getWeights());
  } catch (err) {
    next(err);
  }
});

platformAdminRouter.put('/weights', async (req, res, next) => {
  try {
    const body = z
      .object({
        wDistance: z.number().min(0).max(1),
        wSafety: z.number().min(0).max(1),
        wCrowd: z.number().min(0).max(1),
        wAccessibility: z.number().min(0).max(1),
        wBlockedPenalty: z.number().min(1000),
      })
      .parse(req.body);
    res.json(await campusRepository.updateWeights(body));
  } catch (err) {
    next(err);
  }
});

platformAdminRouter.get('/danger-zones', async (req, res, next) => {
  try {
    const siteId = await resolveRequestSiteId(req);
    res.json(await campusRepository.listDangerZones(siteId));
  } catch (err) {
    next(err);
  }
});

platformAdminRouter.post('/danger-zones', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await resolveEditorSiteId(req);
    const body = z
      .object({
        name: z.string(),
        type: z.enum(['unsafe', 'poor_lighting', 'construction']),
        latitude: z.number(),
        longitude: z.number(),
        radiusM: z.number().positive(),
        description: z.string().nullable().optional(),
        active: z.boolean().default(true),
      })
      .parse(req.body);
    res.status(201).json(
      await campusRepository.createDangerZone({
        ...body,
        description: body.description ?? null,
        siteId,
      }),
    );
  } catch (err) {
    next(err);
  }
});

platformAdminRouter.put('/danger-zones/:id', async (req, res, next) => {
  try {
    const body = z
      .object({
        name: z.string().optional(),
        type: z.enum(['unsafe', 'poor_lighting', 'construction']).optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        radiusM: z.number().positive().optional(),
        description: z.string().nullable().optional(),
        active: z.boolean().optional(),
      })
      .parse(req.body);
    const updated = await campusRepository.updateDangerZone(String(req.params.id), body);
    if (!updated) return res.status(404).json({ code: 'NOT_FOUND', message: 'Zone not found' });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

platformAdminRouter.delete('/danger-zones/:id', async (req, res, next) => {
  try {
    await campusRepository.deleteDangerZone(String(req.params.id));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

platformAdminRouter.get('/crowd', async (req, res, next) => {
  try {
    const siteId = await resolveRequestSiteId(req);
    res.json(await campusRepository.listCrowdLevels(siteId));
  } catch (err) {
    next(err);
  }
});

platformAdminRouter.post('/crowd', async (req, res, next) => {
  try {
    const body = z
      .object({
        id: z.string().uuid().optional(),
        edgeId: z.string().uuid().nullable().optional(),
        nodeId: z.string().uuid().nullable().optional(),
        intensity: z.number().min(0).max(1),
        label: z.string().nullable().optional(),
      })
      .parse(req.body);
    res.status(201).json(await campusRepository.upsertCrowdLevel(body));
  } catch (err) {
    next(err);
  }
});

platformAdminRouter.delete('/crowd/:id', async (req, res, next) => {
  try {
    await campusRepository.deleteCrowdLevel(String(req.params.id));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

platformAdminRouter.get('/events', async (req, res, next) => {
  try {
    const siteId = await resolveRequestSiteId(req);
    res.json(await campusRepository.listEvents(siteId));
  } catch (err) {
    next(err);
  }
});

platformAdminRouter.post('/events', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await resolveEditorSiteId(req);
    const body = z
      .object({
        title: z.string(),
        description: z.string().nullable().optional(),
        latitude: z.number().nullable().optional(),
        longitude: z.number().nullable().optional(),
        startsAt: z.string(),
        endsAt: z.string(),
        affectsRouting: z.boolean().default(false),
        active: z.boolean().default(true),
      })
      .parse(req.body);
    const event = await campusRepository.createEvent({
      title: body.title,
      description: body.description ?? null,
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
      startsAt: body.startsAt,
      endsAt: body.endsAt,
      affectsRouting: body.affectsRouting,
      active: body.active,
      siteId,
    });
    await notificationRepository.create({
      type: 'event_alert',
      title: event.title,
      body: event.description ?? 'New campus event',
    });
    res.status(201).json(event);
  } catch (err) {
    next(err);
  }
});

platformAdminRouter.put('/events/:id', async (req, res, next) => {
  try {
    const body = z
      .object({
        title: z.string().optional(),
        description: z.string().nullable().optional(),
        latitude: z.number().nullable().optional(),
        longitude: z.number().nullable().optional(),
        startsAt: z.string().optional(),
        endsAt: z.string().optional(),
        affectsRouting: z.boolean().optional(),
        active: z.boolean().optional(),
      })
      .parse(req.body);
    const updated = await campusRepository.updateEvent(String(req.params.id), body);
    if (!updated) return res.status(404).json({ code: 'NOT_FOUND', message: 'Event not found' });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

platformAdminRouter.delete('/events/:id', async (req, res, next) => {
  try {
    await campusRepository.deleteEvent(String(req.params.id));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

adminRouter.use(platformAdminRouter);

export const analyticsRouter = Router();

analyticsRouter.get('/summary', requireAuth, requireRole('admin'), async (_req, res, next) => {
  try {
    res.json(await analyticsRepository.summary());
  } catch (err) {
    next(err);
  }
});

analyticsRouter.get('/searches', requireAuth, requireRole('admin'), async (_req, res, next) => {
  try {
    const summary = await analyticsRepository.summary();
    res.json(summary.topSearches);
  } catch (err) {
    next(err);
  }
});

analyticsRouter.get(
  '/popular-routes',
  requireAuth,
  requireRole('admin'),
  async (_req, res, next) => {
    try {
      const summary = await analyticsRepository.summary();
      res.json(summary.popularRoutes);
    } catch (err) {
      next(err);
    }
  },
);
