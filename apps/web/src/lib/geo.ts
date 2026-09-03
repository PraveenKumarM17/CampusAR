import type { GraphNode } from '@campusar/shared';
import { CAMPUS_CENTER } from './campus';

const R = 6371000;

/** Max accuracy (m) to trust for routing snap and auto-follow. */
export const GPS_MAX_ACCURACY_M = 100;
/** Max distance (m) from GPS fix to snap onto a walk node. */
export const CAMPUS_MAX_SNAP_DISTANCE_M = 100;
/** Search radius (m) for nearest walk node. */
export const CAMPUS_SNAP_RADIUS_M = 120;
/** Must be within this distance (m) of campus center to auto-track. */
export const CAMPUS_PROXIMITY_M = 1200;
/** Treat GPS fixes older than this as stale for navigation progress. */
export const GPS_STALE_MS = 15_000;

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Initial bearing from point 1 to point 2 in degrees (0 = north). */
export function bearingDegrees(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export interface UserPose {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  heading: number | null;
  timestamp: number;
}

export function distanceFromCampusM(
  pose: { latitude: number; longitude: number },
  center: { lat: number; lon: number } = CAMPUS_CENTER,
): number {
  return haversineMeters(pose.latitude, pose.longitude, center.lat, center.lon);
}

/** True when the browser-reported accuracy is good enough to follow on the map. */
export function isReliableGpsFix(pose: UserPose): boolean {
  return pose.accuracy == null || pose.accuracy <= GPS_MAX_ACCURACY_M;
}

/** True when the fix is recent enough for live navigation progress. */
export function isFreshGpsFix(pose: UserPose, maxAgeMs = GPS_STALE_MS): boolean {
  return Date.now() - pose.timestamp <= maxAgeMs;
}

/** GPS suitable for authoritative step/distance/arrival progress. */
export function isNavigationGpsReady(pose: UserPose | null): boolean {
  return pose != null && isReliableGpsFix(pose) && isFreshGpsFix(pose);
}

/** Auto-follow only when the fix is reliable and plausibly on campus. */
export function shouldFollowGps(pose: UserPose): boolean {
  return isReliableGpsFix(pose) && distanceFromCampusM(pose) <= CAMPUS_PROXIMITY_M;
}

/** Human-readable label for dropdowns and map tooltips. */
export function formatNodeLabel(node: GraphNode): string {
  const name = node.name?.trim();
  if (name) return name;
  switch (node.kind) {
    case 'entrance':
      return 'Building entrance';
    case 'exit':
      return 'Exit';
    case 'elevator':
      return 'Elevator';
    case 'stairs':
      return 'Stairs';
    case 'ramp':
      return 'Ramp';
    default:
      return 'Path point';
  }
}

/** Named campus destinations for pickers (deduped, sorted). */
export function namedPlaceNodes(nodes: GraphNode[]): GraphNode[] {
  const seen = new Set<string>();
  return nodes
    .filter((n) => {
      const name = n.name?.trim();
      if (!name) return false;
      const key = name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
}

// export type GpsSnapResult =
//   | { ok: true; node: GraphNode; distanceM: number; message: string }
//   | { ok: false; message: string };

/** Snap raw GPS to a named campus place for routing — never moves the map marker. */
export function snapGpsForRouting(
  pose: UserPose,
  nodes: GraphNode[],
): GpsSnapResult {
  const campusDistance = distanceFromCampusM(pose);

  if (campusDistance > CAMPUS_PROXIMITY_M) {
    return {
      ok: false,
      message:
        'You are outside the campus area. Move closer to campus to start outdoor navigation.',
    };
  }

  if (
    pose.accuracy !== null &&
    pose.accuracy > GPS_MAX_ACCURACY_M
  ) {
    return {
      ok: false,
      message: `GPS accuracy is low (±${Math.round(
        pose.accuracy,
      )} m). Move outdoors and try again.`,
    };
  }

  const outdoorNodes = nodes.filter(
    (node) =>
      node.active !== false &&
      (
        node.kind === 'outdoor' ||
        node.kind === 'entrance' ||
        node.kind === 'exit'
      ),
  );

  let nearest: GraphNode | null = null;
  let nearestDistance = Infinity;

  for (const node of outdoorNodes) {
    const distance = haversineMeters(
      pose.latitude,
      pose.longitude,
      node.latitude,
      node.longitude,
    );

    if (
      distance <= CAMPUS_SNAP_RADIUS_M &&
      distance < nearestDistance
    ) {
      nearest = node;
      nearestDistance = distance;
    }
  }

  if (!nearest) {
    return {
      ok: false,
      message:
        'No marked outdoor navigation node is nearby. Move closer to a campus walkway.',
    };
  }

  if (nearestDistance > CAMPUS_MAX_SNAP_DISTANCE_M) {
    return {
      ok: false,
      message: `Nearest outdoor node is ${Math.round(
        nearestDistance,
      )} m away. GPS position is too uncertain.`,
    };
  }

  return {
    ok: true,
    node: nearest,
    distanceM: nearestDistance,
    message:
      nearestDistance < 12
        ? `At ${nearest.name ?? 'outdoor navigation node'}`
        : `Near ${
            nearest.name ?? 'outdoor navigation node'
          } (${Math.round(nearestDistance)} m)`,
  };
}

/** Snap GPS to nearest walkable graph node within maxDistanceM. */
export function nearestNode(
  pose: { latitude: number; longitude: number },
  nodes: GraphNode[],
  maxDistanceM = 80,
  excludeId?: string,
): { node: GraphNode; distanceM: number } | null {
  let best: { node: GraphNode; distanceM: number } | null = null;
  for (const node of nodes) {
    if (excludeId && node.id === excludeId) continue;
    const distanceM = haversineMeters(
      pose.latitude,
      pose.longitude,
      node.latitude,
      node.longitude,
    );
    if (distanceM > maxDistanceM) continue;
    if (!best || distanceM < best.distanceM) best = { node, distanceM };
  }
  return best;
}

/** Closest node with no distance cap (for linking a new pin into the graph). */
export function closestNode(
  pose: { latitude: number; longitude: number },
  nodes: GraphNode[],
  excludeId?: string,
): { node: GraphNode; distanceM: number } | null {
  let best: { node: GraphNode; distanceM: number } | null = null;
  for (const node of nodes) {
    if (excludeId && node.id === excludeId) continue;
    const distanceM = haversineMeters(
      pose.latitude,
      pose.longitude,
      node.latitude,
      node.longitude,
    );
    if (!best || distanceM < best.distanceM) best = { node, distanceM };
  }
  return best;
}

/** Named places only — for “route to nearest destination”. */
export function closestNamedPlace(
  pose: { latitude: number; longitude: number },
  nodes: GraphNode[],
): { node: GraphNode; distanceM: number } | null {
  const named = nodes.filter((n) => n.name && n.name.trim().length > 0);
  return closestNode(pose, named);
}
export function nearestOutdoorNode(
  pose: { latitude: number; longitude: number },
  nodes: GraphNode[],
  maxDistanceM = CAMPUS_MAX_SNAP_DISTANCE_M,
): { node: GraphNode; distanceM: number } | null {
  const outdoorNodes = nodes.filter(
    (node) => node.kind === 'outdoor' && node.active !== false,
  );

  return nearestNode(pose, outdoorNodes, maxDistanceM);
}
export type GpsSnapResult =
  | {
      ok: true;
      node: GraphNode;
      distanceM: number;
      message: string;
    }
  | {
      ok: false;
      node?: undefined;
      distanceM?: undefined;
      message: string;
    };