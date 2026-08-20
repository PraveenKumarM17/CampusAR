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
import { optionalAuth, requireAuth, requireRole, type AuthedRequest } from '../middleware/auth';

export const indoorRouter = Router();

indoorRouter.get('/maps', optionalAuth, async (req, res, next) => {
  try {
    const buildingId = typeof req.query.buildingId === 'string' ? req.query.buildingId : undefined;
    const maps = await indoorRepository.listMaps(buildingId);
    const admin = (req as AuthedRequest).user?.role === 'admin';
    res.json(admin ? maps : maps.filter((m) => m.status === 'published'));
  } catch (err) {
    next(err);
  }
});

indoorRouter.post('/maps', requireAuth, requireRole('admin'), async (req: AuthedRequest, res, next) => {
  try {
    const body = createMapSchema.parse(req.body);
    res.status(201).json(await indoorService.createMap(body, req.user?.sub ?? null));
  } catch (err) {
    next(err);
  }
});

indoorRouter.get('/maps/:id', optionalAuth, async (req: AuthedRequest, res, next) => {
  try {
    const admin = req.user?.role === 'admin';
    res.json(await indoorService.getBundle(String(req.params.id), admin));
  } catch (err) {
    next(err);
  }
});

indoorRouter.put('/maps/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const body = updateMapSchema.parse(req.body);
    res.json(await indoorService.updateMap(String(req.params.id), body));
  } catch (err) {
    next(err);
  }
});

indoorRouter.post('/nodes', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const body = createNodeSchema.parse(req.body);
    res.status(201).json(await indoorService.createNode(body));
  } catch (err) {
    next(err);
  }
});

indoorRouter.put('/nodes/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const body = updateNodeSchema.parse(req.body);
    res.json(await indoorService.updateNode(String(req.params.id), body));
  } catch (err) {
    next(err);
  }
});

indoorRouter.delete('/nodes/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    await indoorService.deleteNode(String(req.params.id));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

indoorRouter.post('/edges', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const body = createEdgeSchema.parse(req.body);
    res.status(201).json(await indoorService.createEdge(body));
  } catch (err) {
    next(err);
  }
});

indoorRouter.put('/edges/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const body = updateEdgeSchema.parse(req.body);
    res.json(await indoorService.updateEdge(String(req.params.id), body));
  } catch (err) {
    next(err);
  }
});

indoorRouter.delete('/edges/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    await indoorService.deleteEdge(String(req.params.id));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

indoorRouter.post('/places', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const body = createPlaceSchema.parse(req.body);
    res.status(201).json(await indoorService.createPlace(body));
  } catch (err) {
    next(err);
  }
});

indoorRouter.get('/buildings/:buildingId/context', optionalAuth, async (req, res, next) => {
  try {
    const buildingId = z.string().uuid().parse(req.params.buildingId);
    res.json(await indoorService.getBuildingContext(buildingId));
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

indoorRouter.put('/places/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const body = updatePlaceSchema.parse(req.body);
    res.json(await indoorService.updatePlace(String(req.params.id), body));
  } catch (err) {
    next(err);
  }
});

indoorRouter.post('/anchors', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const body = createAnchorSchema.parse(req.body);
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

indoorRouter.post('/handoffs', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const body = createHandoffSchema.parse(req.body);
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
