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

/**
 * Shared measure math for Map Builder (2D floor-plan meters) and AR Measure (3D WebXR meters).
 * 2D uses `distance2D` on `floor-plan-meters-v1`. AR uses full `distance3D` so vertical spans
 * (floor height) are included. Both format with `formatMeasureDistance`.
 */

/** Snap radius on the floor-plan canvas (meters). Matches indoor graph snap order of magnitude. */
export const MEASURE_SNAP_M = 0.4;

/** AR-Measure-style label: centimeters under 1 m, meters otherwise. */
export function formatMeasureDistance(meters: number): string {
  if (meters < 1) return `${(meters * 100).toFixed(2)} cm`;
  return `${meters.toFixed(2)} m`;
}

/** Absolute heading of segment A→B in degrees (SVG/CSS rotate). */
export function segmentAngleDeg(a: LocalVec2, b: LocalVec2): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

/** Label rotation that stays readable (never upside-down). */
export function measureLabelRotationDeg(a: LocalVec2, b: LocalVec2): number {
  let deg = segmentAngleDeg(a, b);
  if (deg > 90) deg -= 180;
  if (deg < -90) deg += 180;
  return deg;
}

export function snapMeasurePoint(
  point: LocalVec2,
  candidates: LocalVec2[],
  toleranceM = MEASURE_SNAP_M,
): LocalVec2 {
  let best = point;
  let bestDist = toleranceM;
  for (const candidate of candidates) {
    const dist = distance2D(point, candidate);
    if (dist <= bestDist) {
      best = candidate;
      bestDist = dist;
    }
  }
  return best;
}

export function collectMeasureSnapTargets(input: {
  nodes?: { localX: number; localY: number; localZ: number }[];
  pois?: { localX: number; localY: number }[];
  rooms?: { localGeometry?: LocalVec2[] | null }[];
  corridors?: { localGeometry: LocalVec2[] }[];
}): LocalVec2[] {
  const pts: LocalVec2[] = [];
  for (const n of input.nodes ?? []) pts.push({ x: n.localX, y: n.localZ });
  for (const p of input.pois ?? []) pts.push({ x: p.localX, y: p.localY });
  for (const r of input.rooms ?? []) {
    for (const v of r.localGeometry ?? []) pts.push(v);
  }
  for (const c of input.corridors ?? []) {
    for (const v of c.localGeometry) pts.push(v);
  }
  return pts;
}

/** Column-major 4×4 × vec4 (WebGL / WebXR layout). */
export function multiplyMat4Vec4(
  m: ArrayLike<number>,
  x: number,
  y: number,
  z: number,
  w = 1,
): { x: number; y: number; z: number; w: number } {
  return {
    x: m[0] * x + m[4] * y + m[8] * z + m[12] * w,
    y: m[1] * x + m[5] * y + m[9] * z + m[13] * w,
    z: m[2] * x + m[6] * y + m[10] * z + m[14] * w,
    w: m[3] * x + m[7] * y + m[11] * z + m[15] * w,
  };
}

/**
 * Project a world-space point (same frame as WebXR hit poses) to overlay pixels.
 * Returns null when the point is behind the camera.
 */
export function projectWorldToScreen(
  world: LocalVec3,
  viewMatrix: ArrayLike<number>,
  projectionMatrix: ArrayLike<number>,
  width: number,
  height: number,
): { x: number; y: number } | null {
  const eye = multiplyMat4Vec4(viewMatrix, world.x, world.y, world.z, 1);
  const clip = multiplyMat4Vec4(projectionMatrix, eye.x, eye.y, eye.z, eye.w);
  if (clip.w <= 0 || !Number.isFinite(clip.w)) return null;
  const ndcX = clip.x / clip.w;
  const ndcY = clip.y / clip.w;
  if (!Number.isFinite(ndcX) || !Number.isFinite(ndcY)) return null;
  return {
    x: (ndcX * 0.5 + 0.5) * width,
    y: (-ndcY * 0.5 + 0.5) * height,
  };
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

/** Axis-aligned measured extents; length is always the longer floor-plan span. */
export function measuredRoomExtents(points: LocalVec2[]): {
  lengthM: number;
  widthM: number;
} | null {
  if (points.length < 2) return null;
  const spanX = Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x));
  const spanY = Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y));
  if (spanX <= 0 || spanY <= 0) return null;
  return {
    lengthM: Math.max(spanX, spanY),
    widthM: Math.min(spanX, spanY),
  };
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
