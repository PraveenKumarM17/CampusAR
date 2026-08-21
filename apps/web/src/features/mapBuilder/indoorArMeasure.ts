import type { LocalVec2, LocalVec3 } from '@campusar/shared';

/** Default floor-to-floor height when building has no override (meters). */
export const DEFAULT_FLOOR_HEIGHT_M = 3.5;

/**
 * 3D vector distance — same formula as AR-Measure LineManager (Unity Vector3.Distance).
 * @see https://github.com/lightlessdays/AR-Measure
 */
export function distance3D(a: LocalVec3, b: LocalVec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function distance2D(a: LocalVec2, b: LocalVec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** AR-Measure-style label: centimeters under 1 m, meters otherwise. */
export function formatMeasureDistance(meters: number): string {
  if (meters < 1) return `${(meters * 100).toFixed(2)} cm`;
  return `${meters.toFixed(2)} m`;
}

export function segmentMidpoint2D(a: LocalVec2, b: LocalVec2): LocalVec2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function segmentMidpoint3D(a: LocalVec3, b: LocalVec3): LocalVec3 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

/** Sum of consecutive segment lengths (open polyline). */
export function polylineLength2D(points: LocalVec2[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += distance2D(points[i - 1], points[i]);
  }
  return total;
}

export function polylineLength3D(points: LocalVec3[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += distance3D(points[i - 1], points[i]);
  }
  return total;
}

/** Vertical span between lowest and highest Y in an AR session. */
export function verticalSpan3D(points: LocalVec3[]): number {
  if (points.length < 2) return 0;
  const ys = points.map((p) => p.y);
  return Math.max(...ys) - Math.min(...ys);
}

/**
 * Build a room/corridor polygon from measured corners.
 * 2 points → axis-aligned rectangle; 4 points → quadrilateral; 3+ → bounding box.
 */
export function geometryFromMeasurePoints(points: LocalVec2[]): LocalVec2[] {
  if (points.length < 2) return [];
  if (points.length === 2) {
    const minX = Math.min(points[0].x, points[1].x);
    const maxX = Math.max(points[0].x, points[1].x);
    const minY = Math.min(points[0].y, points[1].y);
    const maxY = Math.max(points[0].y, points[1].y);
    if (maxX - minX < 0.25 || maxY - minY < 0.25) return [];
    return [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ];
  }
  if (points.length === 4) return points.map((p) => ({ x: p.x, y: p.y }));
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  if (maxX - minX < 0.25 || maxY - minY < 0.25) return [];
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

/** Map AR-local points (Y-up) to floor-plan meters using session origin. */
export function arSessionToFloorPlan(points: LocalVec3[], origin: LocalVec3): LocalVec2[] {
  return points.map((p) => ({
    x: p.x - origin.x,
    y: p.z - origin.z,
  }));
}

export function floorElevationM(level: number, floorHeightM: number): number {
  return level * floorHeightM;
}
