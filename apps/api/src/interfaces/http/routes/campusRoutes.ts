import { Router } from 'express';
import { z } from 'zod';
import { analyticsRepository } from '../../../infrastructure/repositories/analyticsRepository';
import { campusRepository } from '../../../infrastructure/repositories/campusRepository';
import { optionalAuth, type AuthedRequest } from '../middleware/auth';

export const campusRouter = Router();

campusRouter.get('/buildings', async (_req, res, next) => {
  try {
    res.json(await campusRepository.listBuildings());
  } catch (err) {
    next(err);
  }
});

campusRouter.get('/floors', async (req, res, next) => {
  try {
    const buildingId = typeof req.query.buildingId === 'string' ? req.query.buildingId : undefined;
    res.json(await campusRepository.listFloors(buildingId));
  } catch (err) {
    next(err);
  }
});

campusRouter.get('/rooms', async (req, res, next) => {
  try {
    const buildingId = typeof req.query.buildingId === 'string' ? req.query.buildingId : undefined;
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    res.json(await campusRepository.listRooms({ buildingId, category }));
  } catch (err) {
    next(err);
  }
});

campusRouter.get('/nodes', async (_req, res, next) => {
  try {
    res.json(await campusRepository.listActiveNodes());
  } catch (err) {
    next(err);
  }
});

campusRouter.get('/places', async (_req, res, next) => {
  try {
    res.json(await campusRepository.listNamedPlaces());
  } catch (err) {
    next(err);
  }
});

campusRouter.get('/edges', async (_req, res, next) => {
  try {
    res.json(await campusRepository.listEdges());
  } catch (err) {
    next(err);
  }
});

campusRouter.get('/search', optionalAuth, async (req: AuthedRequest, res, next) => {
  try {
    const q = z.string().min(1).parse(req.query.q);
    const results = await campusRepository.search(q);
    await analyticsRepository.recordSearch(req.user?.sub ?? null, q, results.length);
    res.json(results);
  } catch (err) {
    next(err);
  }
});

campusRouter.get('/categories', (_req, res) => {
  res.json([
    'classroom',
    'lab',
    'office',
    'library',
    'cafeteria',
    'restroom',
    'auditorium',
    'other',
  ]);
});
