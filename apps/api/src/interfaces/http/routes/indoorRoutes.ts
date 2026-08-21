import { Router } from 'express';
import { z } from 'zod';
import { indoorRepository } from '../../../infrastructure/repositories/indoorRepository';
import {
  createAnchorSchema,
  createEdgeSchema,
  createHandoffSchema,
  createMapSchema,
  createNodeSchema,
  createPlaceSchema,
  indoorRouteSchema,
  indoorService,
  updateEdgeSchema,
  updateMapSchema,
  updateNodeSchema,
  updatePlaceSchema,
} from '../../../application/indoorService';
import {
  assertIndoorBuildingEditable,
  assertIndoorEdgeEditable,
  assertIndoorMapEditable,
  assertIndoorNodeEditable,
  assertIndoorPlaceEditable,
  canViewIndoorDrafts,
} from '../../../application/indoorEditorGuard';
import { optionalAuth, requireAuth, type AuthedRequest } from '../middleware/auth';
import { requireMapEditor } from '../middleware/mapEditorAuth';
import { resolveRequestSiteId } from '../../../application/siteContext';

export const indoorRouter = Router();

indoorRouter.get('/maps', optionalAuth, async (req, res, next) => {
  try {
    const buildingId = typeof req.query.buildingId === 'string' ? req.query.buildingId : undefined;
    const maps = await indoorRepository.listMaps(buildingId);
    const admin = canViewIndoorDrafts(req as AuthedRequest);
    res.json(admin ? maps : maps.filter((m) => m.status === 'published'));
  } catch (err) {
    next(err);
  }
});

indoorRouter.post('/maps', requireAuth, requireMapEditor, async (req: AuthedRequest, res, next) => {
  try {
    const body = createMapSchema.parse(req.body);
    await assertIndoorBuildingEditable(req, body.buildingId);
    res.status(201).json(await indoorService.createMap(body, req.user?.sub ?? null));
  } catch (err) {
    next(err);
  }
});

indoorRouter.get('/maps/:id', optionalAuth, async (req: AuthedRequest, res, next) => {
  try {
    const admin = canViewIndoorDrafts(req);
    res.json(await indoorService.getBundle(String(req.params.id), admin));
  } catch (err) {
    next(err);
  }
});

indoorRouter.put('/maps/:id', requireAuth, requireMapEditor, async (req: AuthedRequest, res, next) => {
  try {
    const body = updateMapSchema.parse(req.body);
    await assertIndoorMapEditable(req, String(req.params.id));
    res.json(await indoorService.updateMap(String(req.params.id), body));
  } catch (err) {
    next(err);
  }
});

indoorRouter.post('/nodes', requireAuth, requireMapEditor, async (req: AuthedRequest, res, next) => {
  try {
    const body = createNodeSchema.parse(req.body);
    await assertIndoorMapEditable(req, body.mapId);
    res.status(201).json(await indoorService.createNode(body));
  } catch (err) {
    next(err);
  }
});

indoorRouter.put('/nodes/:id', requireAuth, requireMapEditor, async (req: AuthedRequest, res, next) => {
  try {
    const body = updateNodeSchema.parse(req.body);
    await assertIndoorNodeEditable(req, String(req.params.id));
    res.json(await indoorService.updateNode(String(req.params.id), body));
  } catch (err) {
    next(err);
  }
});

