import { Router } from 'express';
import { z } from 'zod';
import { analyticsRepository } from '../../../infrastructure/repositories/analyticsRepository';
import { campusRepository } from '../../../infrastructure/repositories/campusRepository';
import { optionalAuth, type AuthedRequest } from '../middleware/auth';
import { resolveRequestSiteId } from '../../../application/siteContext';

export const campusRouter = Router();

campusRouter.get('/buildings', async (req, res, next) => {
  try {
    const siteId = await resolveRequestSiteId(req);
    res.json(await campusRepository.listBuildings(siteId));
  } catch (err) {
    next(err);
  }
});

campusRouter.get('/floors', async (req, res, next) => {
  try {
    const buildingId = typeof req.query.buildingId === 'string' ? req.query.buildingId : undefined;
    const siteId = await resolveRequestSiteId(req);
    res.json(await campusRepository.listFloors(buildingId, siteId));
  } catch (err) {
    next(err);
  }
});

campusRouter.get('/rooms', async (req, res, next) => {
  try {
    const buildingId = typeof req.query.buildingId === 'string' ? req.query.buildingId : undefined;
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const siteId = await resolveRequestSiteId(req);
    res.json(await campusRepository.listRooms({ buildingId, category, siteId }));
  } catch (err) {
    next(err);
  }
});

campusRouter.get('/nodes', async (req, res, next) => {
  try {
    const siteId = await resolveRequestSiteId(req);
    res.json(await campusRepository.listActiveNodes(siteId));
  } catch (err) {
    next(err);
  }
});

campusRouter.get('/places', async (req, res, next) => {
  try {
    const siteId = await resolveRequestSiteId(req);
    res.json(await campusRepository.listNamedPlaces(siteId));
  } catch (err) {
    next(err);
  }
});

campusRouter.get('/edges', async (req, res, next) => {
  try {
    const siteId = await resolveRequestSiteId(req);
    res.json(await campusRepository.listEdges(siteId));
  } catch (err) {
    next(err);
  }
});

campusRouter.get('/search', optionalAuth, async (req: AuthedRequest, res, next) => {
  try {
    const q = z.string().min(1).parse(req.query.q);
    const siteId = await resolveRequestSiteId(req);
    const results = await campusRepository.search(q, siteId);
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
