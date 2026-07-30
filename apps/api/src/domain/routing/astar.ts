import type { AccessibilityPrefs, EdgeKind, RouteWeights } from '@campusar/shared';
import { DEFAULT_ACCESSIBILITY, DEFAULT_ROUTE_WEIGHTS } from '@campusar/shared';

export interface RoutingNode {
  id: string;
  latitude: number;
  longitude: number;
  name: string | null;
}

export interface RoutingEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  distanceM: number;
  kind: EdgeKind;
  bidirectional: boolean;
  blocked: boolean;
  safetyScore: number;
  crowdScore: number;
  accessibilityScore: number;
}

export interface ScoredNeighbor {
  nodeId: string;
  edgeId: string;
  cost: number;
  distanceM: number;
}

const INF = Number.POSITIVE_INFINITY;

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function bearingDegrees(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function isEdgeAllowed(
  edge: RoutingEdge,
  prefs: AccessibilityPrefs = DEFAULT_ACCESSIBILITY,
): boolean {
  if (prefs.wheelchairMode || prefs.avoidStairs) {
    if (edge.kind === 'stairs') return false;
  }
  if (prefs.wheelchairMode && edge.accessibilityScore < 0.5) {
    return false;
  }
  return true;
}

export function edgeTraversalCost(
  edge: RoutingEdge,
  weights: RouteWeights = DEFAULT_ROUTE_WEIGHTS,
  prefs: AccessibilityPrefs = DEFAULT_ACCESSIBILITY,
  maxDistanceM = 200,
): number {
  if (edge.blocked) {
    return weights.wBlockedPenalty;
  }
  if (!isEdgeAllowed(edge, prefs)) {
    return INF;
  }

  const distNorm = Math.min(edge.distanceM / maxDistanceM, 1);
  let accessibilityPenalty = 1 - edge.accessibilityScore;

  if (prefs.preferLift && edge.kind === 'elevator') {
    accessibilityPenalty *= 0.3;
  }
  if (prefs.preferRamp && edge.kind === 'ramp') {
    accessibilityPenalty *= 0.3;
  }
  if (prefs.preferLift && edge.kind === 'stairs') {
    accessibilityPenalty = Math.max(accessibilityPenalty, 0.9);
  }

  return (
    weights.wDistance * distNorm +
    weights.wSafety * (1 - edge.safetyScore) +
    weights.wCrowd * edge.crowdScore +
    weights.wAccessibility * accessibilityPenalty
  );
}

export function buildAdjacency(
  edges: RoutingEdge[],
  weights: RouteWeights,
  prefs: AccessibilityPrefs,
): Map<string, ScoredNeighbor[]> {
  const adj = new Map<string, ScoredNeighbor[]>();
  const push = (from: string, neighbor: ScoredNeighbor) => {
    const list = adj.get(from) ?? [];
    list.push(neighbor);
    adj.set(from, list);
  };

  for (const edge of edges) {
    const cost = edgeTraversalCost(edge, weights, prefs);
    if (!Number.isFinite(cost) || cost >= weights.wBlockedPenalty) {
      continue;
    }
    push(edge.fromNodeId, {
      nodeId: edge.toNodeId,
      edgeId: edge.id,
      cost,
      distanceM: edge.distanceM,
    });
    if (edge.bidirectional) {
      push(edge.toNodeId, {
        nodeId: edge.fromNodeId,
        edgeId: edge.id,
        cost,
        distanceM: edge.distanceM,
      });
    }
  }
  return adj;
}

export interface AStarResult {
  nodeIds: string[];
  edgeIds: string[];
  totalDistanceM: number;
  cost: number;
}

export function aStar(
  startId: string,
  goalId: string,
  nodes: Map<string, RoutingNode>,
  adjacency: Map<string, ScoredNeighbor[]>,
  options?: { maxDistanceM?: number; wDistance?: number },
): AStarResult | null {
  if (startId === goalId) {
    return { nodeIds: [startId], edgeIds: [], totalDistanceM: 0, cost: 0 };
  }
  if (!nodes.has(startId) || !nodes.has(goalId)) {
    return null;
  }

  const maxDistanceM = options?.maxDistanceM ?? 200;
  const wDistance = options?.wDistance ?? 0.4;
  const goal = nodes.get(goalId)!;

  const heuristic = (nodeId: string) => {
    const n = nodes.get(nodeId);
    if (!n) return 0;
    const meters = haversineMeters(n.latitude, n.longitude, goal.latitude, goal.longitude);
    // Admissible under our cost model: underestimate using distance weight only.
    return wDistance * Math.min(meters / maxDistanceM, 1);
  };

  const open = new Set<string>([startId]);
  const cameFrom = new Map<string, { prev: string; edgeId: string }>();
  const gScore = new Map<string, number>([[startId, 0]]);
  const distScore = new Map<string, number>([[startId, 0]]);
  const fScore = new Map<string, number>([[startId, heuristic(startId)]]);

  while (open.size > 0) {
    let current: string | null = null;
    let bestF = INF;
    for (const id of open) {
      const f = fScore.get(id) ?? INF;
      if (f < bestF) {
        bestF = f;
        current = id;
      }
    }
    if (!current) break;
    if (current === goalId) {
      return reconstruct(current, cameFrom, gScore, distScore);
    }
    open.delete(current);

    for (const neighbor of adjacency.get(current) ?? []) {
      const tentative = (gScore.get(current) ?? INF) + neighbor.cost;
      if (tentative < (gScore.get(neighbor.nodeId) ?? INF)) {
        cameFrom.set(neighbor.nodeId, { prev: current, edgeId: neighbor.edgeId });
        gScore.set(neighbor.nodeId, tentative);
        distScore.set(neighbor.nodeId, (distScore.get(current) ?? 0) + neighbor.distanceM);
        fScore.set(neighbor.nodeId, tentative + heuristic(neighbor.nodeId));
        open.add(neighbor.nodeId);
      }
    }
  }
  return null;
}

function reconstruct(
  current: string,
  cameFrom: Map<string, { prev: string; edgeId: string }>,
  gScore: Map<string, number>,
  distScore: Map<string, number>,
): AStarResult {
  const nodeIds = [current];
  const edgeIds: string[] = [];
  let cur = current;
  while (cameFrom.has(cur)) {
    const step = cameFrom.get(cur)!;
    edgeIds.unshift(step.edgeId);
    nodeIds.unshift(step.prev);
    cur = step.prev;
  }
  return {
    nodeIds,
    edgeIds,
    totalDistanceM: distScore.get(current) ?? 0,
    cost: gScore.get(current) ?? 0,
  };
}

export function turnInstruction(prevBearing: number | null, bearing: number): string {
  if (prevBearing === null) return 'Head toward your destination';
  const delta = ((bearing - prevBearing + 540) % 360) - 180;
  if (Math.abs(delta) < 25) return 'Continue straight';
  if (delta > 0 && delta < 135) return 'Turn right';
  if (delta < 0 && delta > -135) return 'Turn left';
  return 'Make a U-turn';
}
