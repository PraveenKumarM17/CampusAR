import { createHash } from 'crypto';
import type { GeoPoint } from '@campusar/shared';

const COORD_PRECISION = 6;

function roundCoord(value: number): number {
  return Number(value.toFixed(COORD_PRECISION));
}

function hashPayload(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function pointGeometryHash(latitude: number, longitude: number): string {
  return hashPayload([roundCoord(latitude), roundCoord(longitude)]);
}

export function ringGeometryHash(footprint: GeoPoint[]): string {
  const normalized = footprint.map((p) => [roundCoord(p.latitude), roundCoord(p.longitude)]);
  return hashPayload(normalized);
}

export function edgeGeometryHash(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): string {
  // Order endpoints so hash is orientation-invariant for the segment geometry.
  const a: [number, number] = [roundCoord(from.latitude), roundCoord(from.longitude)];
  const b: [number, number] = [roundCoord(to.latitude), roundCoord(to.longitude)];
  const [first, second] =
    a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]) ? [a, b] : [b, a];
  return hashPayload([first, second]);
}
