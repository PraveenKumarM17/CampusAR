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
import { validateMapVersion } from '../../../application/mapVersionValidationService';
import { mapVersionPublishService } from '../../../application/mapVersionPublishService';
import { mapVersionDiffService } from '../../../application/mapVersionDiffService';
import {
  graphEdgeCreateSchema,
  graphHandoffSchema,
  graphNodeFromPlanSchema,
  graphNodeMoveSchema,
  graphRoomLinkSchema,
  indoorGraphEditorService,
} from '../../../application/indoorGraphEditorService';
import { floorLayoutRepository } from '../../../infrastructure/repositories/floorLayoutRepository';
import { mapVersionService } from '../../../application/mapVersionService';
import { resolveEditorDraftMapVersion } from '../../../application/mapVersionContext';
import { assertDraftWritable } from '../../../application/mapVersionGuard';
import { AppError } from '../../../domain/errors';
import { haversineMeters } from '../../../domain/routing/astar';
import { mapVersionPreviewRouter } from './mapVersionPreviewRoutes';

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

mapEditorRouter.use('/map-builder/preview/:versionId', mapVersionPreviewRouter);

async function editorSiteStrict(req: AuthedRequest): Promise<string> {
  return resolveEditorSiteId(req);
}

async function editorDraftContext(req: AuthedRequest) {
  const siteId = await editorSiteStrict(req);
  const draft = await resolveEditorDraftMapVersion(siteId, req.user?.sub ?? null);
  const published = await mapVersionService.getPublishedVersion(siteId);
  return {
    siteId,
    draftVersionId: draft.id,
    publishedVersionId: published.id,
    draft,
  };
}

