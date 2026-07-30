import type { GraphNode } from '@campusar/shared';

const R = 6371000;

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
