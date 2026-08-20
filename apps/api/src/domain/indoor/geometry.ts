import type { IndoorEdgeKind, LocalVec3 } from '@campusar/shared';

export function euclideanMeters(a: LocalVec3, b: LocalVec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function polylineDistanceM(points: LocalVec3[]): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += euclideanMeters(points[i], points[i + 1]);
  }
  return total;
}

export function edgeDistanceM(from: LocalVec3, to: LocalVec3, waypoints: LocalVec3[] = []): number {
  return polylineDistanceM([from, ...waypoints, to]);
}

/** Horizontal bearing in the AR local XZ plane (Y-up). 0° = +Z, clockwise-positive like compass. */
export function localBearingDegrees(from: LocalVec3, to: LocalVec3): number {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const deg = (Math.atan2(dx, dz) * 180) / Math.PI;
  return (deg + 360) % 360;
}

export function indoorKindToRoutingKind(
  kind: IndoorEdgeKind,
): 'walkway' | 'stairs' | 'elevator' | 'ramp' | 'corridor' {
  if (kind === 'walk') return 'walkway';
  if (kind === 'escalator') return 'stairs';
  return kind;
}

export function snapCandidate<T extends { localX: number; localY: number; localZ: number }>(
  point: LocalVec3,
  nodes: T[],
  thresholdM: number,
): T | null {
  let best: T | null = null;
  let bestD = thresholdM;
  for (const node of nodes) {
    const d = euclideanMeters(point, { x: node.localX, y: node.localY, z: node.localZ });
    if (d <= bestD) {
      best = node;
      bestD = d;
    }
  }
  return best;
}
