import { Router } from 'express';
import { z } from 'zod';
import { measurementPathService } from '../../../application/measurementPathService';
import type { GpsPoint } from '../../../application/measurementPathService';
import { requireAuth, type AuthedRequest } from '../middleware/auth';
import { requireMapEditor } from '../middleware/mapEditorAuth';
import { AppError } from '../../../domain/errors';

const router = Router();

// Validation schemas
const pathTypeSchema = z.enum(['indoor', 'outdoor', 'mixed']);
const pathStatusSchema = z.enum(['draft', 'active', 'archived']);

const createPathSchema = z.object({
  siteId: z.string().uuid(),
  buildingId: z.string().uuid().optional().nullable(),
  floorId: z.string().uuid().optional().nullable(),
  mapVersionId: z.string().uuid(),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
  pathType: pathTypeSchema.optional(),
  status: pathStatusSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updatePathSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional().nullable(),
  status: pathStatusSchema.optional(),
  pathType: pathTypeSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});

const gpsPointSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  altitude: z.number().optional(),
  accuracy: z.number().positive().optional(),
  timestamp: z.number().positive().optional(),
});

const addPointSchema = z.object({
  point: gpsPointSchema,
  label: z.string().max(120).optional(),
});

const addPointsSchema = z.object({
  points: z.array(gpsPointSchema).min(1).max(1000),
});

const updatePointSchema = z.object({
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  altitude: z.number().optional().nullable(),
  label: z.string().max(120).optional().nullable(),
  ordinal: z.number().int().positive().optional(),
});

// ====== Path Routes ======

/**
 * POST /api/measurements/paths
 * Create a new measurement path
 */
router.post(
  '/paths',
  requireAuth,
  requireMapEditor,
  async (req: AuthedRequest, res, next) => {
    try {
      const body = createPathSchema.parse(req.body);
      const userId = req.user?.sub;
      const path = await measurementPathService.createPath(body, userId);
      res.status(201).json(path);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/measurements/paths
 * List all measurement paths (with filters)
 */
router.get('/paths', requireAuth, requireMapEditor, async (req: AuthedRequest, res, next) => {
  try {
    const filters = {
      siteId: req.query.siteId as string | undefined,
      floorId: req.query.floorId as string | undefined,
      buildingId: req.query.buildingId as string | undefined,
      status: req.query.status as string | undefined,
      mapVersionId: req.query.mapVersionId as string | undefined,
    };
    const paths = await measurementPathService.listPaths(filters);
    res.json(paths);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/measurements/paths/:pathId
 * Get a specific measurement path with details
 */
router.get('/paths/:pathId', requireAuth, requireMapEditor, async (req: AuthedRequest, res, next) => {
  try {
    const pathId = String(req.params.pathId);
    const path = await measurementPathService.getPathWithDetails(pathId);
    if (!path) {
      throw new AppError('PATH_NOT_FOUND', 'Measurement path not found', 404);
    }
    res.json(path);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/measurements/paths/:pathId
 * Update a measurement path
 */
router.patch(
  '/paths/:pathId',
  requireAuth,
  requireMapEditor,
  async (req: AuthedRequest, res, next) => {
    try {
      const pathId = String(req.params.pathId);
      const body = updatePathSchema.parse(req.body);
      const path = await measurementPathService.updatePath(pathId, body);
      res.json(path);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/measurements/paths/:pathId
 * Delete a measurement path
 */
router.delete('/paths/:pathId', requireAuth, requireMapEditor, async (req: AuthedRequest, res, next) => {
  try {
    const pathId = String(req.params.pathId);
    await measurementPathService.deletePath(pathId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// ====== Point Routes ======

/**
 * POST /api/measurements/paths/:pathId/points
 * Add a single GPS point to a path
 */
router.post(
  '/paths/:pathId/points',
  requireAuth,
  requireMapEditor,
  async (req: AuthedRequest, res, next) => {
    try {
      const pathId = String(req.params.pathId);
      const body = addPointSchema.parse(req.body);
      const newPoint = await measurementPathService.addPoint(pathId, body.point as GpsPoint, body.label);
      res.status(201).json(newPoint);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/measurements/paths/:pathId/points/bulk
 * Bulk add GPS points to a path
 */
router.post(
  '/paths/:pathId/points/bulk',
  requireAuth,
  requireMapEditor,
  async (req: AuthedRequest, res, next) => {
    try {
      const pathId = String(req.params.pathId);
      const body = addPointsSchema.parse(req.body);
      const newPoints = await measurementPathService.addPoints(pathId, body.points as GpsPoint[]);
      res.status(201).json(newPoints);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/measurements/paths/:pathId/points
 * Get all points for a path
 */
router.get('/paths/:pathId/points', requireAuth, requireMapEditor, async (req: AuthedRequest, res, next) => {
  try {
    const pathId = String(req.params.pathId);
    const points = await measurementPathService.getPathPoints(pathId);
    res.json(points);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/measurements/points/:pointId
 * Update a measurement point
 */
router.patch(
  '/points/:pointId',
  requireAuth,
  requireMapEditor,
  async (req: AuthedRequest, res, next) => {
    try {
      const pointId = String(req.params.pointId);
      const body = updatePointSchema.parse(req.body);
      const point = await measurementPathService.updatePoint(pointId, body);
      res.json(point);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/measurements/points/:pointId
 * Delete a measurement point
 */
router.delete('/points/:pointId', requireAuth, requireMapEditor, async (req: AuthedRequest, res, next) => {
  try {
    const pointId = String(req.params.pointId);
    await measurementPathService.deletePoint(pointId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// ====== Edge Routes ======

/**
 * GET /api/measurements/paths/:pathId/edges
 * Get all edges (segments) for a path
 */
router.get('/paths/:pathId/edges', requireAuth, requireMapEditor, async (req: AuthedRequest, res, next) => {
  try {
    const pathId = String(req.params.pathId);
    const edges = await measurementPathService.getPathEdges(pathId);
    res.json(edges);
  } catch (error) {
    next(error);
  }
});

// ====== Utility Routes ======

/**
 * GET /api/measurements/paths/:pathId/statistics
 * Get statistics for a path
 */
router.get('/paths/:pathId/statistics', requireAuth, requireMapEditor, async (req: AuthedRequest, res, next) => {
  try {
    const pathId = String(req.params.pathId);
    const stats = await measurementPathService.getPathStatistics(pathId);
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/measurements/paths/:pathId/export/geojson
 * Export path as GeoJSON
 */
router.get('/paths/:pathId/export/geojson', requireAuth, requireMapEditor, async (req: AuthedRequest, res, next) => {
  try {
    const pathId = String(req.params.pathId);
    const geojson = await measurementPathService.exportPathAsGeoJson(pathId);
    res.json(geojson);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/measurements/paths/:pathId/snap
 * Snap path points to indoor graph nodes
 */
router.post('/paths/:pathId/snap', requireAuth, requireMapEditor, async (req: AuthedRequest, res, next) => {
  try {
    const pathId = String(req.params.pathId);
    const snapRadiusM = (req.body.snapRadiusM as number) || 2.0;
    await measurementPathService.snapPointsToIndoorGraph(pathId, snapRadiusM);
    res.json({ message: 'Path points snapped successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
