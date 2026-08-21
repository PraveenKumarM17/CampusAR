import { Router } from 'express';
import { z } from 'zod';
import { campusReadService } from '../../../application/campusReadService';
import { indoorService, indoorRouteSchema } from '../../../application/indoorService';
import { mapVersionService } from '../../../application/mapVersionService';
import { resolveEditorPreviewScope } from '../../../application/mapVersionPreviewContext';
import { navigationService } from '../../../application/navigationService';
import { validateRouteEndpointsForVersion, toRoutePlaceSummary, isNamedPlace } from '../../../application/navigationValidation';
import { campusRepository } from '../../../infrastructure/repositories/campusRepository';
import { AppError } from '../../../domain/errors';
import { indoorRepository } from '../../../infrastructure/repositories/indoorRepository';
import type { AuthedRequest } from '../middleware/auth';

import type { PreviewMapScope } from '../../../application/mapVersionPreviewContext';

type PreviewResolveError = {
  field: 'from' | 'to';
  code: string;
  message: string;
  nodeId?: string;
};

async function checkPreviewResolveNode(
  field: 'from' | 'to',
  nodeId: string | null,
  scope: PreviewMapScope,
  errors: PreviewResolveError[],
): Promise<ReturnType<typeof toRoutePlaceSummary> | null> {
  if (!nodeId) return null;
  const node = await campusRepository.getNodeById(nodeId);
  if (!node) {
    errors.push({
      field,
      code: 'INVALID_NODE',
      message: `${field === 'from' ? 'Start' : 'Destination'} place was not found`,
      nodeId,
    });
    return null;
  }
  if (node.active === false) {
    errors.push({
      field,
      code: 'INVALID_NODE',
      message: `${node.name?.trim() ?? 'This place'} is no longer available for navigation`,
      nodeId,
    });
    return null;
  }
  if (!isNamedPlace(node)) {
    errors.push({
      field,
      code: 'INVALID_NODE',
      message: `${field === 'from' ? 'Start' : 'Destination'} must be a named campus place`,
      nodeId,
    });
    return null;
  }
  const nodeVersion = await campusRepository.getNodeMapVersionId(nodeId);
  if (nodeVersion !== scope.mapVersionId) {
    errors.push({
      field,
      code: 'CROSS_VERSION_REFERENCE',
      message: 'Node does not belong to the preview map version',
      nodeId,
    });
    return null;
  }
  if (node.siteId !== scope.siteId) {
    errors.push({
      field,
      code: 'CROSS_SITE_ROUTE',
      message: 'Node does not belong to the active site',
      nodeId,
    });
    return null;
  }
  return toRoutePlaceSummary(node);
}

export const mapVersionPreviewRouter = Router({ mergeParams: true });

async function previewScope(req: AuthedRequest) {
  const versionId = String(req.params.versionId);
  return resolveEditorPreviewScope(req, versionId);
}

mapVersionPreviewRouter.get('/meta', async (req: AuthedRequest, res, next) => {
  try {
    const scope = await previewScope(req);
    const publishedVersion = await mapVersionService.getPublishedVersion(scope.siteId);
    res.json({
      siteId: scope.siteId,
      previewVersion: scope.version,
      publishedVersion,
    });
  } catch (err) {
    next(err);
  }
});

mapVersionPreviewRouter.get('/campus/buildings', async (req: AuthedRequest, res, next) => {
  try {
    const scope = await previewScope(req);
    res.json(await campusReadService.listBuildings(scope));
  } catch (err) {
    next(err);
  }
});

mapVersionPreviewRouter.get('/campus/floors', async (req: AuthedRequest, res, next) => {
  try {
    const buildingId = typeof req.query.buildingId === 'string' ? req.query.buildingId : undefined;
    const scope = await previewScope(req);
    res.json(await campusReadService.listFloors(buildingId, scope));
  } catch (err) {
    next(err);
  }
});

