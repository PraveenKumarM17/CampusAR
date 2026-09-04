import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Circle, RotateCcw, Trash2, Undo2, X } from 'lucide-react';
import type { LocalVec2, LocalVec3 } from '@campusar/shared';
import { api } from '../../lib/api';
import {
  arSessionToFloorPlan,
  attachCameraToVideo,
  detectMeasureMode,
  distance3D,
  formatMeasureDistance,
  hitHorizontalPlaneFromOrientation,
  measureLabelRotationDeg,
  openCameraStream,
  polylineLength3D,
  projectSessionPointToScreen,
  projectWorldToScreen,
  requestDeviceOrientationAccess,
  stopMediaStream,
  type MeasureMode,
  verticalSpan3D,
} from './indoorArMeasure';
import { MeasureDistancePill } from './MeasureDistancePill';

type ScreenPt = { x: number; y: number };

const BTN_PRIMARY =
  'flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white shadow disabled:opacity-40';
const BTN_SECONDARY =
  'flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-lg border border-white/30 bg-white/10 px-4 text-sm font-semibold text-white disabled:opacity-40';

type GpsFix = {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
};

type PlacedPoint = {
  world: LocalVec3;
  gps: GpsFix | null;
};

type Props = {
  onClose: () => void;
  /** Camera stream opened in the same user gesture as opening this panel (parent-owned). */
  initialCameraStream?: MediaStream | null;
  /** Set when the parent failed to open the camera before showing the panel. */
  openError?: string | null;
  /** Called when the panel opens/closes its own camera stream (e.g. after WebXR). */
  onCameraStreamChange?: (stream: MediaStream | null) => void;
  accessToken?: string | null;
  siteId?: string | null;
  buildingId?: string | null;
  floorId?: string | null;
  mapVersionId?: string | null;
  floorLevel?: number | null;
  /** Apply measured floor-plan points to the canvas (origin = first AR point). */
  onApplyPlanPoints?: (
    points: LocalVec2[],
    measurement: { source: 'camera_ar'; heightM?: number },
  ) => void;
  /** Suggest floor height from vertical AR span. */
  onSuggestFloorHeight?: (heightM: number) => void;
};

type XRSessionWithHitTest = XRSession & {
  requestHitTestSource?: (init: { space: XRReferenceSpace }) => Promise<XRHitTestSource | undefined>;
};


function readGpsFix(): Promise<GpsFix> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not available on this device'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          altitude: pos.coords.altitude ?? undefined,
          accuracy: pos.coords.accuracy,
        }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  });
}

function captureOverlayPng(
  size: { width: number; height: number },
  video: HTMLVideoElement | null,
  points: ScreenPt[],
  labels: { from: ScreenPt; to: ScreenPt; label: string }[],
) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(size.width));
  canvas.height = Math.max(1, Math.round(size.height));
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  if (video && video.readyState >= 2) ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  else {
    ctx.fillStyle = '#12171c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#10b981';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  points.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#065f46';
  ctx.lineWidth = 2;
  for (const p of points) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.font = 'bold 13px "Public Sans", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const seg of labels) {
    const mx = (seg.from.x + seg.to.x) / 2;
    const my = (seg.from.y + seg.to.y) / 2;
    const w = Math.max(56, seg.label.length * 8);
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, mx - w / 2, my - 12, w, 24, 12);
    ctx.fill();
    ctx.fillStyle = '#1a2228';
    ctx.fillText(seg.label, mx, my);
  }
  const url = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.href = url;
  link.download = `campusar-measure-${Date.now()}.png`;
  link.click();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

type OverlaySeg = { from: ScreenPt; to: ScreenPt; label: string };

function buildOverlaySegments(
  screenPts: (ScreenPt | null)[],
  worldPoints: LocalVec3[],
): OverlaySeg[] {
  const segs: OverlaySeg[] = [];
  for (let i = 1; i < worldPoints.length; i++) {
    const from = screenPts[i - 1];
    const to = screenPts[i];
    if (!from || !to) continue;
    segs.push({
      from,
      to,
      label: formatMeasureDistance(distance3D(worldPoints[i - 1], worldPoints[i])),
    });
  }
  return segs;
}

