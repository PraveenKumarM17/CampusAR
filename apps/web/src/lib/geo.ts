import type { GraphNode } from '@campusar/shared';
import { CAMPUS_CENTER } from './campus';

const R = 6371000;

/** Max accuracy (m) to trust for routing snap and auto-follow. */
export const GPS_MAX_ACCURACY_M = 65;
/** Max distance (m) from GPS fix to snap onto a walk node. */
export const CAMPUS_MAX_SNAP_DISTANCE_M = 35;
/** Search radius (m) for nearest walk node. */
export const CAMPUS_SNAP_RADIUS_M = 45;
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

export function distanceFromCampusM(pose: { latitude: number; longitude: number }): number {
  return haversineMeters(pose.latitude, pose.longitude, CAMPUS_CENTER.lat, CAMPUS_CENTER.lon);
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

export type GpsSnapResult =
  | { ok: true; node: GraphNode; distanceM: number; message: string }
  | { ok: false; message: string };

/** Snap raw GPS to a named campus place for routing — never moves the map marker. */
export function snapGpsForRouting(pose: UserPose, nodes: GraphNode[]): GpsSnapResult {
  const campusDist = distanceFromCampusM(pose);
  if (campusDist > CAMPUS_PROXIMITY_M) {
    return {
      ok: false,
      message: `You are ${(campusDist / 1000).toFixed(1)} km from RNSIT — pick a start point manually.`,
    };
  }
  if (pose.accuracy != null && pose.accuracy > GPS_MAX_ACCURACY_M) {
    return {
      ok: false,
      message: `Low GPS accuracy (±${Math.round(pose.accuracy)} m) — move outdoors, then tap Track me.`,
    };
  }
  const places = namedPlaceNodes(nodes);
  const snap = nearestNode(pose, places, CAMPUS_SNAP_RADIUS_M);
  if (!snap) {
    return {
      ok: false,
      message: 'No named place nearby — pick your start from the list or map.',
    };
  }
  if (snap.distanceM > CAMPUS_MAX_SNAP_DISTANCE_M) {
    return {
      ok: false,
      message: `GPS uncertain (${Math.round(snap.distanceM)} m from ${snap.node.name}) — tap Track me again outdoors.`,
    };
  }
  return {
    ok: true,
    node: snap.node,
    distanceM: snap.distanceM,
    message:
      snap.distanceM < 12
        ? `At ${snap.node.name}`
        : `Near ${snap.node.name} (${Math.round(snap.distanceM)} m)`,
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
