import { AppError } from '../domain/errors';
import type { LocalVec2 } from '@campusar/shared';

const MIN_VERTICES = 3;
const MIN_AREA_M2 = 0.25;
const MAX_COORD_M = 10_000;

function openRing(ring: LocalVec2[]): LocalVec2[] {
  if (ring.length < 2) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first.x === last.x && first.y === last.y) return ring.slice(0, -1);
  return ring;
}

function shoelaceArea(ring: LocalVec2[]): number {
  const pts = openRing(ring);
  if (pts.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export function validateLocalPolygon(ring: LocalVec2[], label = 'Geometry'): void {
  if (!Array.isArray(ring) || ring.length < MIN_VERTICES) {
    throw new AppError(
      'INVALID_GEOMETRY',
      `${label} must have at least ${MIN_VERTICES} vertices`,
      422,
    );
  }
  for (const p of ring) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      throw new AppError('INVALID_GEOMETRY', `${label} has non-finite coordinates`, 422);
    }
    if (Math.abs(p.x) > MAX_COORD_M || Math.abs(p.y) > MAX_COORD_M) {
      throw new AppError('INVALID_GEOMETRY', `${label} coordinates are out of range`, 422);
    }
  }
  const area = shoelaceArea(ring);
  if (!Number.isFinite(area) || area < MIN_AREA_M2) {
    throw new AppError('INVALID_GEOMETRY', `${label} area is too small`, 422);
  }
}

export function validateLocalPoint(x: number, y: number, label = 'Point'): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new AppError('INVALID_GEOMETRY', `${label} has non-finite coordinates`, 422);
  }
  if (Math.abs(x) > MAX_COORD_M || Math.abs(y) > MAX_COORD_M) {
    throw new AppError('INVALID_GEOMETRY', `${label} coordinates are out of range`, 422);
  }
}

export function polygonCentroid(ring: LocalVec2[]): LocalVec2 {
  const pts = openRing(ring);
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pts.length, y: y / pts.length };
}

export function ringsOverlap(a: LocalVec2[], b: LocalVec2[]): boolean {
  const ca = polygonCentroid(a);
  const cb = polygonCentroid(b);
  const threshold = 0.5;
  return Math.hypot(ca.x - cb.x, ca.y - cb.y) < threshold;
}

export function parseLocalGeometry(raw: unknown): LocalVec2[] | null {
  if (!raw) return null;
  if (!Array.isArray(raw)) return null;
  return raw.map((p) => {
    const pt = p as Record<string, unknown>;
    return { x: Number(pt.x), y: Number(pt.y) };
  });
}
