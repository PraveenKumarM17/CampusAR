import type { LocalVec2, LocalVec3 } from '@campusar/shared';

/** Default floor-to-floor height when building has no override (meters). */
export const DEFAULT_FLOOR_HEIGHT_M = 3.5;

const CAMERA_OPEN_TIMEOUT_MS = 12_000;
const VIDEO_PLAY_TIMEOUT_MS = 4_000;

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

/** Open the rear camera with fallbacks — avoids hanging forever on strict constraints. */
export async function openCameraStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera API is not available. Use Chrome on Android over HTTPS.');
  }

  const attempts: MediaStreamConstraints[] = [
    { video: { facingMode: { ideal: 'environment' } }, audio: false },
    { video: { facingMode: 'environment' }, audio: false },
    { video: true, audio: false },
  ];

  let lastError: unknown;
  for (const constraints of attempts) {
    try {
      return await withTimeout(
        navigator.mediaDevices.getUserMedia(constraints),
        CAMERA_OPEN_TIMEOUT_MS,
        'Camera timed out. In browser site settings, allow Camera for this site, then try again.',
      );
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Could not open the camera');
}

/** Bind a MediaStream to a video element without hanging indefinitely on play(). */
export async function attachCameraToVideo(
  stream: MediaStream,
  video: HTMLVideoElement,
): Promise<void> {
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', 'true');
  video.setAttribute('webkit-playsinline', 'true');

  await new Promise<void>((resolve, reject) => {
    const track = stream.getVideoTracks()[0];
    if (!track) {
      reject(new Error('No video track in camera stream'));
      return;
    }

    let settled = false;
    const finish = (ok: boolean, err?: unknown) => {
      if (settled) return;
      settled = true;
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('playing', onReady);
      if (ok) resolve();
      else reject(err instanceof Error ? err : new Error('Camera preview failed to start'));
    };

    const onReady = () => {
      if (video.videoWidth > 0 || track.readyState === 'live') finish(true);
    };

    video.addEventListener('loadeddata', onReady);
    video.addEventListener('playing', onReady);

    void withTimeout(video.play(), VIDEO_PLAY_TIMEOUT_MS, 'Video play timed out')
      .then(() => finish(true))
      .catch((err) => {
        if (track.readyState === 'live') finish(true);
        else finish(false, err);
      });

    window.setTimeout(() => {
      if (track.readyState === 'live') finish(true);
    }, VIDEO_PLAY_TIMEOUT_MS + 500);
  });
}

export async function probeCameraPermission(): Promise<'granted' | 'denied' | 'prompt' | 'unknown'> {
  try {
    const status = await navigator.permissions.query({ name: 'camera' as PermissionName });
    return status.state;
  } catch {
    return 'unknown';
  }
}

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

export type MeasureMode = 'webxr' | 'camera';

/** WebXR immersive-ar when available; otherwise camera + device-orientation fallback (iOS). */
export async function detectMeasureMode(): Promise<MeasureMode> {
  if (!window.isSecureContext || !navigator.xr?.isSessionSupported) return 'camera';
  const ok = await navigator.xr.isSessionSupported('immersive-ar').catch(() => false);
  return ok ? 'webxr' : 'camera';
}

export function stopMediaStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((t) => t.stop());
}

export const CAMERA_EYE_Y = 1.45;
const DEFAULT_FOV_DEG = 63;
const ORIENTATION_STALE_MS = 500;
const STATIONARY_ACCEL_THRESHOLD = 0.25;
const MAX_WALK_SPEED_MPS = 2.5;
const VELOCITY_DAMPING = 0.88;

export type DeviceOrientationAngles = {
  alpha: number;
  beta: number;
  gamma: number;
};

/** Locked world-space anchor captured once at placement time. */
export type AnchoredWorldPoint = {
  id: string;
  world: LocalVec3;
  lockedAt: number;
  placedOrientation: DeviceOrientationAngles;
  placedEyePosition: LocalVec3;
};

