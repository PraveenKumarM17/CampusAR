import type { GraphEdge, GraphNode } from '@campusar/shared';
import type { WalkwaySegment } from '../types/digitalTwin';
import { isValidWgs84, toCesiumDegreesArray } from './coordinates';

export function walkwaySegmentsFromGraph(nodes: GraphNode[], edges: GraphEdge[]): WalkwaySegment[] {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const segments: WalkwaySegment[] = [];
  for (const edge of edges) {
    const from = nodeById.get(edge.fromNodeId);
    const to = nodeById.get(edge.toNodeId);
    if (!from || !to) continue;
    if (!isValidWgs84(from) || !isValidWgs84(to)) continue;
    segments.push({
      id: edge.id,
      fromNodeId: edge.fromNodeId,
      toNodeId: edge.toNodeId,
      from: { latitude: from.latitude, longitude: from.longitude },
      to: { latitude: to.latitude, longitude: to.longitude },
      blocked: Boolean(edge.blocked),
      accessibilityScore: edge.accessibilityScore,
      crowdScore: edge.crowdScore,
    });
  }
  return segments;
}

export function walkwayCesiumDegrees(segment: WalkwaySegment): number[] {
  return toCesiumDegreesArray([segment.from, segment.to]);
}

export function walkwayEntityId(edgeId: string): string {
  return `walkway-${edgeId}`;
}

export function parseWalkwayEntityId(entityId: string | undefined): string | null {
  if (!entityId?.startsWith('walkway-')) return null;
  return entityId.slice('walkway-'.length) || null;
}