/** Imperative overlay — updated every animation frame so markers stay world-anchored. */
function paintArOverlay(
  markersEl: HTMLDivElement,
  svgEl: SVGSVGElement,
  pillsEl: HTMLDivElement,
  screenPts: (ScreenPt | null)[],
  segments: OverlaySeg[],
) {
  while (markersEl.children.length < screenPts.length) {
    const span = document.createElement('span');
    span.className =
      'absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-emerald-800 bg-white shadow';
    markersEl.appendChild(span);
  }
  for (let i = 0; i < markersEl.children.length; i++) {
    const el = markersEl.children[i] as HTMLElement;
    const pt = screenPts[i];
    if (i >= screenPts.length || !pt) {
      el.style.display = 'none';
      continue;
    }
    el.style.display = '';
    el.style.left = `${pt.x}px`;
    el.style.top = `${pt.y}px`;
  }

  while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
  for (const seg of segments) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(seg.from.x));
    line.setAttribute('y1', String(seg.from.y));
    line.setAttribute('x2', String(seg.to.x));
    line.setAttribute('y2', String(seg.to.y));
    line.setAttribute('stroke', '#10b981');
    line.setAttribute('stroke-width', '3');
    line.setAttribute('stroke-linecap', 'round');
    svgEl.appendChild(line);
  }

  pillsEl.innerHTML = '';
  for (const seg of segments) {
    const midX = (seg.from.x + seg.to.x) / 2;
    const midY = (seg.from.y + seg.to.y) / 2;
    const rotate = measureLabelRotationDeg(seg.from, seg.to);
    const pill = document.createElement('div');
    pill.className =
      'pointer-events-none absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center';
    pill.style.left = `${midX}px`;
    pill.style.top = `${midY}px`;
    pill.style.transform = `translate(-50%, -50%) rotate(${rotate}deg)`;
    pill.innerHTML = `<span class="whitespace-nowrap rounded-full bg-white px-2.5 py-1 text-xs font-bold text-ink shadow-md">${seg.label}</span><span class="-ml-0.5 h-0 w-0 border-y-[6px] border-l-[8px] border-y-transparent border-l-white drop-shadow-sm" aria-hidden="true"></span>`;
    pillsEl.appendChild(pill);
  }
}

function clearArOverlay(
  markersEl: HTMLDivElement | null,
  svgEl: SVGSVGElement | null,
  pillsEl: HTMLDivElement | null,
) {
  if (markersEl) markersEl.innerHTML = '';
  if (svgEl) while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
  if (pillsEl) pillsEl.innerHTML = '';
}

function poseToVec3(pose: XRPose): LocalVec3 {
  const p = pose.transform.position;
  return { x: p.x, y: p.y, z: p.z };
}

function resizeCanvasToViewport(canvas: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
  canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
  canvas.style.width = '100%';
  canvas.style.height = '100%';
}