export type CameraPositionEstimate = {
  position: LocalVec3;
  velocity: LocalVec3;
  lastUpdateTime: number;
  confidence: number;
};

function degToRad(d: number): number {
  return (d * Math.PI) / 180;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Shortest-path interpolation for compass degrees. */
export function lerpAngleDeg(a: number, b: number, t: number): number {
  let delta = ((b - a + 540) % 360) - 180;
  return a + delta * t;
}

/** W3C deviceorientation → column-major 3×3 rotation (device → world, Y-up). */
export function rotationMatrixFromDeviceOrientation(
  alpha: number,
  beta: number,
  gamma: number,
): number[] {
  const z = degToRad(alpha);
  const x = degToRad(beta);
  const y = degToRad(gamma);

  const cz = Math.cos(z);
  const sz = Math.sin(z);
  const cx = Math.cos(x);
  const sx = Math.sin(x);
  const cy = Math.cos(y);
  const sy = Math.sin(y);

  // R = Rz(alpha) * Rx(beta) * Ry(gamma)
  return [
    cz * cy - sz * sx * sy,
    -sz * cx,
    cz * sy + sz * sx * cy,
    sz * cy + cz * sx * sy,
    cz * cx,
    sz * sy - cz * sx * cy,
    -cx * sy,
    sx,
    cx * cy,
  ];
}

function mat3MulVec3(m: number[], v: LocalVec3): LocalVec3 {
  return {
    x: m[0] * v.x + m[1] * v.y + m[2] * v.z,
    y: m[3] * v.x + m[4] * v.y + m[5] * v.z,
    z: m[6] * v.x + m[7] * v.y + m[8] * v.z,
  };
}

/** View forward in world space (device −Z axis). */
export function forwardFromFullOrientation(
  alpha: number,
  beta: number,
  gamma: number,
): LocalVec3 {
  const m = rotationMatrixFromDeviceOrientation(alpha, beta, gamma);
  const f = mat3MulVec3(m, { x: 0, y: 0, z: -1 });
  const len = Math.hypot(f.x, f.y, f.z) || 1;
  return { x: f.x / len, y: f.y / len, z: f.z / len };
}

/** @deprecated Use forwardFromFullOrientation — kept for compatibility. */
export function forwardFromDeviceOrientation(beta: number, gamma: number): LocalVec3 {
  return forwardFromFullOrientation(0, beta, gamma);
}

function cameraBasisFromOrientation(alpha: number, beta: number, gamma: number) {
  const m = rotationMatrixFromDeviceOrientation(alpha, beta, gamma);
  const forward = mat3MulVec3(m, { x: 0, y: 0, z: -1 });
  const upDevice = mat3MulVec3(m, { x: 0, y: 1, z: 0 });
  let rx = forward.y * upDevice.z - forward.z * upDevice.y;
  let ry = forward.z * upDevice.x - forward.x * upDevice.z;
  let rz = forward.x * upDevice.y - forward.y * upDevice.x;
  const rlen = Math.hypot(rx, ry, rz) || 1;
  rx /= rlen;
  ry /= rlen;
  rz /= rlen;
  let ux = ry * forward.z - rz * forward.y;
  let uy = rz * forward.x - rx * forward.z;
  let uz = rx * forward.y - ry * forward.x;
  const ulen = Math.hypot(ux, uy, uz) || 1;
  return {
    forward: {
      x: forward.x,
      y: forward.y,
      z: forward.z,
    },
    right: { x: rx, y: ry, z: rz },
    up: { x: ux / ulen, y: uy / ulen, z: uz / ulen },
  };
}

/** Ray–plane intersection for a horizontal floor (Y-up). */
export function rayPlaneIntersect(
  origin: LocalVec3,
  direction: LocalVec3,
  planeY = 0,
): LocalVec3 | null {
  if (Math.abs(direction.y) < 0.05) return null;
  const t = (planeY - origin.y) / direction.y;
  if (t < 0.15 || t > 25) return null;
  return {
    x: origin.x + direction.x * t,
    y: planeY,
    z: origin.z + direction.z * t,
  };
}

/** Intersect view ray with floor using full device orientation + estimated eye position. */
export function hitHorizontalPlaneFromOrientation(
  alpha: number,
  beta: number,
  gamma: number,
  planeY = 0,
  eye: LocalVec3 = { x: 0, y: CAMERA_EYE_Y, z: 0 },
): LocalVec3 | null {
  const forward = forwardFromFullOrientation(alpha, beta, gamma);
  return rayPlaneIntersect(eye, forward, planeY);
}

/** Project a fixed world point to screen using current camera pose. */
export function projectWorldToCameraScreen(
  world: LocalVec3,
  eye: LocalVec3,
  alpha: number,
  beta: number,
  gamma: number,
  width: number,
  height: number,
): { x: number; y: number } | null {
  const { forward, right, up } = cameraBasisFromOrientation(alpha, beta, gamma);
  const vx = world.x - eye.x;
  const vy = world.y - eye.y;
  const vz = world.z - eye.z;
  const camZ = vx * forward.x + vy * forward.y + vz * forward.z;
  if (camZ < 0.1) return null;
  const camX = vx * right.x + vy * right.y + vz * right.z;
  const camY = vx * up.x + vy * up.y + vz * up.z;

  const fovRad = (DEFAULT_FOV_DEG * Math.PI) / 180;
  const scale = (height / 2) / Math.tan(fovRad / 2);
  return {
    x: width / 2 + (camX / camZ) * scale,
    y: height / 2 - (camY / camZ) * scale,
  };
}

/** Project session-local floor point using tracker state (camera mode). */
export function projectSessionPointToScreen(
  point: LocalVec3,
  sessionOrigin: LocalVec3 | null,
  eye: LocalVec3,
  alpha: number,
  beta: number,
  gamma: number,
  width: number,
  height: number,
): { x: number; y: number } | null {
  const abs: LocalVec3 = sessionOrigin
    ? {
        x: sessionOrigin.x + point.x,
        y: sessionOrigin.y + point.y,
        z: sessionOrigin.z + point.z,
      }
    : point;
  return projectWorldToCameraScreen(abs, eye, alpha, beta, gamma, width, height);
}

/**
 * Tracks smoothed orientation + dead-reckoned camera position for camera-only AR.
 * World frame is fixed at calibrate() — anchors never move after lockAnchor().
 */
export class CameraPoseTracker {
  private filtered: DeviceOrientationAngles = { alpha: 0, beta: 90, gamma: 0 };
  private eye: LocalVec3 = { x: 0, y: CAMERA_EYE_Y, z: 0 };
  private velocity: LocalVec3 = { x: 0, y: 0, z: 0 };
  private lastOrientationMs = 0;
  private lastMotionMs = 0;
  private calibrated = false;
  private readonly filterStrength = 0.18;

  calibrate(orientation: DeviceOrientationAngles): void {
    this.filtered = { ...orientation };
    this.eye = { x: 0, y: CAMERA_EYE_Y, z: 0 };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.lastOrientationMs = performance.now();
    this.lastMotionMs = this.lastOrientationMs;
    this.calibrated = true;
  }

  reset(): void {
    this.calibrated = false;
    this.velocity = { x: 0, y: 0, z: 0 };
    this.eye = { x: 0, y: CAMERA_EYE_Y, z: 0 };
  }

  updateOrientation(alpha: number, beta: number, gamma: number, timestamp = performance.now()): void {
    this.lastOrientationMs = timestamp;
    const f = this.filterStrength;
    this.filtered = {
      alpha: lerpAngleDeg(this.filtered.alpha, alpha, f),
      beta: lerp(this.filtered.beta, beta, f),
      gamma: lerp(this.filtered.gamma, gamma, f),
    };
  }

  updateMotion(
    deviceAccel: LocalVec3 | null,
    timestamp = performance.now(),
  ): void {
    if (!this.calibrated || !deviceAccel) return;
    const dt = Math.min(0.05, Math.max(0.001, (timestamp - this.lastMotionMs) / 1000));
    this.lastMotionMs = timestamp;

    const m = rotationMatrixFromDeviceOrientation(
      this.filtered.alpha,
      this.filtered.beta,
      this.filtered.gamma,
    );
    const worldAccel = mat3MulVec3(m, deviceAccel);
    const mag = Math.hypot(deviceAccel.x, deviceAccel.y, deviceAccel.z);

    if (mag < STATIONARY_ACCEL_THRESHOLD) {
      this.velocity.x *= VELOCITY_DAMPING;
      this.velocity.z *= VELOCITY_DAMPING;
    } else {
      this.velocity.x += worldAccel.x * dt;
      this.velocity.z += worldAccel.z * dt;
      const speed = Math.hypot(this.velocity.x, this.velocity.z);
      if (speed > MAX_WALK_SPEED_MPS) {
        const scale = MAX_WALK_SPEED_MPS / speed;
        this.velocity.x *= scale;
        this.velocity.z *= scale;
      }
    }

    this.eye.x += this.velocity.x * dt;
    this.eye.z += this.velocity.z * dt;
    this.eye.y = CAMERA_EYE_Y;
  }

  isOrientationStale(thresholdMs = ORIENTATION_STALE_MS): boolean {
    return performance.now() - this.lastOrientationMs > thresholdMs;
  }

  getOrientation(): DeviceOrientationAngles {
    return { ...this.filtered };
  }

  getEyePosition(): LocalVec3 {
    return { ...this.eye };
  }

  getCameraEstimate(): CameraPositionEstimate {
    const stale = this.isOrientationStale();
    return {
      position: this.getEyePosition(),
      velocity: { ...this.velocity },
      lastUpdateTime: this.lastOrientationMs,
      confidence: stale ? 0.35 : this.calibrated ? 0.85 : 0.5,
    };
  }

  /** Reticle hit — recalculated every frame (not stored). */
  hitFloor(planeY = 0): LocalVec3 | null {
    const { alpha, beta, gamma } = this.filtered;
    return hitHorizontalPlaneFromOrientation(alpha, beta, gamma, planeY, this.eye);
  }

  /** Capture a locked floor anchor once at placement time. */
  lockFloorAnchor(): AnchoredWorldPoint | null {
    const hit = this.hitFloor();
    if (!hit) return null;
    return {
      id: `anchor-${Date.now()}`,
      world: { ...hit },
      lockedAt: Date.now(),
      placedOrientation: this.getOrientation(),
      placedEyePosition: this.getEyePosition(),
    };
  }

  projectAnchor(
    absoluteWorld: LocalVec3,
    width: number,
    height: number,
  ): { x: number; y: number } | null {
    const { alpha, beta, gamma } = this.filtered;
    return projectWorldToCameraScreen(absoluteWorld, this.eye, alpha, beta, gamma, width, height);
  }

  projectSessionLocal(
    sessionLocal: LocalVec3,
    sessionOrigin: LocalVec3,
    width: number,
    height: number,
  ): { x: number; y: number } | null {
    return this.projectAnchor(
      {
        x: sessionOrigin.x + sessionLocal.x,
        y: sessionOrigin.y + sessionLocal.y,
        z: sessionOrigin.z + sessionLocal.z,
      },
      width,
      height,
    );
  }
}

/** iOS 13+ requires a user gesture before deviceorientation events fire. */
export async function requestDeviceOrientationAccess(): Promise<boolean> {
  const req = (
    DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    }
  ).requestPermission;
  if (!req) return true;
  try {
    return (await req()) === 'granted';
  } catch {
    return false;
  }
}

/** iOS 13+ DeviceMotion permission (accelerometer for position tracking). */
export async function requestDeviceMotionAccess(): Promise<boolean> {
  const req = (
    DeviceMotionEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    }
  ).requestPermission;
  if (!req) return true;
  try {
    return (await req()) === 'granted';
  } catch {
    return false;
  }
}
