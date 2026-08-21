import { Router } from 'express';
import { z } from 'zod';
import { analyticsRepository } from '../../../infrastructure/repositories/analyticsRepository';
import { campusRepository } from '../../../infrastructure/repositories/campusRepository';
import { optionalAuth, type AuthedRequest } from '../middleware/auth';
import { resolveRequestSiteId } from '../../../application/siteContext';
import { resolvePublishedMapVersion } from '../../../application/mapVersionContext';
import { floorLayoutRepository } from '../../../infrastructure/repositories/floorLayoutRepository';
import { AppError } from '../../../domain/errors';

export const campusRouter = Router();

async function resolvePublicMapScope(req: Parameters<typeof resolveRequestSiteId>[0]) {
  const siteId = await resolveRequestSiteId(req);
  if (!siteId) return null;
  const version = await resolvePublishedMapVersion(siteId);
  return { siteId, mapVersionId: version.id };
}

campusRouter.get('/buildings', async (req, res, next) => {
  try {
    const scope = await resolvePublicMapScope(req);
    if (!scope) return res.json([]);
    res.json(await campusRepository.listBuildings(scope.siteId, scope.mapVersionId));
  } catch (err) {
    next(err);
  }
});

campusRouter.get('/floors', async (req, res, next) => {
  try {
    const buildingId = typeof req.query.buildingId === 'string' ? req.query.buildingId : undefined;
    const scope = await resolvePublicMapScope(req);
    if (!scope) return res.json([]);
    res.json(await campusRepository.listFloors(buildingId, scope.siteId, scope.mapVersionId));
  } catch (err) {
    next(err);
  }
});

campusRouter.get('/rooms', async (req, res, next) => {
  try {
    const buildingId = typeof req.query.buildingId === 'string' ? req.query.buildingId : undefined;
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const scope = await resolvePublicMapScope(req);
    if (!scope) return res.json([]);
    res.json(
      await campusRepository.listRooms({
        buildingId,
        category,
        siteId: scope.siteId,
        mapVersionId: scope.mapVersionId,
      }),
    );
  } catch (err) {
    next(err);
  }
});

campusRouter.get('/nodes', async (req, res, next) => {
  try {
    const scope = await resolvePublicMapScope(req);
    if (!scope) return res.json([]);
    res.json(await campusRepository.listActiveNodes(scope.siteId, scope.mapVersionId));
  } catch (err) {
    next(err);
  }
});

campusRouter.get('/places', async (req, res, next) => {
  try {
    const scope = await resolvePublicMapScope(req);
    if (!scope) return res.json([]);
    res.json(await campusRepository.listNamedPlaces(scope.siteId, scope.mapVersionId));
  } catch (err) {
    next(err);
  }
});

campusRouter.get('/edges', async (req, res, next) => {
  try {
    const scope = await resolvePublicMapScope(req);
    if (!scope) return res.json([]);
    res.json(await campusRepository.listEdges(scope.siteId, scope.mapVersionId));
  } catch (err) {
    next(err);
  }
});

campusRouter.get('/search', optionalAuth, async (req: AuthedRequest, res, next) => {
  try {
    const q = z.string().min(1).parse(req.query.q);
    const scope = await resolvePublicMapScope(req);
    if (!scope) return res.json([]);
    const results = await campusRepository.search(q, scope.siteId, scope.mapVersionId);
    await analyticsRepository.recordSearch(req.user?.sub ?? null, q, results.length);
    res.json(results);
  } catch (err) {
    next(err);
  }
});

campusRouter.get('/buildings/:buildingId/indoor-layout', async (req, res, next) => {
  try {
    const buildingId = String(req.params.buildingId);
    const floorId = typeof req.query.floorId === 'string' ? req.query.floorId : undefined;
    const scope = await resolvePublicMapScope(req);
    if (!scope) throw new AppError('NOT_FOUND', 'Building not found', 404);
    const building = await campusRepository.getBuildingById(buildingId);
    if (!building) throw new AppError('NOT_FOUND', 'Building not found', 404);
    if (building.siteId !== scope.siteId) {
      throw new AppError('CROSS_SITE_REFERENCE', 'Building does not belong to the active site', 422);
    }
    const buildingVersion = await campusRepository.getBuildingMapVersionId(buildingId);
    if (buildingVersion !== scope.mapVersionId) {
      throw new AppError('NOT_FOUND', 'Building not found', 404);
    }
    const [floors, rooms, corridors, pois] = await Promise.all([
      floorLayoutRepository.listFloors(buildingId, scope.mapVersionId),
      floorLayoutRepository.listRooms(buildingId, floorId, scope.mapVersionId),
      floorLayoutRepository.listCorridors(buildingId, floorId, scope.mapVersionId),
      floorLayoutRepository.listPois(buildingId, floorId, scope.mapVersionId),
    ]);
    res.json({ buildingId, floors, rooms, corridors, pois });
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
    'ward',
    'meeting_room',
    'storage',
    'other',
  ]);
});