mapVersionPreviewRouter.get('/campus/rooms', async (req: AuthedRequest, res, next) => {
  try {
    const buildingId = typeof req.query.buildingId === 'string' ? req.query.buildingId : undefined;
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const scope = await previewScope(req);
    res.json(await campusReadService.listRooms({ buildingId, category }, scope));
  } catch (err) {
    next(err);
  }
});

mapVersionPreviewRouter.get('/campus/nodes', async (req: AuthedRequest, res, next) => {
  try {
    const scope = await previewScope(req);
    res.json(await campusReadService.listActiveNodes(scope));
  } catch (err) {
    next(err);
  }
});

mapVersionPreviewRouter.get('/campus/places', async (req: AuthedRequest, res, next) => {
  try {
    const scope = await previewScope(req);
    res.json(await campusReadService.listNamedPlaces(scope));
  } catch (err) {
    next(err);
  }
});

mapVersionPreviewRouter.get('/campus/edges', async (req: AuthedRequest, res, next) => {
  try {
    const scope = await previewScope(req);
    res.json(await campusReadService.listEdges(scope));
  } catch (err) {
    next(err);
  }
});

mapVersionPreviewRouter.get('/campus/areas', async (req: AuthedRequest, res, next) => {
  try {
    const scope = await previewScope(req);
    res.json(await campusReadService.listAreas(scope));
  } catch (err) {
    next(err);
  }
});

mapVersionPreviewRouter.get('/campus/search', async (req: AuthedRequest, res, next) => {
  try {
    const q = z.string().min(1).parse(req.query.q);
    const scope = await previewScope(req);
    res.json(await campusReadService.search(q, scope));
  } catch (err) {
    next(err);
  }
});

mapVersionPreviewRouter.get('/campus/buildings/:buildingId/indoor-layout', async (req: AuthedRequest, res, next) => {
  try {
    const buildingId = String(req.params.buildingId);
    const floorId = typeof req.query.floorId === 'string' ? req.query.floorId : undefined;
    const scope = await previewScope(req);
    const layout = await campusReadService.getIndoorLayout(buildingId, floorId, scope);
    res.json({
      building: layout.building,
      floors: layout.floors,
      rooms: layout.rooms,
      corridors: layout.corridors,
      pois: layout.pois,
    });
  } catch (err) {
    next(err);
  }
});

mapVersionPreviewRouter.get('/indoor/buildings/:buildingId/context', async (req: AuthedRequest, res, next) => {
  try {
    const buildingId = String(req.params.buildingId);
    const scope = await previewScope(req);
    res.json(
      await indoorService.getBuildingContextForVersion(buildingId, scope.siteId, scope.mapVersionId),
    );
  } catch (err) {
    next(err);
  }
});

mapVersionPreviewRouter.get('/indoor/places', async (req: AuthedRequest, res, next) => {
  try {
    const buildingId = z.string().uuid().parse(req.query.buildingId);
    const scope = await previewScope(req);
    res.json(await indoorService.listPreviewPlaces(buildingId, scope.siteId, scope.mapVersionId));
  } catch (err) {
    next(err);
  }
});

mapVersionPreviewRouter.get('/indoor/places/search', async (req: AuthedRequest, res, next) => {
  try {
    const q = z.string().min(1).parse(req.query.q);
    const buildingId =
      typeof req.query.buildingId === 'string' ? req.query.buildingId : undefined;
    const scope = await previewScope(req);
    res.json(
      await indoorService.searchPreviewPlaces(q, scope.siteId, scope.mapVersionId, buildingId),
    );
  } catch (err) {
    next(err);
  }
});

mapVersionPreviewRouter.get('/indoor/places/:id', async (req: AuthedRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const buildingId =
      typeof req.query.buildingId === 'string' ? req.query.buildingId : undefined;
    const scope = await previewScope(req);
    res.json(await indoorService.getPreviewPlace(id, scope.mapVersionId, buildingId));
  } catch (err) {
    next(err);
  }
});

