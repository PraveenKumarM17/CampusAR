import type { LocalVec2, LocalVec3 } from '@campusar/shared';
import { arSessionToFloorPlan, distance3D, formatMeasureDistance } from './indoorArMeasure';

export type Quat = { x: number; y: number; z: number; w: number };

export type SmoothedPose = {
  position: LocalVec3;
  orientation: Quat;
};

export type GpsFix = {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
};

export type AnchorSourceData = {
  planeId: string | null;
  timestamp: number;
  gps: GpsFix | null;
  confidence: number;
  /** True when XRAnchor creation failed and hit pose was locked instead. */
  hitFallback: boolean;
};

/** WebXR anchor-backed measure point (world-space, updated each frame). */
export type AnchorMeasurePoint = {
  id: string;
  xrAnchor: XRAnchor | null;
  worldPose: SmoothedPose | null;
  smoothedPose: SmoothedPose | null;
  sessionLocal: LocalVec3 | null;
  sourceData: AnchorSourceData;
  smoothing: PoseSmoothingFilter;
  /** Static world lock when createAnchor is unavailable. */
  fallbackWorld: LocalVec3 | null;
};

export type PlaneLock = {
  planeId: string;
  normal: LocalVec3;
  pointOnPlane: LocalVec3;
};

export type RenderableAnchorPoint = {
  id: string;
  screen: { x: number; y: number } | null;
  confidence: number;
  label: string | null;
  ringColor: string;
};

export type AnchorDistanceSegment = {
  from: { x: number; y: number };
  to: { x: number; y: number };
  label: string;
  opacity: number;
};

let activePlaneLock: PlaneLock | null = null;

export function getPlaneLock(): PlaneLock | null {
  return activePlaneLock;
}

export function resetPlaneLock(): void {
  activePlaneLock = null;
}

function vec3FromDomPoint(p: DOMPointReadOnly): LocalVec3 {
  return { x: p.x, y: p.y, z: p.z };
}

function quatFromDomPoint(p: DOMPointReadOnly): Quat {
  return { x: p.x, y: p.y, z: p.z, w: p.w };
}

