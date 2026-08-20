import type { GraphNode, RouteResponse } from '@campusar/shared';
import type { TwinRouteKind, TwinRouteOverlay, TwinRoutePoint } from '../types/digitalTwin';
import { isValidWgs84 } from './coordinates';

const MEANINGFUL_WAYPOINT = /gate|plaza|junction|crossroad/i;

export function accessibilityToRouteKind(wheelchairMode?: boolean): TwinRouteKind {
  return wheelchairMode ? 'ACCESSIBLE' : 'WALKING';
}

function namedWaypoints(route: RouteResponse, nodes: GraphNode[]): TwinRoutePoint[] {
  if (route.path.length < 3) return [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const inner = route.path.slice(1, -1);
  const out: TwinRoutePoint[] = [];
  for (const step of inner) {
    if (!isValidWgs84(step)) continue;
    const node = byId.get(step.nodeId);
    const name = node?.name ?? '';
    if (!name || !MEANINGFUL_WAYPOINT.test(name)) continue;
    out.push({ latitude: step.latitude, longitude: step.longitude, label: name });
  }
  return out.slice(0, 6);
}

export function routeToOverlay(
  route: RouteResponse | null | undefined,
  kind: TwinRouteKind = 'WALKING',
  nodes: GraphNode[] = [],
): TwinRouteOverlay | null {
  if (!route?.path?.length) return null;
  const points = route.path
    .filter((s) => isValidWgs84(s))
    .map((s) => ({ latitude: s.latitude, longitude: s.longitude }));
  if (points.length < 2) return null;
  return {
    id: route.edgeIds.join(',') || route.nodeIds.join(','),
    kind,
    points,
    start: points[0],
    end: points[points.length - 1],
    waypoints: namedWaypoints(route, nodes),
  };
}

export function shouldReplaceRoute(
  previousId: string | null,
  next: TwinRouteOverlay | null,
): boolean {
  if (!next) return previousId !== null;
  return previousId !== next.id;
}

export const ROUTE_ENTITY_CORE_IDS = ['nav-route', 'nav-start', 'nav-end'] as const;

export function routeWaypointEntityId(index: number): string {
  return `nav-waypoint-${index}`;
}

export function isRouteEntityId(entityId: string): boolean {
  return entityId === 'nav-route' || entityId === 'nav-start' || entityId === 'nav-end' || entityId.startsWith('nav-waypoint-');
}

export function routeEntityIdsForOverlay(overlay: TwinRouteOverlay | null): string[] {
  if (!overlay) return [];
  return [
    ...ROUTE_ENTITY_CORE_IDS,
    ...overlay.waypoints.map((_, i) => routeWaypointEntityId(i)),
  ];
}