mapVersionPreviewRouter.get('/indoor/anchors/:code', async (req: AuthedRequest, res, next) => {
  try {
    const code = String(req.params.code);
    const buildingId =
      typeof req.query.buildingId === 'string' ? req.query.buildingId : undefined;
    const scope = await previewScope(req);
    res.json(await indoorService.resolvePreviewAnchor(code, scope.mapVersionId, buildingId));
  } catch (err) {
    next(err);
  }
});

mapVersionPreviewRouter.get('/indoor/handoffs', async (req: AuthedRequest, res, next) => {
  try {
    const outdoorNodeId = z.string().uuid().parse(req.query.outdoorNodeId);
    const scope = await previewScope(req);
    const handoff = await indoorRepository.getHandoffByOutdoorNodeForVersion(
      outdoorNodeId,
      scope.mapVersionId,
    );
    res.json(handoff);
  } catch (err) {
    next(err);
  }
});

const routeBodySchema = z.object({
  sourceNodeId: z.string().uuid(),
  destinationNodeId: z.string().uuid(),
  accessibility: z
    .object({
      wheelchairMode: z.boolean().optional(),
      preferLift: z.boolean().optional(),
      preferRamp: z.boolean().optional(),
      avoidStairs: z.boolean().optional(),
    })
    .optional(),
  usePrediction: z.boolean().optional(),
});

async function handlePreviewRoute(req: AuthedRequest, res: import('express').Response, next: import('express').NextFunction) {
  try {
    const body = routeBodySchema.parse(req.body);
    const scope = await previewScope(req);
    const route = await navigationService.computeRoute({
      ...body,
      siteId: scope.siteId,
      mapVersionId: scope.mapVersionId,
      userId: req.user?.sub ?? null,
    });
    res.json(route);
  } catch (err) {
    next(err);
  }
}

mapVersionPreviewRouter.post('/navigation/route', handlePreviewRoute);
mapVersionPreviewRouter.post('/navigation/recalculate', handlePreviewRoute);

mapVersionPreviewRouter.get('/navigation/resolve', async (req: AuthedRequest, res, next) => {
  try {
    const from = typeof req.query.from === 'string' ? req.query.from : null;
    const to = typeof req.query.to === 'string' ? req.query.to : null;
    const scope = await previewScope(req);
    const errors: PreviewResolveError[] = [];
    let source = null;
    let destination = null;

    if (from && to && from !== to) {
      try {
        const endpoints = await validateRouteEndpointsForVersion(
          from,
          to,
          scope.siteId,
          scope.mapVersionId,
        );
        source = endpoints.source;
        destination = endpoints.destination;
      } catch (err: unknown) {
        const e = err as AppError;
        errors.push({
          field: 'to',
          code: e.code ?? 'INVALID_NODE',
          message: e.message ?? 'Invalid route endpoints',
          nodeId: to,
        });
      }
    } else {
      if (from === to && from) {
        errors.push({
          field: 'to',
          code: 'SAME_NODE',
          message: 'Source and destination must be different',
          nodeId: from,
        });
      } else {
        const [fromSummary, toSummary] = await Promise.all([
          checkPreviewResolveNode('from', from, scope, errors),
          checkPreviewResolveNode('to', to, scope, errors),
        ]);
        source = fromSummary;
        destination = toSummary;
      }
    }

    res.json({
      valid:
        errors.length === 0 &&
        (from == null || source != null) &&
        (to == null || destination != null),
      source,
      destination,
      errors,
    });
  } catch (err) {
    next(err);
  }
});

mapVersionPreviewRouter.post('/indoor/route', async (req: AuthedRequest, res, next) => {
  try {
    const body = indoorRouteSchema.parse(req.body);
    const scope = await previewScope(req);
    res.json(await indoorService.routeForVersion(body, scope.mapVersionId));
  } catch (err) {
    next(err);
  }
});