async function requestArSession(overlayRoot: HTMLElement): Promise<XRSessionWithHitTest> {
  if (!navigator.xr) throw new Error('WebXR is not available');
  const attempts: XRSessionInit[] = [
    {
      requiredFeatures: ['hit-test', 'dom-overlay'],
      optionalFeatures: ['local-floor'],
      domOverlay: { root: overlayRoot },
    },
    {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['local-floor', 'dom-overlay'],
      domOverlay: { root: overlayRoot },
    },
    {
      requiredFeatures: ['hit-test', 'local-floor'],
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: overlayRoot },
    },
    {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['hit-test', 'dom-overlay'],
      domOverlay: { root: overlayRoot },
    },
  ];
  let lastError: unknown;
  for (const init of attempts) {
    try {
      return (await navigator.xr.requestSession('immersive-ar', init)) as XRSessionWithHitTest;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Could not start WebXR AR session');
}

/**
 * Mobile AR measure — WebXR hit-test for plane placement with DOM overlay UI.
 */
export function IndoorArMeasurePanel({
  onClose,
  initialCameraStream = null,
  openError = null,
  onCameraStreamChange,
  accessToken,
  siteId,
  buildingId,
  floorId,
  mapVersionId,
  floorLevel,
  onApplyPlanPoints,
  onSuggestFloorHeight,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<XRSessionWithHitTest | null>(null);
  const refSpaceRef = useRef<XRReferenceSpace | null>(null);
  const hitTestSourceRef = useRef<XRHitTestSource | null>(null);
  const latestHitRef = useRef<LocalVec3 | null>(null);
  const surfaceDetectedRef = useRef(false);
  const placedRef = useRef<PlacedPoint[]>([]);
  const pathIdRef = useRef<string | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const sessionOriginRef = useRef<LocalVec3 | null>(null);
  const orientationRef = useRef({ beta: 90, gamma: 0 });
  const cameraLoopRef = useRef<number | null>(null);
  const projectedLiveRef = useRef<(ScreenPt | null)[]>([]);
  const overlayMarkersRef = useRef<HTMLDivElement>(null);
  const overlaySvgRef = useRef<SVGSVGElement>(null);
  const overlayPillsRef = useRef<HTMLDivElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);

  const [measureMode, setMeasureMode] = useState<MeasureMode | null>(null);
  const [arActive, setArActive] = useState(false);
  const [arStarting, setArStarting] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [videoTrackLive, setVideoTrackLive] = useState(false);
  const [placed, setPlaced] = useState<PlacedPoint[]>([]);
  const [projected, setProjected] = useState<(ScreenPt | null)[]>([]);
  const [status, setStatus] = useState('Starting camera…');
  const [error, setError] = useState<string | null>(openError);
  const [surfaceDetected, setSurfaceDetected] = useState(false);
  const [persistBusy, setPersistBusy] = useState(false);

  placedRef.current = placed;
  const worldPoints = placed.map((p) => p.world);

  const syncArOverlay = useCallback((screenPts: (ScreenPt | null)[]) => {
    const markers = overlayMarkersRef.current;
    const svg = overlaySvgRef.current;
    const pills = overlayPillsRef.current;
    if (!markers || !svg || !pills) return;
    projectedLiveRef.current = screenPts;
    const worlds = placedRef.current.map((p) => p.world);
    paintArOverlay(markers, svg, pills, screenPts, buildOverlaySegments(screenPts, worlds));
  }, []);

  const projectPlacedPoints = useCallback((): (ScreenPt | null)[] => {
    const stage = stageRef.current;
    if (!stage || placedRef.current.length === 0) return [];
    const { width, height } = stage.getBoundingClientRect();

    if (measureMode === 'camera') {
      const { beta, gamma } = orientationRef.current;
      return placedRef.current.map(({ world }) =>
        projectSessionPointToScreen(world, sessionOriginRef.current, beta, gamma, width, height),
      );
    }

    const ref = refSpaceRef.current;
    const sess = sessionRef.current;
    if (!ref || !sess) return [];
    // Fallback when WebXR frame is not available (should not happen during active AR).
    return placedRef.current.map(() => null);
  }, [measureMode]);

  const projectPlacedPointsFromXrFrame = useCallback(
    (frame: XRFrame, ref: XRReferenceSpace): (ScreenPt | null)[] => {
      const stage = stageRef.current;
      if (!stage) return [];
      const viewer = frame.getViewerPose(ref);
      const view = viewer?.views[0];
      if (!view) return placedRef.current.map(() => null);
      const { width, height } = stage.getBoundingClientRect();
      return placedRef.current.map(({ world }) =>
        projectWorldToScreen(
          world,
          view.transform.inverse.matrix,
          view.projectionMatrix,
          width,
          height,
        ),
      );
    },
    [],
  );

  useLayoutEffect(() => {
    let cancelled = false;
    const video = videoRef.current;

    if (openError) {
      setError(openError);
      setStatus('Camera unavailable.');
      return;
    }

    if (!initialCameraStream || !video) {
      if (!initialCameraStream && !openError) {
        setStatus('Waiting for camera…');
      }
      return;
    }

    void (async () => {
      try {
        cameraStreamRef.current = initialCameraStream;
        await attachCameraToVideo(initialCameraStream, video);
        if (cancelled) return;

        initialCameraStream.getVideoTracks()[0]?.addEventListener('ended', () => {
          setCameraReady(false);
          setVideoTrackLive(false);
        });

        setCameraReady(true);
        setVideoTrackLive(true);
        setError(null);
        setStatus('Camera ready. Tap Start AR to measure on detected surfaces.');
      } catch (err) {
        if (!cancelled) {
          setCameraReady(false);
          setVideoTrackLive(false);
          setError(err instanceof Error ? err.message : 'Camera preview failed to start');
          setStatus('Camera unavailable.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialCameraStream, openError]);

  const syncCameraStream = useCallback(
    (stream: MediaStream | null) => {
      cameraStreamRef.current = stream;
      onCameraStreamChange?.(stream);
    },
    [onCameraStreamChange],
  );

  const restorePreviewCamera = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return false;
    try {
      const stream = await openCameraStream();
      syncCameraStream(stream);
      await attachCameraToVideo(stream, video);
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        setCameraReady(false);
        setVideoTrackLive(false);
      });
      setCameraReady(true);
      setVideoTrackLive(true);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not restore camera preview');
      setCameraReady(false);
      setVideoTrackLive(false);
      return false;
    }
  }, [syncCameraStream]);

  const releasePreviewForWebXr = useCallback(async () => {
    stopMediaStream(cameraStreamRef.current);
    syncCameraStream(null);
    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
    }
    setVideoTrackLive(false);
    // Let Android release the camera before WebXR claims it exclusively.
    await new Promise((resolve) => window.setTimeout(resolve, 350));
  }, [syncCameraStream]);

  const persistPoint = useCallback(
    async (point: PlacedPoint, ordinal: number) => {
      if (!accessToken || !siteId || !mapVersionId || !point.gps) return;
      setPersistBusy(true);
      try {
        if (!pathIdRef.current) {
          const path = await api.measurements.createPath(
            {
              siteId,
              buildingId: buildingId ?? null,
              floorId: floorId ?? null,
              mapVersionId,
              name: `AR measure ${new Date().toISOString()}`,
              pathType: 'indoor',
              status: 'draft',
              metadata: { source: 'camera_ar', floorLevel: floorLevel ?? null },
            },
            accessToken,
          );
          pathIdRef.current = path.id;
        }
        await api.measurements.addPoint(
          pathIdRef.current,
          {
            point: {
              latitude: point.gps.latitude,
              longitude: point.gps.longitude,
              altitude: point.gps.altitude,
              accuracy: point.gps.accuracy,
              timestamp: Date.now(),
            },
            label: `Point ${ordinal}`,
          },
          accessToken,
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save point to database');
      } finally {
        setPersistBusy(false);
      }
    },
    [accessToken, siteId, buildingId, floorId, mapVersionId, floorLevel],
  );

  const placeArPoint = useCallback(async () => {
    const hit = latestHitRef.current;
    if (!hit) {
      setError(
        measureMode === 'camera'
          ? 'Point the center dot at the floor and hold steady until it turns green.'
          : 'No flat surface detected. Move the phone slowly over a well-lit floor or wall until the center dot turns green.',
      );
      return;
    }
    setError(null);
    let gps: GpsFix | null = null;
    try {
      gps = await readGpsFix();
    } catch {
      setError('Could not read GPS for this point. Enable location and try again.');
      return;
    }

    let world: LocalVec3;
    if (measureMode === 'camera') {
      if (!sessionOriginRef.current) {
        sessionOriginRef.current = hit;
        world = { x: 0, y: 0, z: 0 };
      } else {
        const o = sessionOriginRef.current;
        world = { x: hit.x - o.x, y: hit.y - o.y, z: hit.z - o.z };
      }
    } else {
      world = { ...hit };
    }

    const entry: PlacedPoint = { world, gps };
    const next = [...placedRef.current, entry];
    placedRef.current = next;
    setPlaced(next);
    void persistPoint(entry, next.length);
    requestAnimationFrame(() => {
      if (arActive) syncArOverlay(projectPlacedPoints());
    });
  }, [arActive, measureMode, persistPoint, projectPlacedPoints, syncArOverlay]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!window.isSecureContext) {
        if (!cancelled) {
          setMeasureMode('camera');
          setError(
            'HTTPS is required. Open https:// plus your PC IP (not http://), accept the certificate warning, then open AR Measure again.',
          );
          setStatus('Secure connection required for camera and AR.');
        }
        return;
      }

      const mode = await detectMeasureMode();
      if (!cancelled) {
        setMeasureMode(mode);
        setStatus(
          mode === 'webxr'
            ? 'Camera ready. Tap Start AR to measure on detected surfaces.'
            : 'Camera ready. Tap Start AR to measure using the camera view (iPhone / no WebXR).',
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onDeviceOrientation = useCallback((e: DeviceOrientationEvent) => {
    if (e.beta == null || e.gamma == null) return;
    orientationRef.current = { beta: e.beta, gamma: e.gamma };
  }, []);

  const stopCameraMeasureLoop = useCallback(() => {
    if (cameraLoopRef.current != null) {
      cancelAnimationFrame(cameraLoopRef.current);
      cameraLoopRef.current = null;
    }
    window.removeEventListener('deviceorientation', onDeviceOrientation);
  }, [onDeviceOrientation]);

  const updateCameraModeHit = useCallback(() => {
    const { beta, gamma } = orientationRef.current;
    const hit = hitHorizontalPlaneFromOrientation(beta, gamma);
    latestHitRef.current = hit;
    const detected = hit != null;
    if (detected !== surfaceDetectedRef.current) {
      surfaceDetectedRef.current = detected;
      setSurfaceDetected(detected);
    }

    if (placedRef.current.length > 0) {
      syncArOverlay(projectPlacedPoints());
    }
  }, [projectPlacedPoints, syncArOverlay]);

  const startCameraMeasureLoop = useCallback(() => {
    window.addEventListener('deviceorientation', onDeviceOrientation, true);
    const tick = () => {
      updateCameraModeHit();
      cameraLoopRef.current = requestAnimationFrame(tick);
    };
    cameraLoopRef.current = requestAnimationFrame(tick);
  }, [onDeviceOrientation, updateCameraModeHit]);

  const startCameraSession = useCallback(async () => {
    const ok = await requestDeviceOrientationAccess();
    if (!ok) {
      throw new Error(
        'Motion sensor permission denied. Allow motion/orientation access to place measure points.',
      );
    }
    sessionOriginRef.current = null;
    startCameraMeasureLoop();
    updateCameraModeHit();
    setArActive(true);
    setStatus('Aim the center dot at the floor, then tap Place.');
  }, [startCameraMeasureLoop, updateCameraModeHit]);

  const startWebXrSession = useCallback(async () => {
    const canvas = canvasRef.current;
    const overlayRoot = overlayRef.current;
    if (!canvas || !navigator.xr || !overlayRoot) {
      throw new Error('WebXR is not available on this device');
    }

    resizeCanvasToViewport(canvas);

    const gl = canvas.getContext('webgl', {
      xrCompatible: true,
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: true,
      stencil: false,
    });
    if (!gl) throw new Error('WebGL not available');
    glRef.current = gl;
    await gl.makeXRCompatible();

    await releasePreviewForWebXr();

    const session = await requestArSession(overlayRoot);
    sessionRef.current = session;
    session.updateRenderState({
      baseLayer: new XRWebGLLayer(session, gl, {
        alpha: true,
        antialias: false,
        depth: true,
        ignoreDepthValues: true,
      }),
    });

    let refSpace: XRReferenceSpace;
    try {
      refSpace = await session.requestReferenceSpace('local-floor');
    } catch {
      refSpace = await session.requestReferenceSpace('local');
    }
    refSpaceRef.current = refSpace;

    const viewerSpace = await session.requestReferenceSpace('viewer');
    let hitTestSource: XRHitTestSource | null = null;
    try {
      if (session.requestHitTestSource) {
        hitTestSource = (await session.requestHitTestSource({ space: viewerSpace })) ?? null;
      }
    } catch {
      hitTestSource = null;
    }
    hitTestSourceRef.current = hitTestSource;
    if (!hitTestSource) {
      setError('Plane detection unavailable on this device. Try moving to a better-lit area.');
    }

    session.addEventListener('end', () => {
      hitTestSourceRef.current?.cancel();
      hitTestSourceRef.current = null;
      sessionRef.current = null;
      refSpaceRef.current = null;
      glRef.current = null;
      latestHitRef.current = null;
      setArActive(false);
      setSurfaceDetected(false);
      surfaceDetectedRef.current = false;
      setProjected([]);
      setVideoTrackLive(false);
      void restorePreviewCamera();
    });

    const onFrame = (_time: number, frame: XRFrame) => {
      const sess = sessionRef.current;
      const glCtx = glRef.current;
      if (!sess || !glCtx) return;
      const baseLayer = sess.renderState.baseLayer;
      if (baseLayer) {
        glCtx.bindFramebuffer(glCtx.FRAMEBUFFER, baseLayer.framebuffer);
        glCtx.viewport(0, 0, baseLayer.framebufferWidth, baseLayer.framebufferHeight);
        glCtx.clearColor(0, 0, 0, 0);
        glCtx.clear(glCtx.COLOR_BUFFER_BIT | glCtx.DEPTH_BUFFER_BIT);
      }

      const ref = refSpaceRef.current;
      const source = hitTestSourceRef.current;
      let hit: LocalVec3 | null = null;
      if (ref && source) {
        const results = source.getHitTestResults(frame);
        const pose = results[0]?.getPose(ref);
        if (pose) hit = poseToVec3(pose);
      }
      latestHitRef.current = hit;
      const detected = hit != null;
      if (detected !== surfaceDetectedRef.current) {
        surfaceDetectedRef.current = detected;
        setSurfaceDetected(detected);
      }

      const stage = stageRef.current;
      if (ref && stage && placedRef.current.length > 0) {
        const screenPts = projectPlacedPointsFromXrFrame(frame, ref);
        syncArOverlay(screenPts);
      }
      sess.requestAnimationFrame(onFrame);
    };
    session.requestAnimationFrame(onFrame);

    setVideoTrackLive(false);
    setArActive(true);
    setStatus('Aim the center dot at a flat surface, then tap Place.');
  }, [releasePreviewForWebXr, restorePreviewCamera, projectPlacedPointsFromXrFrame, syncArOverlay]);

  useEffect(
    () => () => {
      stopCameraMeasureLoop();
      hitTestSourceRef.current?.cancel();
      sessionRef.current?.end().catch(() => undefined);
    },
    [stopCameraMeasureLoop],
  );

  const stopAr = useCallback(() => {
    stopCameraMeasureLoop();
    hitTestSourceRef.current?.cancel();
    hitTestSourceRef.current = null;
    latestHitRef.current = null;
    sessionRef.current?.end().catch(() => undefined);
    sessionRef.current = null;
    refSpaceRef.current = null;
    glRef.current = null;
    setArActive(false);
    setSurfaceDetected(false);
    surfaceDetectedRef.current = false;
    clearArOverlay(overlayMarkersRef.current, overlaySvgRef.current, overlayPillsRef.current);
    setProjected(projectedLiveRef.current.filter((p): p is ScreenPt => p != null));
    setStatus('AR ended. Tap Start AR to measure again.');
    if (measureMode === 'webxr') {
      void restorePreviewCamera();
    }
  }, [measureMode, restorePreviewCamera, stopCameraMeasureLoop]);

  const startAr = useCallback(async () => {
    if (!cameraReady || arStarting || arActive || !measureMode) {
      if (!cameraReady) setError('Wait for the camera preview, then tap Start AR.');
      return;
    }

    setArStarting(true);
    setError(null);

    try {
      if (measureMode === 'webxr') {
        await startWebXrSession();
      } else {
        await startCameraSession();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start AR session');
      setArActive(false);
      if (measureMode === 'webxr') {
        void restorePreviewCamera();
      }
    } finally {
      setArStarting(false);
    }
  }, [
    arActive,
    arStarting,
    cameraReady,
    measureMode,
    restorePreviewCamera,
    startCameraSession,
    startWebXrSession,
  ]);

  const undoPoint = () => {
    if (placed.length === 0) return;
    const next = placed.slice(0, -1);
    placedRef.current = next;
    setPlaced(next);
    if (next.length === 0) sessionOriginRef.current = null;
    if (arActive) {
      syncArOverlay(next.length ? projectPlacedPoints() : []);
    } else {
      setProjected((prev) => prev.slice(0, -1));
    }
  };

  const clearPoints = () => {
    placedRef.current = [];
    setPlaced([]);
    setProjected([]);
    projectedLiveRef.current = [];
    pathIdRef.current = null;
    sessionOriginRef.current = null;
    clearArOverlay(overlayMarkersRef.current, overlaySvgRef.current, overlayPillsRef.current);
  };

  const applyToPlan = () => {
    if (!onApplyPlanPoints || worldPoints.length < 2) return;
    stopAr();
    const origin = worldPoints[0];
    onApplyPlanPoints(arSessionToFloorPlan(worldPoints, origin), {
      source: 'camera_ar',
      heightM: verticalSpan >= 0.5 ? Number(verticalSpan.toFixed(3)) : undefined,
    });
    onClose();
  };

  const overlayHandles: ScreenPt[] = projected.filter((p): p is ScreenPt => p != null);
  const overlayLabels = worldPoints.slice(1).flatMap((_, i) => {
    const from = projected[i];
    const to = projected[i + 1];
    if (!from || !to) return [];
    return [
      {
        from,
        to,
        label: formatMeasureDistance(distance3D(worldPoints[i], worldPoints[i + 1])),
      },
    ];
  });

  const capture = () => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    captureOverlayPng(
      { width: rect.width, height: rect.height },
      videoRef.current,
      overlayHandles,
      overlayLabels.filter((s) => s.label !== '—'),
    );
  };

  const verticalSpan = verticalSpan3D(worldPoints);
  const canUndo = placed.length > 0;
  const canStartAr = cameraReady && !arActive && !arStarting && measureMode != null;

  const panel = (
    <div
      className="fixed inset-0 z-[9999] text-white"
      style={{ background: arActive && !videoTrackLive ? 'transparent' : '#000' }}
    >
      {/* WebGL context for WebXR hit-test — not used for visible DOM rendering. */}
      <canvas ref={canvasRef} aria-hidden="true" className="fixed h-px w-px opacity-0" />

      {/*
        DOM-overlay root: during immersive-ar ONLY this subtree is visible as HTML.
        The camera video MUST live inside this element or it disappears in AR mode.
      */}
      <div
        ref={overlayRef}
        className="absolute inset-0 flex flex-col"
        style={{ background: 'transparent', pointerEvents: 'none' }}
      >
        {/* Live camera — bottom layer inside the overlay */}
        <video
          ref={videoRef}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          style={{
            zIndex: 0,
            background: '#000',
            visibility: arActive && measureMode === 'webxr' ? 'hidden' : 'visible',
          }}
          autoPlay
          playsInline
          muted
        />

        <div
          className="relative flex flex-1 flex-col"
          style={{ zIndex: 10, background: 'transparent' }}
        >
        <div
          className="flex items-center justify-between gap-2 border-b border-white/20 px-4 py-3"
          style={{ background: 'rgba(0,0,0,0.55)', pointerEvents: 'auto' }}
        >
          <p className="text-base font-semibold sm:text-lg">AR Measure</p>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10 active:bg-white/20"
            onClick={() => {
              stopAr();
              onClose();
            }}
            aria-label="Close"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div
          ref={stageRef}
          className="relative min-h-0 flex-1"
          style={{ background: 'transparent', pointerEvents: 'none', touchAction: 'none' }}
        >
          {!arActive && !cameraReady && !error && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40">
              <p className="rounded-lg bg-black/70 px-4 py-2 text-sm text-white/90">Starting camera…</p>
            </div>
          )}

          <div className="pointer-events-none absolute inset-0">
            {arActive ? (
              <>
                <svg ref={overlaySvgRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
                <div ref={overlayMarkersRef} className="absolute inset-0" aria-hidden="true" />
                <div ref={overlayPillsRef} className="absolute inset-0" aria-hidden="true" />
              </>
            ) : (
              <>
                {overlayLabels.length > 0 && (
                  <svg className="absolute inset-0 h-full w-full">
                    {overlayLabels.map((seg, i) => (
                      <line
                        key={`seg-${i}`}
                        x1={seg.from.x}
                        y1={seg.from.y}
                        x2={seg.to.x}
                        y2={seg.to.y}
                        stroke="#10b981"
                        strokeWidth="3"
                        strokeLinecap="round"
                      />
                    ))}
                  </svg>
                )}
                {overlayLabels.map((seg, i) => (
                  <MeasureDistancePill key={`pill-${i}`} from={seg.from} to={seg.to} label={seg.label} />
                ))}
                {overlayHandles.map((p, i) => (
                  <span
                    key={`h-${i}`}
                    className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-emerald-800 bg-white shadow"
                    style={{ left: p.x, top: p.y }}
                  />
                ))}
              </>
            )}
          </div>

          {arActive && (
            <>
              {/* Center placement reticle */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-full border-2 ${
                    surfaceDetected ? 'border-emerald-400' : 'border-white/90'
                  }`}
                  style={{ background: 'transparent' }}
                >
                  <div
                    className={`h-2.5 w-2.5 rounded-full ${
                      surfaceDetected ? 'bg-emerald-400' : 'bg-white'
                    }`}
                  />
                </div>
              </div>

              {/* Round place button */}
              <div
                className="absolute inset-x-0 bottom-6 flex flex-col items-center gap-2"
                style={{ pointerEvents: 'none' }}
              >
                <p
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    surfaceDetected ? 'bg-emerald-600 text-white' : 'bg-black/60 text-white'
                  }`}
                >
                  {surfaceDetected
                    ? 'Surface found — tap Place'
                    : 'Move slowly to detect a flat surface'}
                </p>
                <button
                  type="button"
                  disabled={!surfaceDetected || persistBusy}
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-black shadow-xl ring-4 ring-white/25 active:scale-95 disabled:opacity-40"
                  style={{ pointerEvents: 'auto' }}
                  onClick={() => void placeArPoint()}
                  aria-label="Place point at center reticle"
                >
                  <span className="text-xs font-bold">Place</span>
                </button>
              </div>
            </>
          )}

          <div
            className="absolute inset-x-0 top-3 flex items-center justify-between px-4"
            style={{ pointerEvents: 'none' }}
          >
            <div className="flex gap-2" style={{ pointerEvents: 'auto' }}>
              <button
                type="button"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white shadow-lg active:scale-95 disabled:opacity-40"
                onClick={undoPoint}
                disabled={!canUndo}
                aria-label="Undo last point"
              >
                <Undo2 className="h-5 w-5" />
              </button>
              <button
                type="button"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white shadow-lg active:scale-95 disabled:opacity-40"
                onClick={clearPoints}
                disabled={!canUndo}
                aria-label="Clear measurement"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            </div>
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-black shadow-lg active:scale-95 disabled:opacity-40"
              style={{ pointerEvents: 'auto' }}
              onClick={capture}
              disabled={overlayHandles.length < 2}
              aria-label="Capture screenshot"
            >
              <Circle className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div
          className="space-y-3 border-t border-white/20 p-4"
          style={{ background: 'rgba(0,0,0,0.55)', pointerEvents: 'auto' }}
        >
          {error && (
            <div className="rounded-lg bg-red-900/50 p-3 text-sm text-red-100">
              <p className="font-semibold">Error</p>
              <p className="mt-1">{error}</p>
            </div>
          )}

          {!arActive && (
            <p className="text-sm text-white/90">{status}</p>
          )}

          {worldPoints.length > 0 && (
            <div className="rounded-lg bg-emerald-900/30 p-3">
              <p className="text-sm font-medium text-emerald-200">
                {worldPoints.length} point{worldPoints.length !== 1 ? 's' : ''} placed
                {persistBusy ? ' · saving…' : ''}
              </p>
              {worldPoints.length > 1 && (
                <p className="mt-1 text-xs text-emerald-100">
                  Path: {formatMeasureDistance(polylineLength3D(worldPoints))}
                  {verticalSpan >= 0.5 ? ` · height ${formatMeasureDistance(verticalSpan)}` : ''}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            {!arActive ? (
              <button
                type="button"
                className={BTN_PRIMARY}
                disabled={!canStartAr}
                onClick={() => void startAr()}
              >
                <Camera className="h-5 w-5" /> {arStarting ? 'Starting…' : 'Start AR'}
              </button>
            ) : (
              <button type="button" className={BTN_SECONDARY} onClick={stopAr}>
                Stop AR
              </button>
            )}
            <button
              type="button"
              className={BTN_SECONDARY}
              onClick={clearPoints}
              disabled={!canUndo}
            >
              <RotateCcw className="h-5 w-5" /> Clear
            </button>
            {onApplyPlanPoints && (
              <button
                type="button"
                className={`${BTN_PRIMARY} col-span-2`}
                disabled={worldPoints.length < 2}
                onClick={applyToPlan}
              >
                Save floor plane
              </button>
            )}
            {verticalSpan >= 2 && onSuggestFloorHeight && (
              <button
                type="button"
                className={`${BTN_SECONDARY} col-span-2`}
                onClick={() => onSuggestFloorHeight(Number(verticalSpan.toFixed(2)))}
              >
                Use {formatMeasureDistance(verticalSpan)} as floor height
              </button>
            )}
          </div>
        </div>
        </div>
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
