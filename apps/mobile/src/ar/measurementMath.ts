import type {ArWorldPoint} from './types';

/** Euclidean distance in meters between consecutive AR world points (same session frame). */
export function distanceMeters(a: ArWorldPoint, b: ArWorldPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function totalPathLengthM(points: ArWorldPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += distanceMeters(points[i - 1], points[i]);
  }
  return total;
}