indoorRouter.delete('/nodes/:id', requireAuth, requireMapEditor, async (req: AuthedRequest, res, next) => {
  try {
    await assertIndoorNodeEditable(req, String(req.params.id));
    await indoorService.deleteNode(String(req.params.id));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

indoorRouter.post('/edges', requireAuth, requireMapEditor, async (req: AuthedRequest, res, next) => {
  try {
    const body = createEdgeSchema.parse(req.body);
    await assertIndoorMapEditable(req, body.mapId);
    res.status(201).json(await indoorService.createEdge(body));
  } catch (err) {
    next(err);
  }
});

indoorRouter.put('/edges/:id', requireAuth, requireMapEditor, async (req: AuthedRequest, res, next) => {
  try {
    const body = updateEdgeSchema.parse(req.body);
    await assertIndoorEdgeEditable(req, String(req.params.id));
    res.json(await indoorService.updateEdge(String(req.params.id), body));
  } catch (err) {
    next(err);
  }
});

indoorRouter.delete('/edges/:id', requireAuth, requireMapEditor, async (req: AuthedRequest, res, next) => {
  try {
    await assertIndoorEdgeEditable(req, String(req.params.id));
    await indoorService.deleteEdge(String(req.params.id));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

indoorRouter.post('/places', requireAuth, requireMapEditor, async (req: AuthedRequest, res, next) => {
  try {
    const body = createPlaceSchema.parse(req.body);
    await assertIndoorMapEditable(req, body.mapId);
    res.status(201).json(await indoorService.createPlace(body));
  } catch (err) {
    next(err);
  }
});

indoorRouter.get('/buildings/:buildingId/context', optionalAuth, async (req, res, next) => {
  try {
    const buildingId = z.string().uuid().parse(req.params.buildingId);
    const siteId = await resolveRequestSiteId(req);
    res.json(await indoorService.getBuildingContext(buildingId, siteId ?? undefined));
  } catch (err) {
    next(err);
  }
});

indoorRouter.get('/places/search', optionalAuth, async (req, res, next) => {
  try {
    const q = z.string().min(1).parse(req.query.q);
    const buildingId = typeof req.query.buildingId === 'string' ? req.query.buildingId : undefined;
    if (buildingId) z.string().uuid().parse(buildingId);
    res.json(await indoorService.searchPublicPlaces(q, buildingId));
  } catch (err) {
    next(err);
  }
});

indoorRouter.get('/places', optionalAuth, async (req, res, next) => {
  try {
    const buildingId = z.string().uuid().parse(req.query.buildingId);
    res.json(await indoorService.listPublicPlaces(buildingId));
  } catch (err) {
    next(err);
  }
});

indoorRouter.get('/places/:id', optionalAuth, async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const expectedBuildingId =
      typeof req.query.buildingId === 'string' ? z.string().uuid().parse(req.query.buildingId) : undefined;
    res.json(await indoorService.getPublicPlace(id, expectedBuildingId));
  } catch (err) {
    next(err);
  }
});

indoorRouter.put('/places/:id', requireAuth, requireMapEditor, async (req: AuthedRequest, res, next) => {
  try {
    const body = updatePlaceSchema.parse(req.body);
    await assertIndoorPlaceEditable(req, String(req.params.id));
    res.json(await indoorService.updatePlace(String(req.params.id), body));
  } catch (err) {
    next(err);
  }
});

indoorRouter.post('/anchors', requireAuth, requireMapEditor, async (req: AuthedRequest, res, next) => {
  try {
    const body = createAnchorSchema.parse(req.body);
    await assertIndoorMapEditable(req, body.mapId);
    res.status(201).json(await indoorService.createAnchor(body));
  } catch (err) {
    next(err);
  }
});

indoorRouter.get('/anchors/:code', optionalAuth, async (req, res, next) => {
  try {
    const expectedBuildingId =
      typeof req.query.buildingId === 'string' ? z.string().uuid().parse(req.query.buildingId) : undefined;
    res.json(await indoorService.resolveAnchor(String(req.params.code), expectedBuildingId));
  } catch (err) {
    next(err);
  }
});

indoorRouter.post('/handoffs', requireAuth, requireMapEditor, async (req: AuthedRequest, res, next) => {
  try {
    const body = createHandoffSchema.parse(req.body);
    const indoor = await indoorRepository.getNode(body.indoorNodeId);
    if (indoor) await assertIndoorBuildingEditable(req, indoor.buildingId);
    res.status(201).json(await indoorService.createHandoff(body));
  } catch (err) {
    next(err);
  }
});

indoorRouter.get('/handoffs', optionalAuth, async (req, res, next) => {
  try {
    const outdoorNodeId = z.string().uuid().parse(req.query.outdoorNodeId);
    const handoff = await indoorRepository.getHandoffByOutdoorNode(outdoorNodeId);
    res.json(handoff);
  } catch (err) {
    next(err);
  }
});

indoorRouter.post('/route', optionalAuth, async (req, res, next) => {
  try {
    const body = indoorRouteSchema.parse(req.body);
    res.json(await indoorService.route(body));
  } catch (err) {
    next(err);
  }
});
