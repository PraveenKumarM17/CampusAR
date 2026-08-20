import type {
  AccessibilityPrefs,
  IndoorEdge,
  IndoorEdgeKind,
  IndoorNode,
  IndoorRoutePreferences,
  IndoorRouteStep,
} from '@campusar/shared';
import { DEFAULT_ROUTE_WEIGHTS, WALKING_SPEED_MPS } from '@campusar/shared';
import {
  aStar,
  buildAdjacency,
  type RoutingEdge,
  type RoutingNode,
} from '../routing/astar';
import { euclideanMeters, indoorKindToRoutingKind, localBearingDegrees } from './geometry';
import { turnInstruction } from '../routing/astar';

export function indoorPrefsToAccessibility(prefs: IndoorRoutePreferences): AccessibilityPrefs {
  return {
    wheelchairMode: prefs.wheelchairAccessible,
    preferLift: prefs.preferElevator || prefs.wheelchairAccessible,
    preferRamp: prefs.wheelchairAccessible,
    avoidStairs: prefs.avoidStairs || prefs.wheelchairAccessible,
  };
}

export function indoorNodeToRouting(node: IndoorNode): RoutingNode {
  return {
    id: node.id,
    latitude: 0,
    longitude: 0,
    name: node.name,
  };
}

export function indoorEdgeToRouting(edge: IndoorEdge): RoutingEdge {
  return {
    id: edge.id,
    fromNodeId: edge.fromNodeId,
    toNodeId: edge.toNodeId,
    distanceM: edge.distanceM,
    kind: indoorKindToRoutingKind(edge.kind),
    bidirectional: edge.bidirectional,
    blocked: !edge.active,
    safetyScore: 0.95,
    crowdScore: 0.05,
    accessibilityScore: edge.wheelchairAccessible ? 0.95 : 0.2,
  };
}

export function indoorEuclidean(nodes: Map<string, IndoorNode>) {
  return (a: RoutingNode, b: RoutingNode) => {
    const na = nodes.get(a.id);
    const nb = nodes.get(b.id);
    if (!na || !nb) return 0;
    return euclideanMeters(
      { x: na.localX, y: na.localY, z: na.localZ },
      { x: nb.localX, y: nb.localY, z: nb.localZ },
    );
  };
}

export function routeIndoorGraph(
  startId: string,
  goalId: string,
  nodes: IndoorNode[],
  edges: IndoorEdge[],
  prefs: IndoorRoutePreferences,
) {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const routingNodes = new Map(nodes.map((n) => [n.id, indoorNodeToRouting(n)]));
  const routingEdges = edges.map(indoorEdgeToRouting);
  const adj = buildAdjacency(
    routingEdges,
    DEFAULT_ROUTE_WEIGHTS,
    indoorPrefsToAccessibility(prefs),
  );
  return aStar(startId, goalId, routingNodes, adj, {
    maxDistanceM: 80,
    wDistance: DEFAULT_ROUTE_WEIGHTS.wDistance,
    distanceFn: indoorEuclidean(nodeById),
  });
}

export function buildIndoorSteps(
  nodeIds: string[],
  edgeIds: string[],
  nodes: IndoorNode[],
  edges: IndoorEdge[],
): IndoorRouteStep[] {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const edgeById = new Map(edges.map((e) => [e.id, e]));
  const steps: IndoorRouteStep[] = [];
  let prevBearing: number | null = null;

  for (let i = 0; i < nodeIds.length; i++) {
    const node = nodeById.get(nodeIds[i]);
    if (!node) continue;
    const next = i < nodeIds.length - 1 ? nodeById.get(nodeIds[i + 1]) : undefined;
    const edge = i < edgeIds.length ? edgeById.get(edgeIds[i]) : undefined;
    const bearing =
      next != null
        ? localBearingDegrees(
            { x: node.localX, y: node.localY, z: node.localZ },
            { x: next.localX, y: next.localY, z: next.localZ },
          )
        : 0;
    const instruction = next
      ? indoorInstruction(node, next, edge?.kind ?? null, prevBearing, bearing)
      : node.name
        ? `Arrive at ${node.name}`
        : 'You have arrived';
    steps.push({
      nodeId: node.id,
      name: node.name,
      floorId: node.floorId,
      localX: node.localX,
      localY: node.localY,
      localZ: node.localZ,
      instruction,
      distanceM: edge?.distanceM ?? 0,
      bearing,
      edgeKind: edge?.kind ?? null,
    });
    if (next) prevBearing = bearing;
  }
  return steps;
}

export function indoorInstruction(
  from: IndoorNode,
  to: IndoorNode,
  kind: IndoorEdgeKind | null,
  prevBearing: number | null,
  bearing: number,
): string {
  if (kind === 'stairs') {
    return from.floorId === to.floorId
      ? 'Use the stairs'
      : `Take stairs toward ${to.name ?? 'the next floor'}`;
  }
  if (kind === 'elevator') {
    return `Take the elevator toward ${to.name ?? 'the next floor'}`;
  }
  if (kind === 'ramp') {
    return `Use the ramp toward ${to.name ?? 'the next area'}`;
  }
  if (kind === 'escalator') {
    return 'Take the escalator';
  }
  if (to.kind === 'room_entrance' && to.name) {
    return `${to.name} is ahead`;
  }
  if (to.kind === 'destination' && to.name) {
    return `${to.name} is on the way`;
  }
  return turnInstruction(prevBearing, bearing);
}

export function etaMinutes(distanceM: number): number {
  return distanceM / WALKING_SPEED_MPS / 60;
}
