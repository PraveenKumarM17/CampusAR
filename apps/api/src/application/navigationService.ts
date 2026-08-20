import {
  DEFAULT_ACCESSIBILITY,
  WALKING_SPEED_MPS,
  type AccessibilityPrefs,
  type RouteResponse,
  type RouteStep,
} from '@campusar/shared';
import { AppError } from '../domain/errors';
import {
  aStar,
  applyHazardsToEdges,
  applyPredictedCrowd,
  bearingDegrees,
  buildAdjacency,
  turnInstruction,
} from '../domain/routing/astar';
import { defaultCrowdPredictor } from '../domain/prediction/crowdPredictor';
import { validateRouteEndpoints } from './navigationValidation';
import { analyticsRepository } from '../infrastructure/repositories/analyticsRepository';
import { campusRepository } from '../infrastructure/repositories/campusRepository';

function normalizeAccessibility(
  input?: Partial<AccessibilityPrefs>,
): AccessibilityPrefs {
  return {
    wheelchairMode: input?.wheelchairMode ?? DEFAULT_ACCESSIBILITY.wheelchairMode,
    preferLift: input?.preferLift ?? DEFAULT_ACCESSIBILITY.preferLift,
    preferRamp: input?.preferRamp ?? DEFAULT_ACCESSIBILITY.preferRamp,
    avoidStairs: input?.avoidStairs ?? DEFAULT_ACCESSIBILITY.avoidStairs,
  };
}

export const navigationService = {
  async computeRoute(input: {
    sourceNodeId: string;
    destinationNodeId: string;
    accessibility?: Partial<AccessibilityPrefs>;
    userId?: string | null;
    usePrediction?: boolean;
    siteId?: string;
  }): Promise<RouteResponse> {
    const { source, destination } = await validateRouteEndpoints(
      input.sourceNodeId,
      input.destinationNodeId,
      input.siteId,
    );
    const prefs = normalizeAccessibility(input.accessibility);
    const usePrediction = input.usePrediction !== false;
    const weights = await campusRepository.getWeights();
    const { nodes, edges: rawEdges } = await campusRepository.getRoutingGraph(input.siteId);
    const zones = await campusRepository.listActiveDangerZones(input.siteId);
    const events = await campusRepository.listActiveRoutingEvents(new Date(), input.siteId);

    if (!nodes.has(input.sourceNodeId) || !nodes.has(input.destinationNodeId)) {
      throw new AppError(
        'NO_ROUTE',
        'No route found — one or both places are not connected to the campus path network',
        404,
        { sourceNodeId: input.sourceNodeId, destinationNodeId: input.destinationNodeId },
      );
    }

    let edges = applyHazardsToEdges(rawEdges, nodes, zones, events);
    if (usePrediction) {
      edges = applyPredictedCrowd(edges, (edgeId, live) =>
        defaultCrowdPredictor.predictEdgeCrowd(edgeId, live),
      );
    }

    const adjacency = buildAdjacency(edges, weights, prefs);
    const result = aStar(input.sourceNodeId, input.destinationNodeId, nodes, adjacency, {
      wDistance: weights.wDistance,
    });

    if (!result) {
      throw new AppError('NO_ROUTE', 'No route found for the given preferences', 404, {
        sourceNodeId: input.sourceNodeId,
        destinationNodeId: input.destinationNodeId,
      });
    }

    const path: RouteStep[] = [];
    let prevBearing: number | null = null;
    for (let i = 0; i < result.nodeIds.length; i++) {
      const id = result.nodeIds[i];
      const node = nodes.get(id)!;
      const nextId = result.nodeIds[i + 1];
      let distanceM = 0;
      let bearing = 0;
      let instruction = 'You have arrived';
      if (nextId) {
        const next = nodes.get(nextId)!;
        distanceM = result.edgeIds[i]
          ? (edges.find((e) => e.id === result.edgeIds[i])?.distanceM ?? 0)
          : 0;
        bearing = bearingDegrees(node.latitude, node.longitude, next.latitude, next.longitude);
        instruction = turnInstruction(prevBearing, bearing);
        if (next.name) instruction = `${instruction} toward ${next.name}`;
        prevBearing = bearing;
      }
      path.push({
        nodeId: id,
        latitude: node.latitude,
        longitude: node.longitude,
        instruction,
        distanceM,
        bearing,
      });
    }

    const etaMinutes = result.totalDistanceM / WALKING_SPEED_MPS / 60;
    const response: RouteResponse = {
      path,
      nodeIds: result.nodeIds,
      edgeIds: result.edgeIds,
      totalDistanceM: Math.round(result.totalDistanceM * 10) / 10,
      etaMinutes: Math.round(etaMinutes * 10) / 10,
      cost: Math.round(result.cost * 1000) / 1000,
      predictionUsed: usePrediction,
      source,
      destination,
    };

    await analyticsRepository.recordNavigation({
      userId: input.userId ?? null,
      sourceNodeId: input.sourceNodeId,
      destinationNodeId: input.destinationNodeId,
      edgeIds: result.edgeIds,
      distanceM: response.totalDistanceM,
      etaMinutes: response.etaMinutes,
    });

    return response;
  },
};
