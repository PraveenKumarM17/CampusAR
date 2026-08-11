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

/** Auto-follow only when the fix is reliable and plausibly on campus. */
export function shouldFollowGps(pose: UserPose): boolean {
  return isReliableGpsFix(pose) && distanceFromCampusM(pose) <= CAMPUS_PROXIMITY_M;
}

export type GpsSnapResult =
  | { ok: true; node: GraphNode; distanceM: number; message: string }
  | { ok: false; message: string };

/** Snap raw GPS to the walk graph for routing — never moves the map marker. */
export function snapGpsForRouting(pose: UserPose, nodes: GraphNode[]): GpsSnapResult {
  const campusDist = distanceFromCampusM(pose);
  if (campusDist > CAMPUS_PROXIMITY_M) {
    return {
      ok: false,
      message: `You are ${(campusDist / 1000).toFixed(1)} km from RNSIT — pick a start point on the map.`,
    };
  }
  if (pose.accuracy != null && pose.accuracy > GPS_MAX_ACCURACY_M) {
    return {
      ok: false,
      message: `Low GPS accuracy (±${Math.round(pose.accuracy)} m) — move outdoors for a clearer sky view.`,
    };
  }
  const snap = nearestNode(pose, nodes, CAMPUS_SNAP_RADIUS_M);
  if (!snap) {
    return {
      ok: false,
      message: 'No campus path nearby — tap the map to set your start.',
    };
  }
  if (snap.distanceM > CAMPUS_MAX_SNAP_DISTANCE_M) {
    return {
      ok: false,
      message: `GPS uncertain (nearest path ${Math.round(snap.distanceM)} m away) — wait for a better fix.`,
    };
  }
  return {
    ok: true,
    node: snap.node,
    distanceM: snap.distanceM,
    message:
      snap.distanceM < 12
        ? `Tracking near ${snap.node.name ?? 'path'}`
        : `Near ${snap.node.name ?? 'path'} (${Math.round(snap.distanceM)} m)`,
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
