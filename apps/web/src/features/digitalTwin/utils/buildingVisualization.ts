import type { CampusEvent, GraphEdge, GraphNode } from '@campusar/shared';
import type { CrowdBand, TwinCampusEvent } from '../types/digitalTwin';
import { isValidWgs84 } from '../adapters/coordinates';

export {
  buildingsToTwin,
  toDigitalTwinBuilding,
  buildingEntityId,
  parseBuildingEntityId,
} from '../adapters/buildingAdapter';
export { isFiniteCoordinate } from '../adapters/coordinates';
export { accessibilityToRouteKind, routeToOverlay, shouldReplaceRoute } from '../adapters/routeAdapter';
export { filterTwinBuildings } from '../adapters/searchAdapter';

export function buildingHasValidCoordinates(building: {
  latitude?: unknown;
  longitude?: unknown;
}): boolean {
  return isValidWgs84(building);
}

export function intensityToCrowdBand(intensity: number | null | undefined): CrowdBand {
  if (intensity == null || !Number.isFinite(intensity)) return 'UNKNOWN';
  if (intensity < 0.33) return 'LOW';
  if (intensity < 0.66) return 'MEDIUM';
  return 'HIGH';
}

/**
 * Crowd in this product is stored per walkway edge (and optional node), not occupancy %.
 * Approximate a building band from edges that touch nodes belonging to the building.
 */
export function deriveBuildingCrowd(
  buildingId: string,
  nodes: GraphNode[],
  edges: GraphEdge[],
  crowdByEdge: Map<string, number>,
): { band: CrowdBand; intensity: number | null } {
  const nodeIds = new Set(nodes.filter((n) => n.buildingId === buildingId).map((n) => n.id));
  if (nodeIds.size === 0) return { band: 'UNKNOWN', intensity: null };

  const samples: number[] = [];
  for (const edge of edges) {
    if (!nodeIds.has(edge.fromNodeId) && !nodeIds.has(edge.toNodeId)) continue;
    const value = crowdByEdge.get(edge.id) ?? edge.crowdScore;
    if (Number.isFinite(value)) samples.push(value);
  }
  if (samples.length === 0) return { band: 'UNKNOWN', intensity: null };
  const intensity = samples.reduce((s, v) => s + v, 0) / samples.length;
  return { band: intensityToCrowdBand(intensity), intensity };
}

export function applyCrowdUpdateToBuildings(
  previous: Map<string, CrowdBand>,
  next: Map<string, CrowdBand>,
): { buildingId: string; band: CrowdBand }[] {
  const changed: { buildingId: string; band: CrowdBand }[] = [];
  for (const [id, band] of next) {
    if (previous.get(id) !== band) changed.push({ buildingId: id, band });
  }
  return changed;
}

export function ignoreUnknownBuildingCrowd(buildingId: string, knownIds: Set<string>): boolean {
  return !knownIds.has(buildingId);
}

export function campusEventToTwinOverlay(event: CampusEvent): TwinCampusEvent {
  return {
    id: event.id,
    type: event.active ? 'incident' : 'inactive',
    latitude: event.latitude ?? undefined,
    longitude: event.longitude ?? undefined,
    timestamp: event.startsAt,
    severity: event.affectsRouting ? 'routing' : 'info',
  };
}