function lerpVec3(a: LocalVec3, b: LocalVec3, t: number): LocalVec3 {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    z: lerp(a.z, b.z, t),
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function quatLen(q: Quat): number {
  return Math.hypot(q.x, q.y, q.z, q.w) || 1;
}

function quatNormalize(q: Quat): Quat {
  const len = quatLen(q);
  return { x: q.x / len, y: q.y / len, z: q.z / len, w: q.w / len };
}

function quatDot(a: Quat, b: Quat): number {
  return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
}

/** Spherical linear interpolation between two unit quaternions. */
export function slerpQuat(a: Quat, b: Quat, t: number): Quat {
  let q1 = quatNormalize(a);
  let q2 = quatNormalize(b);
  let dot = quatDot(q1, q2);
  if (dot < 0) {
    q2 = { x: -q2.x, y: -q2.y, z: -q2.z, w: -q2.w };
    dot = -dot;
  }
  if (dot > 0.9995) {
    return quatNormalize({
      x: lerp(q1.x, q2.x, t),
      y: lerp(q1.y, q2.y, t),
      z: lerp(q1.z, q2.z, t),
      w: lerp(q1.w, q2.w, t),
    });
  }
  const theta = Math.acos(Math.min(1, Math.max(-1, dot)));
  const sinTheta = Math.sin(theta);
  const w1 = Math.sin((1 - t) * theta) / sinTheta;
  const w2 = Math.sin(t * theta) / sinTheta;
  return {
    x: q1.x * w1 + q2.x * w2,
    y: q1.y * w1 + q2.y * w2,
    z: q1.z * w1 + q2.z * w2,
    w: q1.w * w1 + q2.w * w2,
  };
}

export function poseToSmoothed(pose: XRPose): SmoothedPose {
  return {
    position: vec3FromDomPoint(pose.transform.position),
    orientation: quatFromDomPoint(pose.transform.orientation),
  };
}

/** EMA + SLERP smoothing for XR rigid transforms. */
export class PoseSmoothingFilter {
  private readonly factor: number;
  private last: SmoothedPose | null = null;

  constructor(factor = 0.85) {
    this.factor = Math.min(0.99, Math.max(0, factor));
  }

  reset(): void {
    this.last = null;
  }

  update(pose: XRPose): SmoothedPose {
    const next = poseToSmoothed(pose);
    if (!this.last) {
      this.last = next;
      return next;
    }
    const t = 1 - this.factor;
    this.last = {
      position: lerpVec3(this.last.position, next.position, t),
      orientation: slerpQuat(this.last.orientation, next.orientation, t),
    };
    return this.last;
  }
}

/** Derive an approximate plane normal from hit pose (local +Y → world). */
export function planeNormalFromHitPose(pose: XRPose): LocalVec3 {
  const q = quatFromDomPoint(pose.transform.orientation);
  const up = quatRotateVec3(q, { x: 0, y: 1, z: 0 });
  const len = Math.hypot(up.x, up.y, up.z) || 1;
  return { x: up.x / len, y: up.y / len, z: up.z / len };
}

function quatRotateVec3(q: Quat, v: LocalVec3): LocalVec3 {
  const qx = q.x;
  const qy = q.y;
  const qz = q.z;
  const qw = q.w;
  const ix = qw * v.x + qy * v.z - qz * v.y;
  const iy = qw * v.y + qz * v.x - qx * v.z;
  const iz = qw * v.z + qx * v.y - qy * v.x;
  const iw = -qx * v.x - qy * v.y - qz * v.z;
  return {
    x: ix * qw + iw * -qx + iy * -qz - iz * -qy,
    y: iy * qw + iw * -qy + iz * -qx - ix * -qz,
    z: iz * qw + iw * -qz + ix * -qy - iy * -qx,
  };
}

function planeIdFromPose(pose: XRPose): string {
  const p = pose.transform.position;
  const n = planeNormalFromHitPose(pose);
  const key = `${n.x.toFixed(2)}:${n.y.toFixed(2)}:${n.z.toFixed(2)}:${p.x.toFixed(1)}:${p.z.toFixed(1)}`;
  return `plane-${key}`;
}

/** Lock measurement to the first detected plane. */
export function lockToPlane(hitResult: XRHitTestResult, referenceSpace: XRReferenceSpace): void {
  const pose = hitResult.getPose(referenceSpace);
  if (!pose) return;
  activePlaneLock = {
    planeId: planeIdFromPose(pose),
    normal: planeNormalFromHitPose(pose),
    pointOnPlane: vec3FromDomPoint(pose.transform.position),
  };
}

/** Reject hits that belong to a different plane than the locked one. */
export function validateHitTestForPlane(
  hitResult: XRHitTestResult,
  referenceSpace: XRReferenceSpace,
): boolean {
  if (!activePlaneLock) return true;
  const pose = hitResult.getPose(referenceSpace);
  if (!pose) return false;
  const normal = planeNormalFromHitPose(pose);
  const dot = normal.x * activePlaneLock.normal.x + normal.y * activePlaneLock.normal.y + normal.z * activePlaneLock.normal.z;
  if (dot < 0.92) {
    console.warn('[AR Measure] Hit rejected — different plane normal');
    return false;
  }
  const p = vec3FromDomPoint(pose.transform.position);
  const dx = p.x - activePlaneLock.pointOnPlane.x;
  const dy = p.y - activePlaneLock.pointOnPlane.y;
  const dz = p.z - activePlaneLock.pointOnPlane.z;
  const dist = Math.abs(dx * activePlaneLock.normal.x + dy * activePlaneLock.normal.y + dz * activePlaneLock.normal.z);
  if (dist > 0.08) {
    console.warn('[AR Measure] Hit rejected — too far from locked plane');
    return false;
  }
  return true;
}

function distanceVec3(a: LocalVec3, b: LocalVec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function updatePointConfidence(point: AnchorMeasurePoint, poseStable: boolean, trackingLost: boolean): void {
  if (trackingLost) {
    point.sourceData.confidence = Math.max(0, point.sourceData.confidence - 0.1);
  } else if (poseStable) {
    point.sourceData.confidence = Math.min(1, point.sourceData.confidence + 0.05);
  }
}

/**
 * Create an anchor-backed point from a hit-test result.
 * Falls back to a locked hit pose when XRAnchor is unavailable.
 */
export async function placePoint(
  hitResult: XRHitTestResult,
  frame: XRFrame,
  referenceSpace: XRReferenceSpace,
  gps: GpsFix | null,
): Promise<AnchorMeasurePoint | null> {
  if (!validateHitTestForPlane(hitResult, referenceSpace)) return null;

  const hitPose = hitResult.getPose(referenceSpace);
  if (!hitPose) return null;

  if (!activePlaneLock) lockToPlane(hitResult, referenceSpace);

  let xrAnchor: XRAnchor | null = null;
  let hitFallback = true;
  try {
    if (hitResult.createAnchor) {
      xrAnchor = (await hitResult.createAnchor()) ?? null;
      hitFallback = !xrAnchor;
    }
  } catch {
    xrAnchor = null;
    hitFallback = true;
  }

  const fallbackWorld = vec3FromDomPoint(hitPose.transform.position);
  const point: AnchorMeasurePoint = {
    id: `pt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    xrAnchor,
    worldPose: null,
    smoothedPose: null,
    sessionLocal: null,
    sourceData: {
      planeId: activePlaneLock?.planeId ?? null,
      timestamp: Date.now(),
      gps,
      confidence: 0.5,
      hitFallback,
    },
    smoothing: new PoseSmoothingFilter(0.85),
    fallbackWorld,
  };

  void frame;
  return point;
}

/** Query anchor poses each frame and apply smoothing + confidence. */
export function updatePoints(points: AnchorMeasurePoint[], frame: XRFrame, referenceSpace: XRReferenceSpace): void {
  for (const point of points) {
    let pose: XRPose | undefined;
    if (point.xrAnchor && frame.getPose) {
      pose = frame.getPose(point.xrAnchor.anchorSpace, referenceSpace);
    }

    if (pose) {
      const prev = point.smoothedPose?.position ?? null;
      point.worldPose = poseToSmoothed(pose);
      point.smoothedPose = point.smoothing.update(pose);
      const stable = prev
        ? distanceVec3(prev, point.smoothedPose.position) < 0.001
        : true;
      updatePointConfidence(point, stable, false);
      continue;
    }

    if (point.fallbackWorld) {
      const locked: SmoothedPose = {
        position: { ...point.fallbackWorld },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      };
      point.worldPose = locked;
      point.smoothedPose = locked;
      updatePointConfidence(point, true, false);
      continue;
    }

    updatePointConfidence(point, false, true);
  }

  if (points.length > 0 && points[0].smoothedPose) {
    const origin = points[0].smoothedPose.position;
    for (const point of points) {
      if (!point.smoothedPose) continue;
      point.sessionLocal = {
        x: point.smoothedPose.position.x - origin.x,
        y: point.smoothedPose.position.y - origin.y,
        z: point.smoothedPose.position.z - origin.z,
      };
    }
  }
}

export function confidenceRingColor(confidence: number): string {
  if (confidence >= 0.8) return '#10b981';
  if (confidence >= 0.5) return '#eab308';
  return '#f97316';
}

/** Project anchor poses to screen space for DOM overlay rendering. */
export function renderPoints(
  points: AnchorMeasurePoint[],
  frame: XRFrame,
  referenceSpace: XRReferenceSpace,
  width: number,
  height: number,
): RenderableAnchorPoint[] {
  const viewer = frame.getViewerPose(referenceSpace);
  const view = viewer?.views[0];
  if (!view) return [];

  return points.map((point, index) => {
    if (!point.smoothedPose) {
      return {
        id: point.id,
        screen: null,
        confidence: point.sourceData.confidence,
        label: null,
        ringColor: confidenceRingColor(point.sourceData.confidence),
      };
    }

    const screen = projectPointToScreen(
      point.smoothedPose.position,
      view.transform.inverse.matrix,
      view.projectionMatrix,
      width,
      height,
    );

    const showLabel = point.sourceData.confidence >= 0.6;
    return {
      id: point.id,
      screen,
      confidence: point.sourceData.confidence,
      label: showLabel && index === 0 ? 'Origin' : showLabel ? `P${index + 1}` : null,
      ringColor: confidenceRingColor(point.sourceData.confidence),
    };
  });
}

function projectPointToScreen(
  world: LocalVec3,
  viewMatrix: ArrayLike<number>,
  projectionMatrix: ArrayLike<number>,
  width: number,
  height: number,
): { x: number; y: number } | null {
  const mul = (m: ArrayLike<number>, x: number, y: number, z: number, w: number) => ({
    x: m[0] * x + m[4] * y + m[8] * z + m[12] * w,
    y: m[1] * x + m[5] * y + m[9] * z + m[13] * w,
    z: m[2] * x + m[6] * y + m[10] * z + m[14] * w,
    w: m[3] * x + m[7] * y + m[11] * z + m[15] * w,
  });
  const eye = mul(viewMatrix, world.x, world.y, world.z, 1);
  const clip = mul(projectionMatrix, eye.x, eye.y, eye.z, eye.w);
  if (clip.w <= 0 || !Number.isFinite(clip.w)) return null;
  const ndcX = clip.x / clip.w;
  const ndcY = clip.y / clip.w;
  if (!Number.isFinite(ndcX) || !Number.isFinite(ndcY)) return null;
  return {
    x: (ndcX * 0.5 + 0.5) * width,
    y: (-ndcY * 0.5 + 0.5) * height,
  };
}

/** Distance labels between consecutive anchor poses. */
export function updateDistances(
  points: AnchorMeasurePoint[],
  rendered: RenderableAnchorPoint[],
): AnchorDistanceSegment[] {
  const segments: AnchorDistanceSegment[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const fromScreen = rendered[i - 1]?.screen;
    const toScreen = rendered[i]?.screen;
    if (!a.smoothedPose || !b.smoothedPose || !fromScreen || !toScreen) continue;

    const conf = Math.min(a.sourceData.confidence, b.sourceData.confidence);
    if (conf < 0.6) continue;

    const meters = distance3D(a.smoothedPose.position, b.smoothedPose.position);
    segments.push({
      from: fromScreen,
      to: toScreen,
      label: formatMeasureDistance(meters),
      opacity: conf >= 0.8 ? 1 : conf >= 0.5 ? 0.75 : 0.5,
    });
  }
  return segments;
}

export function pathLengthMeters(points: AnchorMeasurePoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1].smoothedPose;
    const b = points[i].smoothedPose;
    if (!a || !b) continue;
    total += distance3D(a.position, b.position);
  }
  return total;
}

export type SavedFloorPlane = {
  planPoints: LocalVec2[];
  metadata: {
    averageConfidence: number;
    planeId: string | null;
    gpsPoints: (GpsFix | null)[];
    worldPositions: LocalVec3[];
    source: 'camera_ar';
    heightM?: number;
  };
};

/** Convert anchor world positions to floor-plan coordinates (first anchor = origin). */
export function saveFloorPlane(points: AnchorMeasurePoint[]): SavedFloorPlane | null {
  if (points.length < 2) return null;
  const withPose = points.filter((p) => p.smoothedPose);
  if (withPose.length < 2) return null;

  const origin = withPose[0].smoothedPose!.position;
  const worldPositions = withPose.map((p) => ({ ...p.smoothedPose!.position }));
  const sessionLocals = withPose.map((p) => ({
    x: p.smoothedPose!.position.x - origin.x,
    y: p.smoothedPose!.position.y - origin.y,
    z: p.smoothedPose!.position.z - origin.z,
  }));

  const planPoints = arSessionToFloorPlan(
    sessionLocals.map((p) => ({ x: p.x, y: p.y, z: p.z })),
    { x: 0, y: 0, z: 0 },
  );

  const ys = sessionLocals.map((p) => p.y);
  const verticalSpan = ys.length > 1 ? Math.max(...ys) - Math.min(...ys) : 0;

  const avgConfidence =
    withPose.reduce((sum, p) => sum + p.sourceData.confidence, 0) / withPose.length;

  return {
    planPoints,
    metadata: {
      averageConfidence: avgConfidence,
      planeId: activePlaneLock?.planeId ?? withPose[0].sourceData.planeId,
      gpsPoints: withPose.map((p) => p.sourceData.gps),
      worldPositions,
      source: 'camera_ar',
      heightM: verticalSpan >= 0.5 ? Number(verticalSpan.toFixed(3)) : undefined,
    },
  };
}

export function deleteAnchorPoint(point: AnchorMeasurePoint): void {
  try {
    point.xrAnchor?.delete();
  } catch {
    // ignore
  }
  point.smoothing.reset();
}

export function clearAnchorPoints(points: AnchorMeasurePoint[]): void {
  for (const p of points) deleteAnchorPoint(p);
  resetPlaneLock();
}