mapEditorRouter.get('/map-builder/versions', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    res.json(await mapVersionService.listVersions(siteId));
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.get('/map-builder/versions/:id', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    res.json(await mapVersionService.getVersion(siteId, String(req.params.id)));
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.post('/map-builder/draft', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    const before = await mapVersionService.getDraftVersion(siteId);
    const draft = await mapVersionService.getOrCreateDraftVersion(siteId, req.user?.sub ?? null);
    res.status(before ? 200 : 201).json(draft);
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.get('/map-builder/snapshot', async (req: AuthedRequest, res, next) => {
  try {
    const ctx = await editorDraftContext(req);
    const [buildings, nodes, edges, areas] = await Promise.all([
      campusRepository.listBuildings(ctx.siteId, ctx.draftVersionId),
      campusRepository.listActiveNodes(ctx.siteId, ctx.draftVersionId),
      campusRepository.listEdges(ctx.siteId, ctx.draftVersionId),
      siteAreaRepository.listBySite(ctx.siteId, ctx.draftVersionId),
    ]);
    res.json({
      siteId: ctx.siteId,
      version: ctx.draft,
      buildings,
      nodes,
      edges,
      areas,
    });
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.get('/map-builder/versions/:versionId/validate', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    const versionId = String(req.params.versionId);
    const version = await mapVersionService.getVersion(siteId, versionId);
    if (version.status !== 'draft') {
      throw new AppError(
        'VALIDATION_DRAFT_ONLY',
        'Only draft map versions can be validated through this workflow',
        422,
      );
    }
    res.json(await validateMapVersion(siteId, version));
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.get('/map-builder/versions/:versionId/diff', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    const versionId = String(req.params.versionId);
    const version = await mapVersionService.getVersion(siteId, versionId);
    const baseVersionId = version.basedOnVersionId;
    res.json(await mapVersionDiffService.computeDiff(version.id, baseVersionId));
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.get('/map-builder/history', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    res.json(await mapVersionService.listPublishHistory(siteId));
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.post('/map-builder/versions/:versionId/rollback', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    const sourceVersionId = String(req.params.versionId);
    res.status(201).json(await mapVersionService.rollbackToVersion(siteId, sourceVersionId, req.user?.sub ?? null));
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.post('/map-builder/versions/:versionId/publish', async (req: AuthedRequest, res, next) => {
  try {
    const siteId = await editorSiteStrict(req);
    const versionId = String(req.params.versionId);
    await mapVersionService.getVersion(siteId, versionId);
    const result = await mapVersionPublishService.publishDraft(
      siteId,
      versionId,
      req.user?.sub ?? null,
    );
    if (!result.published) {
      return res.status(409).json(result);
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.get('/map-builder/validate', async (req: AuthedRequest, res, next) => {
  try {
    const ctx = await editorDraftContext(req);
    res.json(await validateSiteMap(ctx.siteId, ctx.draftVersionId));
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.post('/buildings', async (req: AuthedRequest, res, next) => {
  try {
    const ctx = await editorDraftContext(req);
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
        siteId: ctx.siteId,
        mapVersionId: ctx.draftVersionId,
      }),
    );
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.put('/buildings/:id', async (req: AuthedRequest, res, next) => {
  try {
    const ctx = await editorDraftContext(req);
    const id = String(req.params.id);
    const existing = await campusRepository.getBuildingById(id);
    if (!existing) return res.status(404).json({ code: 'NOT_FOUND', message: 'Building not found' });
    await assertResourceInSite(existing.siteId, ctx.siteId, 'Building');
    assertDraftWritable(
      await campusRepository.getBuildingMapVersionId(id),
      ctx.draftVersionId,
      ctx.publishedVersionId,
      'Building',
    );
    const body = z
      .object({
        name: z.string().min(1).optional(),
        code: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        floorsCount: z.number().int().positive().optional(),
        floorHeightM: z.number().positive().max(20).optional(),
        footprint: footprintSchema.nullable().optional(),
        expectedUpdatedAt: z.string().datetime().optional(),
      })
      .parse(req.body);
    const updated = await campusRepository.updateBuilding(id, {
      name: body.name,
      code: body.code,
      description: body.description,
      floorsCount: body.floorsCount,
      floorHeightM: body.floorHeightM,
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
    const ctx = await editorDraftContext(req);
    const id = String(req.params.id);
    assertDraftWritable(
      await campusRepository.getBuildingMapVersionId(id),
      ctx.draftVersionId,
      ctx.publishedVersionId,
      'Building',
    );
    await campusRepository.deleteBuildingSafe(id, ctx.siteId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.get('/paths/nodes', async (req, res, next) => {
  try {
    const ctx = await editorDraftContext(req as AuthedRequest);
    res.json(await campusRepository.listNodes(ctx.siteId, ctx.draftVersionId));
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.post('/paths/nodes', async (req: AuthedRequest, res, next) => {
  try {
    const ctx = await editorDraftContext(req);
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
      await assertResourceInSite(building.siteId, ctx.siteId, 'Building');
      assertDraftWritable(
        await campusRepository.getBuildingMapVersionId(body.buildingId),
        ctx.draftVersionId,
        ctx.publishedVersionId,
        'Building',
      );
    }
    res.status(201).json(
      await campusRepository.createNode({
        name: body.name ?? null,
        latitude: body.latitude,
        longitude: body.longitude,
        floorId: body.floorId ?? null,
        buildingId: body.buildingId ?? null,
        kind: body.kind,
        siteId: ctx.siteId,
        mapVersionId: ctx.draftVersionId,
      }),
    );
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.put('/paths/nodes/:id', async (req: AuthedRequest, res, next) => {
  try {
    const ctx = await editorDraftContext(req);
    const id = String(req.params.id);
    const existing = await campusRepository.getNodeById(id);
    if (!existing) return res.status(404).json({ code: 'NOT_FOUND', message: 'Node not found' });
    await assertResourceInSite(existing.siteId, ctx.siteId, 'Node');
    assertDraftWritable(
      await campusRepository.getNodeMapVersionId(id),
      ctx.draftVersionId,
      ctx.publishedVersionId,
      'Node',
    );
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
      await assertResourceInSite(building.siteId, ctx.siteId, 'Building');
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
    const ctx = await editorDraftContext(req);
    const id = String(req.params.id);
    assertDraftWritable(
      await campusRepository.getNodeMapVersionId(id),
      ctx.draftVersionId,
      ctx.publishedVersionId,
      'Node',
    );
    const cascade = req.query.cascade === 'true';
    await campusRepository.deleteNodeSafe(id, ctx.siteId, cascade);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.get('/paths/edges', async (req, res, next) => {
  try {
    const ctx = await editorDraftContext(req as AuthedRequest);
    res.json(await campusRepository.listEdges(ctx.siteId, ctx.draftVersionId));
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.post('/paths/edges', async (req: AuthedRequest, res, next) => {
  try {
    const ctx = await editorDraftContext(req);
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
    await assertResourceInSite(from.siteId, ctx.siteId, 'Start node');
    await assertResourceInSite(to.siteId, ctx.siteId, 'End node');
    const distanceM =
      body.distanceM ??
      haversineMeters(from.latitude, from.longitude, to.latitude, to.longitude);
    const edge = await campusRepository.createEdge({ ...body, distanceM, mapVersionId: ctx.draftVersionId });
    res.status(201).json(edge);
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.put('/paths/edges/:id', async (req: AuthedRequest, res, next) => {
  try {
    const ctx = await editorDraftContext(req);
    const id = String(req.params.id);
    const existing = await campusRepository.getEdgeById(id);
    if (!existing) return res.status(404).json({ code: 'NOT_FOUND', message: 'Edge not found' });
    await assertResourceInSite(existing.siteId, ctx.siteId, 'Edge');
    assertDraftWritable(
      await campusRepository.getEdgeMapVersionId(id),
      ctx.draftVersionId,
      ctx.publishedVersionId,
      'Edge',
    );
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
    const ctx = await editorDraftContext(req);
    const id = String(req.params.id);
    const existing = await campusRepository.getEdgeById(id);
    if (!existing) return res.status(404).json({ code: 'NOT_FOUND', message: 'Edge not found' });
    await assertResourceInSite(existing.siteId, ctx.siteId, 'Edge');
    assertDraftWritable(
      await campusRepository.getEdgeMapVersionId(id),
      ctx.draftVersionId,
      ctx.publishedVersionId,
      'Edge',
    );
    await campusRepository.deleteEdge(id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.get('/areas', async (req: AuthedRequest, res, next) => {
  try {
    const ctx = await editorDraftContext(req);
    res.json(await siteAreaRepository.listBySite(ctx.siteId, ctx.draftVersionId));
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.post('/areas', async (req: AuthedRequest, res, next) => {
  try {
    const ctx = await editorDraftContext(req);
    const body = z
      .object({
        name: z.string().min(1),
        type: z.enum(['parking', 'open_area', 'restricted', 'assembly']),
        footprint: footprintSchema,
      })
      .parse(req.body);
    res.status(201).json(
      await siteAreaRepository.create({
        siteId: ctx.siteId,
        mapVersionId: ctx.draftVersionId,
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
    const ctx = await editorDraftContext(req);
    const id = String(req.params.id);
    const existing = await siteAreaRepository.getById(id);
    if (!existing) return res.status(404).json({ code: 'NOT_FOUND', message: 'Area not found' });
    await assertResourceInSite(existing.siteId, ctx.siteId, 'Area');
    assertDraftWritable(
      await siteAreaRepository.getMapVersionId(id),
      ctx.draftVersionId,
      ctx.publishedVersionId,
      'Area',
    );
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
    const ctx = await editorDraftContext(req);
    const id = String(req.params.id);
    const existing = await siteAreaRepository.getById(id);
    if (!existing) return res.status(404).json({ code: 'NOT_FOUND', message: 'Area not found' });
    await assertResourceInSite(existing.siteId, ctx.siteId, 'Area');
    assertDraftWritable(
      await siteAreaRepository.getMapVersionId(id),
      ctx.draftVersionId,
      ctx.publishedVersionId,
      'Area',
    );
    await siteAreaRepository.delete(id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.get('/map-builder/indoor/snapshot', async (req: AuthedRequest, res, next) => {
  try {
    const ctx = await editorDraftContext(req);
    const buildingId = z.string().uuid().parse(req.query.buildingId);
    await assertBuildingInEditorSite(buildingId, ctx.siteId);
    res.json(await floorLayoutRepository.loadSnapshot(buildingId, ctx.siteId, ctx.draftVersionId));
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.get('/map-builder/indoor/validate', async (req: AuthedRequest, res, next) => {
  try {
    const ctx = await editorDraftContext(req);
    const buildingId = z.string().uuid().parse(req.query.buildingId);
    await assertBuildingInEditorSite(buildingId, ctx.siteId);
    res.json(await validateIndoorLayout(buildingId, ctx.siteId, ctx.draftVersionId));
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.post('/map-builder/indoor/floors', async (req: AuthedRequest, res, next) => {
  try {
    const ctx = await editorDraftContext(req);
    const body = z
      .object({
        buildingId: z.string().uuid(),
        level: z.number().int(),
        name: z.string().min(1),
      })
      .parse(req.body);
    await assertBuildingInEditorSite(body.buildingId, ctx.siteId);
    assertDraftWritable(
      await campusRepository.getBuildingMapVersionId(body.buildingId),
      ctx.draftVersionId,
      ctx.publishedVersionId,
      'Building',
    );
    try {
      res.status(201).json(
        await floorLayoutRepository.createFloor({ ...body, mapVersionId: ctx.draftVersionId }),
      );
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
    const ctx = await editorDraftContext(req);
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
    await assertBuildingInEditorSite(body.buildingId, ctx.siteId);
    res.status(201).json(
      await floorLayoutRepository.createRoom({ ...body, mapVersionId: ctx.draftVersionId }),
    );
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
    const ctx = await editorDraftContext(req);
    const body = z
      .object({
        buildingId: z.string().uuid(),
        floorId: z.string().uuid(),
        name: z.string().nullable().optional(),
        category: z.string().optional(),
        localGeometry: localPolygonSchema,
      })
      .parse(req.body);
    await assertBuildingInEditorSite(body.buildingId, ctx.siteId);
    res.status(201).json(
      await floorLayoutRepository.createCorridor({ ...body, mapVersionId: ctx.draftVersionId }),
    );
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
    const ctx = await editorDraftContext(req);
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
    await assertBuildingInEditorSite(body.buildingId, ctx.siteId);
    res.status(201).json(
      await floorLayoutRepository.createPoi({ ...body, mapVersionId: ctx.draftVersionId }),
    );
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
    const ctx = await editorDraftContext(req);
    const buildingId = z.string().uuid().parse(req.query.buildingId);
    await assertBuildingInEditorSite(buildingId, ctx.siteId);
    res.json(
      await indoorGraphEditorService.loadGraphSnapshot(buildingId, ctx.siteId, {
        draftVersionId: ctx.draftVersionId,
        publishedVersionId: ctx.publishedVersionId,
      }),
    );
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.post('/map-builder/indoor/graph/ensure-map', async (req: AuthedRequest, res, next) => {
  try {
    const ctx = await editorDraftContext(req);
    const body = z.object({ buildingId: z.string().uuid() }).parse(req.body);
    await assertBuildingInEditorSite(body.buildingId, ctx.siteId);
    res.status(201).json(
      await indoorGraphEditorService.ensureDraftMap(
        body.buildingId,
        ctx.siteId,
        req.user?.sub ?? null,
        ctx.draftVersionId,
      ),
    );
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.post('/map-builder/indoor/graph/nodes', async (req: AuthedRequest, res, next) => {
  try {
    const ctx = await editorDraftContext(req);
    const body = graphNodeFromPlanSchema.parse(req.body);
    await assertBuildingInEditorSite(body.buildingId, ctx.siteId);
    const versions = {
      draftVersionId: ctx.draftVersionId,
      publishedVersionId: ctx.publishedVersionId,
    };
    res.status(201).json(
      await indoorGraphEditorService.createNodeFromPlan(
        ctx.siteId,
        body,
        req.user?.sub ?? null,
        versions,
      ),
    );
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.put('/map-builder/indoor/graph/nodes/:id', async (req: AuthedRequest, res, next) => {
  try {
    const ctx = await editorDraftContext(req);
    const body = graphNodeMoveSchema.parse(req.body);
    const versions = {
      draftVersionId: ctx.draftVersionId,
      publishedVersionId: ctx.publishedVersionId,
    };
    res.json(
      await indoorGraphEditorService.moveNodeFromPlan(ctx.siteId, String(req.params.id), body, versions),
    );
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.delete('/map-builder/indoor/graph/nodes/:id', async (req: AuthedRequest, res, next) => {
  try {
    const ctx = await editorDraftContext(req);
    const versions = {
      draftVersionId: ctx.draftVersionId,
      publishedVersionId: ctx.publishedVersionId,
    };
    await indoorGraphEditorService.deleteNode(ctx.siteId, String(req.params.id), versions);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.post('/map-builder/indoor/graph/edges', async (req: AuthedRequest, res, next) => {
  try {
    const ctx = await editorDraftContext(req);
    const body = graphEdgeCreateSchema.parse(req.body);
    await assertBuildingInEditorSite(body.buildingId, ctx.siteId);
    const versions = {
      draftVersionId: ctx.draftVersionId,
      publishedVersionId: ctx.publishedVersionId,
    };
    res.status(201).json(
      await indoorGraphEditorService.createEdge(ctx.siteId, body, req.user?.sub ?? null, versions),
    );
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.delete('/map-builder/indoor/graph/edges/:id', async (req: AuthedRequest, res, next) => {
  try {
    const ctx = await editorDraftContext(req);
    const versions = {
      draftVersionId: ctx.draftVersionId,
      publishedVersionId: ctx.publishedVersionId,
    };
    await indoorGraphEditorService.deleteEdge(ctx.siteId, String(req.params.id), versions);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.post('/map-builder/indoor/graph/rooms/link', async (req: AuthedRequest, res, next) => {
  try {
    const ctx = await editorDraftContext(req);
    const body = graphRoomLinkSchema.parse(req.body);
    await assertBuildingInEditorSite(body.buildingId, ctx.siteId);
    const versions = {
      draftVersionId: ctx.draftVersionId,
      publishedVersionId: ctx.publishedVersionId,
    };
    res.status(201).json(
      await indoorGraphEditorService.linkRoom(ctx.siteId, body, req.user?.sub ?? null, versions),
    );
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.delete('/map-builder/indoor/graph/rooms/:roomId/link', async (req: AuthedRequest, res, next) => {
  try {
    const ctx = await editorDraftContext(req);
    const buildingId = z.string().uuid().parse(req.query.buildingId);
    const mapId = typeof req.query.mapId === 'string' ? req.query.mapId : undefined;
    await assertBuildingInEditorSite(buildingId, ctx.siteId);
    const versions = {
      draftVersionId: ctx.draftVersionId,
      publishedVersionId: ctx.publishedVersionId,
    };
    await indoorGraphEditorService.unlinkRoom(
      ctx.siteId,
      buildingId,
      String(req.params.roomId),
      versions,
      mapId,
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.post('/map-builder/indoor/graph/handoffs', async (req: AuthedRequest, res, next) => {
  try {
    const ctx = await editorDraftContext(req);
    const body = graphHandoffSchema.parse(req.body);
    await assertBuildingInEditorSite(body.buildingId, ctx.siteId);
    const versions = {
      draftVersionId: ctx.draftVersionId,
      publishedVersionId: ctx.publishedVersionId,
    };
    res.status(201).json(
      await indoorGraphEditorService.createHandoff(ctx.siteId, body, req.user?.sub ?? null, versions),
    );
  } catch (err) {
    next(err);
  }
});

mapEditorRouter.delete('/map-builder/indoor/graph/handoffs/:id', async (req: AuthedRequest, res, next) => {
  try {
    const ctx = await editorDraftContext(req);
    const versions = {
      draftVersionId: ctx.draftVersionId,
      publishedVersionId: ctx.publishedVersionId,
    };
    await indoorGraphEditorService.deleteHandoff(ctx.siteId, String(req.params.id), versions);
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
