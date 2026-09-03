import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Circle, RotateCcw, Trash2, Undo2, X } from 'lucide-react';
import type { LocalVec2, LocalVec3 } from '@campusar/shared';
import {
  arSessionToFloorPlan,
  distance3D,
  formatMeasureDistance,
  polylineLength3D,
  projectWorldToScreen,
  verticalSpan3D,
} from './indoorArMeasure';
import { MeasureDistancePill } from './MeasureDistancePill';

type ScreenPt = { x: number; y: number };

type Props = {
  onClose: () => void;
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

const HANDLE_HIT_PX = 28;

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

function poseToVec3(pose: XRPose): LocalVec3 {
  const p = pose.transform.position;
  return { x: p.x, y: p.y, z: p.z };
}

async function requestArSession(overlayRoot: HTMLElement): Promise<XRSessionWithHitTest> {
  if (!navigator.xr) throw new Error('WebXR is not available');
  const attempts: XRSessionInit[] = [
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
    {
      optionalFeatures: ['hit-test', 'local-floor', 'dom-overlay'],
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
 * Mobile AR measure mode — ports AR-Measure tap-to-measure flow using WebXR hit-test when available.
 * Falls back to camera preview + screen overlay (not metric) or the 2D canvas Measure tool.
 * @see https://github.com/lightlessdays/AR-Measure
 */
export function IndoorArMeasurePanel({ onClose, onApplyPlanPoints, onSuggestFloorHeight }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<XRSessionWithHitTest | null>(null);
  const refSpaceRef = useRef<XRReferenceSpace | null>(null);
  const hitTestSourceRef = useRef<XRHitTestSource | null>(null);
  const latestHitRef = useRef<LocalVec3 | null>(null);
  const surfaceDetectedRef = useRef(false);
  const pointsRef = useRef<LocalVec3[]>([]);
  const [arSupported, setArSupported] = useState<boolean | null>(null);
  const [arActive, setArActive] = useState(false);
  const [points, setPoints] = useState<LocalVec3[]>([]);
  const [screenPoints, setScreenPoints] = useState<ScreenPt[]>([]);
  const [projected, setProjected] = useState<(ScreenPt | null)[]>([]);
  const [status, setStatus] = useState('Checking AR support…');
  const [error, setError] = useState<string | null>(null);
  const [surfaceDetected, setSurfaceDetected] = useState(false);
  const dragIndex = useRef<number | null>(null);

  pointsRef.current = points;

  const placeArPoint = useCallback(() => {
    const hit = latestHitRef.current;
    if (!hit) {
      setError('No surface yet. Move the phone slowly over a flat, well-lit area until the reticle turns green, then tap Place.');
      return;
    }
    setError(null);
    const next = [...pointsRef.current, { ...hit }];
    pointsRef.current = next;
    setPoints(next);
    setScreenPoints([]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!window.isSecureContext) {
        if (!cancelled) {
          setArSupported(false);
          setError('⚠️ HTTPS Required: WebXR needs a secure connection. Access via https:// instead of http://');
          setStatus('Camera preview available, but WebXR AR requires HTTPS. Use 2D Measure tool for accurate distances.');
        }
        return;
      }

      if (!navigator.xr?.isSessionSupported) {
        if (!cancelled) {
          setArSupported(false);
          setStatus('WebXR not supported in this browser. Try Chrome on Android or Safari on iOS.');
        }
        return;
      }
      const ok = await navigator.xr.isSessionSupported('immersive-ar').catch(() => false);
      if (!cancelled) {
        setArSupported(ok);
        setStatus(
          ok
            ? 'Tap Start AR, aim the reticle at a surface, then tap Place.'
            : 'WebXR AR not available on this device. Use 2D Measure tool for accurate floor-plan distances.',
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let stream: MediaStream | null = null;
    if (arSupported === false && videoRef.current) {
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        .then((s) => {
          stream = s;
          if (videoRef.current) videoRef.current.srcObject = s;
        })
        .catch(() => undefined);
    }
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [arSupported]);

  const stopAr = useCallback(() => {
    hitTestSourceRef.current?.cancel();
    hitTestSourceRef.current = null;
    latestHitRef.current = null;
    sessionRef.current?.end().catch(() => undefined);
    sessionRef.current = null;
    refSpaceRef.current = null;
    setArActive(false);
    setSurfaceDetected(false);
    setStatus('AR session ended.');
  }, []);

  useEffect(() => () => stopAr(), [stopAr]);

  const startAr = useCallback(async () => {
    const canvas = canvasRef.current;
    const overlayRoot = panelRef.current;
    if (!canvas || !navigator.xr || !overlayRoot) return;
    setError(null);
    try {
      const session = await requestArSession(overlayRoot);
      sessionRef.current = session;
      // Alpha must be enabled so the XR compositor can show the camera through the GL layer.
      const gl = canvas.getContext('webgl', {
        xrCompatible: true,
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        depth: true,
        stencil: false,
      });
      if (!gl) throw new Error('WebGL not available');
      await gl.makeXRCompatible();
      session.updateRenderState({
        baseLayer: new XRWebGLLayer(session, gl, { alpha: true, ignoreDepthValues: true }),
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
        setError('Hit-test is not available on this session. Surface points cannot be placed until the phone detects planes.');
      }

      const commitHit = (hit: LocalVec3) => {
        const next = [...pointsRef.current, hit];
        pointsRef.current = next;
        setPoints(next);
        setScreenPoints([]);
        setError(null);
      };

      session.addEventListener('select', (event: XRInputSourceEvent) => {
        const frame = event.frame;
        const source = hitTestSourceRef.current;
        const ref = refSpaceRef.current;
        if (source && ref && frame) {
          const results = source.getHitTestResults(frame);
          const pose = results[0]?.getPose(ref);
          if (pose) {
            commitHit(poseToVec3(pose));
            return;
          }
        }
        placeArPoint();
      });

      session.addEventListener('end', () => {
        hitTestSourceRef.current?.cancel();
        hitTestSourceRef.current = null;
        sessionRef.current = null;
        refSpaceRef.current = null;
        latestHitRef.current = null;
        setArActive(false);
        setSurfaceDetected(false);
      });

      const onFrame = (_time: number, frame: XRFrame) => {
        const sess = sessionRef.current;
        if (!sess) return;
        const baseLayer = sess.renderState.baseLayer;
        if (baseLayer) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, baseLayer.framebuffer);
          gl.viewport(0, 0, baseLayer.framebufferWidth, baseLayer.framebufferHeight);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
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
        if (ref && stage && pointsRef.current.length > 0) {
          const viewer = frame.getViewerPose(ref);
          const view = viewer?.views[0];
          if (view) {
            const { width, height } = stage.getBoundingClientRect();
            const next: (ScreenPt | null)[] = pointsRef.current.map((world) =>
              projectWorldToScreen(
                world,
                view.transform.inverse.matrix,
                view.projectionMatrix,
                width,
                height,
              ),
            );
            setProjected(next);
          }
        }
        sess.requestAnimationFrame(onFrame);
      };
      session.requestAnimationFrame(onFrame);
      setArActive(true);
      setStatus('Aim the reticle at a surface, then tap Place (or tap the camera view).');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start AR session');
      setArActive(false);
    }
  }, [placeArPoint]);

  const undoPoint = () => {
    if (arActive || points.length > 0) {
      const next = points.slice(0, -1);
      pointsRef.current = next;
      setPoints(next);
      return;
    }
    setScreenPoints((prev) => prev.slice(0, -1));
  };

  const clearPoints = () => {
    pointsRef.current = [];
    setPoints([]);
    setProjected([]);
    setScreenPoints([]);
  };

  const applyToPlan = () => {
    if (!onApplyPlanPoints || points.length < 2) return;
    const origin = points[0];
    onApplyPlanPoints(arSessionToFloorPlan(points, origin), {
      source: 'camera_ar',
      heightM: verticalSpan >= 0.5 ? Number(verticalSpan.toFixed(3)) : undefined,
    });
    onClose();
  };

  const overlayHandles: ScreenPt[] =
    points.length > 0 ? projected.filter((p): p is ScreenPt => p != null) : screenPoints;
  const overlayLabels =
    points.length > 0
      ? points.slice(1).flatMap((_, i) => {
          const from = projected[i];
          const to = projected[i + 1];
          if (!from || !to) return [];
          return [
            {
              from,
              to,
              label: formatMeasureDistance(distance3D(points[i], points[i + 1])),
            },
          ];
        })
      : screenPoints.slice(1).map((p, i) => ({
          from: screenPoints[i],
          to: p,
          label: '—',
        }));

  const hitHandle = (x: number, y: number): number | null => {
    for (let i = 0; i < overlayHandles.length; i++) {
      const dx = overlayHandles[i].x - x;
      const dy = overlayHandles[i].y - y;
      if (dx * dx + dy * dy <= HANDLE_HIT_PX * HANDLE_HIT_PX) return i;
    }
    return null;
  };

  const onOverlayPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest('button')) return;

    if (arActive) {
      e.preventDefault();
      placeArPoint();
      return;
    }

    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const handle = hitHandle(x, y);
    if (handle != null) {
      dragIndex.current = handle;
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    setScreenPoints((prev) => [...prev, { x, y }]);
  };

  const onOverlayPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (arActive || dragIndex.current == null) return;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const index = dragIndex.current;
    setScreenPoints((prev) => prev.map((p, i) => (i === index ? { x, y } : p)));
  };

  const onOverlayPointerUp = () => {
    dragIndex.current = null;
  };

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

  const verticalSpan = verticalSpan3D(points);
  const canUndo = points.length > 0 || screenPoints.length > 0;

  return (
    <div
      ref={panelRef}
      className={`fixed inset-0 z-50 flex flex-col text-white ${arActive ? 'bg-transparent' : 'bg-black'}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/20 bg-black/80 px-4 py-3 backdrop-blur-sm">
        <p className="text-base font-semibold sm:text-lg">AR Measure</p>
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10 active:bg-white/20"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="h-6 w-6" />
        </button>
      </div>

      <div
        ref={stageRef}
        className="relative min-h-0 flex-1 touch-none"
        onPointerDown={onOverlayPointerDown}
        onPointerMove={onOverlayPointerMove}
        onPointerUp={onOverlayPointerUp}
        style={{ touchAction: 'none' }}
      >
        <canvas
          ref={canvasRef}
          className={
            arActive
              ? 'pointer-events-none absolute inset-0 h-full w-full bg-transparent opacity-0'
              : 'hidden'
          }
        />
        {!arActive && (
          <video ref={videoRef} className="h-full w-full object-cover" autoPlay playsInline muted />
        )}

        <div className="pointer-events-none absolute inset-0">
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
        </div>

        {arActive && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <div
              className={`flex h-16 w-16 items-center justify-center rounded-full border-2 ${
                surfaceDetected ? 'border-emerald-400 bg-emerald-500/20' : 'border-white/70 bg-black/20'
              }`}
            >
              <div
                className={`h-3 w-3 rounded-full ${surfaceDetected ? 'bg-emerald-400' : 'bg-white/80'}`}
              />
            </div>
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex items-center justify-between px-4">
          <div className="pointer-events-auto flex gap-2">
            <button
              type="button"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur-sm transition-all hover:bg-black/80 active:scale-95 disabled:opacity-40"
              onClick={undoPoint}
              disabled={!canUndo}
              aria-label="Undo last point"
            >
              <Undo2 className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur-sm transition-all hover:bg-black/80 active:scale-95 disabled:opacity-40"
              onClick={clearPoints}
              disabled={!canUndo}
              aria-label="Delete measurement"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          </div>
          <button
            type="button"
            className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-black shadow-lg transition-all hover:bg-gray-100 active:scale-95 disabled:opacity-40"
            onClick={capture}
            disabled={overlayHandles.length < 2}
            aria-label="Capture measurement"
          >
            <Circle className="h-6 w-6" />
          </button>
        </div>

        {arActive && (
          <div className="pointer-events-none absolute inset-x-0 bottom-28 z-20 flex flex-col items-center gap-3 px-4">
            <p
              className={`rounded-full px-3 py-1.5 text-xs font-semibold shadow ${
                surfaceDetected ? 'bg-emerald-600 text-white' : 'bg-black/70 text-white'
              }`}
            >
              {surfaceDetected ? 'Surface detected — tap Place' : 'Move slowly to detect a surface'}
            </p>
            <button
              type="button"
              className="pointer-events-auto flex h-20 w-20 items-center justify-center rounded-full bg-white text-black shadow-2xl ring-4 ring-white/30 active:scale-95"
              onPointerDown={(e) => {
                e.stopPropagation();
                placeArPoint();
              }}
              aria-label="Place point"
            >
              <span className="text-sm font-bold">Place</span>
            </button>
          </div>
        )}
      </div>

      <div className="space-y-3 border-t border-white/20 bg-black/80 p-4 backdrop-blur-sm">
        {error && (
          <div className="rounded-lg bg-red-900/40 p-3 text-sm text-red-200">
            <p className="font-semibold">⚠️ Error</p>
            <p className="mt-1">{error}</p>
          </div>
        )}

        {!arActive && <p className="text-sm text-white/90 sm:text-base">{status}</p>}
        {!arActive && arSupported === false && (
          <div className="rounded-lg bg-amber-900/40 p-3 text-sm text-amber-200">
            <p className="font-semibold">⚠️ Screen Overlay Mode (Not Metric)</p>
            <p className="mt-2">For accurate measurements, use one of these:</p>
            <ul className="mt-2 list-inside list-disc space-y-1">
              <li>
                Access via <strong>HTTPS</strong> on an ARCore/ARKit device
              </li>
              <li>
                Use the <strong>2D Measure tool</strong> on the floor plan (accurate local meters)
              </li>
            </ul>
          </div>
        )}

        {points.length > 0 && (
          <div className="rounded-lg bg-emerald-900/30 p-3">
            <p className="text-sm font-medium text-emerald-300">
              📍 {points.length} point{points.length !== 1 ? 's' : ''} captured
            </p>
            {points.length > 1 && (
              <p className="mt-1 text-xs text-emerald-200">
                Path length: {formatMeasureDistance(polylineLength3D(points))}
                {verticalSpan >= 0.5 ? ` · Height: ${formatMeasureDistance(verticalSpan)}` : ''}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {arSupported && !arActive && (
            <button
              type="button"
              className="btn-primary flex-1 !py-3 text-base font-semibold sm:flex-none sm:text-sm"
              onClick={() => void startAr()}
            >
              <Camera className="mr-2 inline h-5 w-5" /> Start AR
            </button>
          )}
          {arActive && (
            <button
              type="button"
              className="btn-ghost flex-1 !py-3 text-base text-white sm:flex-none sm:text-sm"
              onClick={stopAr}
            >
              Stop AR
            </button>
          )}
          <button
            type="button"
            className="btn-ghost !py-3 text-base text-white sm:text-sm"
            onClick={clearPoints}
            disabled={!canUndo}
          >
            <RotateCcw className="mr-1.5 inline h-5 w-5 sm:h-4 sm:w-4" /> Clear
          </button>
          {onApplyPlanPoints && (
            <button
              type="button"
              className="btn-primary flex-1 !py-3 text-base font-semibold sm:flex-none sm:text-sm"
              disabled={points.length < 2}
              onClick={applyToPlan}
            >
              Apply to floor plan
            </button>
          )}
          {verticalSpan >= 2 && onSuggestFloorHeight && (
            <button
              type="button"
              className="btn-ghost !py-3 text-base text-white sm:text-sm"
              onClick={() => onSuggestFloorHeight(Number(verticalSpan.toFixed(2)))}
            >
              Use {formatMeasureDistance(verticalSpan)} as floor height
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
