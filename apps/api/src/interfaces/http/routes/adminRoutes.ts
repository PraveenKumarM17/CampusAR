import { Router } from 'express';
import { z } from 'zod';
import { analyticsRepository } from '../../../infrastructure/repositories/analyticsRepository';
import { campusRepository } from '../../../infrastructure/repositories/campusRepository';
import { notificationRepository } from '../../../infrastructure/repositories/analyticsRepository';
import { requireAuth, requireRole } from '../middleware/auth';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('admin'));

adminRouter.get('/weights', async (_req, res, next) => {
  try {
    res.json(await campusRepository.getWeights());
  } catch (err) {
    next(err);
  }
});

adminRouter.put('/weights', async (req, res, next) => {
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

adminRouter.post('/buildings', async (req, res, next) => {
  try {
    const body = z
      .object({
        name: z.string(),
        code: z.string(),
        description: z.string().nullable().optional(),
        latitude: z.number(),
        longitude: z.number(),
        floorsCount: z.number().int().positive(),
      })
      .parse(req.body);
    res.status(201).json(
      await campusRepository.createBuilding({
        ...body,
        description: body.description ?? null,
      }),
    );
  } catch (err) {
    next(err);
  }
});

adminRouter.put('/buildings/:id', async (req, res, next) => {
  try {
    const body = z
      .object({
        name: z.string().optional(),
        code: z.string().optional(),
        description: z.string().nullable().optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        floorsCount: z.number().int().positive().optional(),
      })
      .parse(req.body);
    const updated = await campusRepository.updateBuilding(String(req.params.id), body);
    if (!updated) return res.status(404).json({ code: 'NOT_FOUND', message: 'Building not found' });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

adminRouter.delete('/buildings/:id', async (req, res, next) => {
  try {
    await campusRepository.deleteBuilding(String(req.params.id));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/paths/nodes', async (_req, res, next) => {
  try {
    res.json(await campusRepository.listNodes());
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/paths/nodes', async (req, res, next) => {
  try {
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
    res.status(201).json(
      await campusRepository.createNode({
        name: body.name ?? null,
        latitude: body.latitude,
        longitude: body.longitude,
        floorId: body.floorId ?? null,
        buildingId: body.buildingId ?? null,
        kind: body.kind,
      }),
    );
  } catch (err) {
    next(err);
  }
});

adminRouter.put('/paths/nodes/:id', async (req, res, next) => {
  try {
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
    const updated = await campusRepository.updateNode(String(req.params.id), body);
    if (!updated) return res.status(404).json({ code: 'NOT_FOUND', message: 'Node not found' });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

adminRouter.delete('/paths/nodes/:id', async (req, res, next) => {
  try {
    await campusRepository.deleteNode(String(req.params.id));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/paths/edges', async (_req, res, next) => {
  try {
    res.json(await campusRepository.listEdges());
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/paths/edges', async (req, res, next) => {
  try {
    const body = z
      .object({
        fromNodeId: z.string().uuid(),
        toNodeId: z.string().uuid(),
        distanceM: z.number().positive(),
        kind: z.enum(['walkway', 'stairs', 'elevator', 'ramp', 'corridor']),
        bidirectional: z.boolean().default(true),
        blocked: z.boolean().default(false),
        safetyScore: z.number().min(0).max(1).default(0.9),
        crowdScore: z.number().min(0).max(1).default(0.2),
        accessibilityScore: z.number().min(0).max(1).default(0.9),
      })
      .parse(req.body);
    const edge = await campusRepository.createEdge(body);
    if (body.blocked) {
      await notificationRepository.create({
        type: 'road_closed',
        title: 'Path updated',
        body: `Edge ${edge.id} created as blocked`,
      });
    }
    res.status(201).json(edge);
  } catch (err) {
    next(err);
  }
});

adminRouter.put('/paths/edges/:id', async (req, res, next) => {
  try {
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
    const updated = await campusRepository.updateEdge(String(req.params.id), body);
    if (!updated) return res.status(404).json({ code: 'NOT_FOUND', message: 'Edge not found' });
    if (body.blocked === true) {
      await notificationRepository.create({
        type: 'road_closed',
        title: 'Road closed',
        body: `Path segment ${updated.id} is now blocked`,
      });
    }
    if (body.blocked === false) {
      await notificationRepository.create({
        type: 'route_updated',
        title: 'Route updated',
        body: `Path segment ${updated.id} is open again`,
      });
    }
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

adminRouter.delete('/paths/edges/:id', async (req, res, next) => {
  try {
    await campusRepository.deleteEdge(String(req.params.id));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/danger-zones', async (_req, res, next) => {
  try {
    res.json(await campusRepository.listDangerZones());
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/danger-zones', async (req, res, next) => {
  try {
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
      }),
    );
  } catch (err) {
    next(err);
  }
});

adminRouter.put('/danger-zones/:id', async (req, res, next) => {
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

adminRouter.delete('/danger-zones/:id', async (req, res, next) => {
  try {
    await campusRepository.deleteDangerZone(String(req.params.id));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/crowd', async (_req, res, next) => {
  try {
    res.json(await campusRepository.listCrowdLevels());
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/crowd', async (req, res, next) => {
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

adminRouter.delete('/crowd/:id', async (req, res, next) => {
  try {
    await campusRepository.deleteCrowdLevel(String(req.params.id));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/events', async (_req, res, next) => {
  try {
    res.json(await campusRepository.listEvents());
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/events', async (req, res, next) => {
  try {
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

adminRouter.put('/events/:id', async (req, res, next) => {
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

adminRouter.delete('/events/:id', async (req, res, next) => {
  try {
    await campusRepository.deleteEvent(String(req.params.id));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

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
