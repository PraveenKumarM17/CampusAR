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
  const pointsRef = useRef<LocalVec3[]>([]);
  const [arSupported, setArSupported] = useState<boolean | null>(null);
  const [arActive, setArActive] = useState(false);
  const [points, setPoints] = useState<LocalVec3[]>([]);
  const [screenPoints, setScreenPoints] = useState<ScreenPt[]>([]);
  const [projected, setProjected] = useState<(ScreenPt | null)[]>([]);
  const [status, setStatus] = useState('Checking AR support…');
  const [error, setError] = useState<string | null>(null);
  const dragIndex = useRef<number | null>(null);

  pointsRef.current = points;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Check if we're in a secure context (HTTPS or localhost)
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
            ? 'Tap Start AR, then tap the floor to place points. Distances are 3D Euclidean meters.'
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
    sessionRef.current?.end().catch(() => undefined);
    sessionRef.current = null;
    refSpaceRef.current = null;
    setArActive(false);
    setStatus('AR session ended.');
  }, []);

  useEffect(() => () => stopAr(), [stopAr]);

  const startAr = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !navigator.xr) return;
    setError(null);
    try {
      const overlayRoot = panelRef.current;
      const sessionInit: XRSessionInit = {
        requiredFeatures: ['local-floor'],
        optionalFeatures: overlayRoot ? ['hit-test', 'dom-overlay'] : ['hit-test'],
      };
      if (overlayRoot) sessionInit.domOverlay = { root: overlayRoot };
      const session = (await navigator.xr.requestSession(
        'immersive-ar',
        sessionInit,
      )) as XRSessionWithHitTest;
      sessionRef.current = session;
      const gl = canvas.getContext('webgl', { xrCompatible: true });
      if (!gl) throw new Error('WebGL not available');
      await gl.makeXRCompatible();
      session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl) });
      const refSpace = await session.requestReferenceSpace('local-floor');
      refSpaceRef.current = refSpace;
      const viewerSpace = await session.requestReferenceSpace('viewer');
      let hitTestSource: XRHitTestSource | null = null;
      if (session.requestHitTestSource) {
        hitTestSource = (await session.requestHitTestSource({ space: viewerSpace })) ?? null;
      }

      session.addEventListener('select', (event: XRInputSourceEvent) => {
        const frame = event.frame;
        if (!hitTestSource) {
          setError('Hit-test unavailable — use canvas Measure tool.');
          return;
        }
        const results = hitTestSource.getHitTestResults(frame);
        if (results.length === 0) return;
        const pose = results[0].getPose(refSpace);
        if (!pose) return;
        const p = pose.transform.position;
        const next: LocalVec3 = { x: p.x, y: p.y, z: p.z };
        pointsRef.current = [...pointsRef.current, next];
        setPoints([...pointsRef.current]);
        setScreenPoints([]);
      });

      session.addEventListener('end', () => {
        sessionRef.current = null;
        refSpaceRef.current = null;
        setArActive(false);
      });

      const onFrame = (_time: number, frame: XRFrame) => {
        const sess = sessionRef.current;
        if (!sess) return;
        const baseLayer = sess.renderState.baseLayer;
        if (baseLayer) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, baseLayer.framebuffer);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        }
        const ref = refSpaceRef.current;
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
      setStatus('Aim at a surface and tap to place points. The line stays world-locked as you move.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start AR session');
      setArActive(false);
    }
  }, []);

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
    if (arActive) return;
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
    <div ref={panelRef} className="fixed inset-0 z-50 flex flex-col bg-black/90 text-white">
      <div className="flex items-center justify-between gap-2 border-b border-white/20 px-3 py-2">
        <p className="text-sm font-semibold">AR Measure</p>
        <button type="button" className="rounded p-1 hover:bg-white/10" onClick={onClose} aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div
        ref={stageRef}
        className="relative min-h-0 flex-1"
        onPointerDown={onOverlayPointerDown}
        onPointerMove={onOverlayPointerMove}
        onPointerUp={onOverlayPointerUp}
      >
        <canvas ref={canvasRef} className={`h-full w-full ${arActive ? 'block' : 'hidden'}`} />
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

        <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex items-center justify-between px-3">
          <div className="pointer-events-auto flex gap-2">
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-ink/80 text-white shadow-md disabled:opacity-40"
              onClick={undoPoint}
              disabled={!canUndo}
              aria-label="Undo last point"
            >
              <Undo2 className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-ink/80 text-white shadow-md disabled:opacity-40"
              onClick={clearPoints}
              disabled={!canUndo}
              aria-label="Delete measurement"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          </div>
          <button
            type="button"
            className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-white text-ink shadow-md disabled:opacity-40"
            onClick={capture}
            disabled={overlayHandles.length < 2}
            aria-label="Capture measurement"
          >
            <Circle className="h-6 w-6" />
          </button>
        </div>
      </div>

      <div className="space-y-2 border-t border-white/20 p-3 text-sm">
        {error && <p className="text-red-300">{error}</p>}
        <p className="text-white/80">{status}</p>
        {!arActive && arSupported === false && (
          <div className="rounded-md bg-amber-900/30 p-3 text-xs text-amber-200">
            <p className="font-semibold">⚠️ Screen Overlay Mode (Not Metric)</p>
            <p className="mt-1">
              For accurate measurements, use one of these:
            </p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              <li>Access via <strong>HTTPS</strong> on an ARCore/ARKit device</li>
              <li>Use the <strong>2D Measure tool</strong> on the floor plan (accurate local meters)</li>
            </ul>
          </div>
        )}

        {points.length > 0 && (
          <p className="text-xs text-emerald-300">
            {points.length} AR point(s)
            {points.length > 1 ? ` · path ${formatMeasureDistance(polylineLength3D(points))}` : ''}
            {verticalSpan >= 0.5 ? ` · height ${formatMeasureDistance(verticalSpan)}` : ''}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {arSupported && !arActive && (
            <button type="button" className="btn-primary text-sm" onClick={() => void startAr()}>
              <Camera className="mr-1 inline h-4 w-4" /> Start AR
            </button>
          )}
          {arActive && (
            <button type="button" className="btn-ghost text-sm text-white" onClick={stopAr}>
              Stop AR
            </button>
          )}
          <button type="button" className="btn-ghost text-sm text-white" onClick={clearPoints} disabled={!canUndo}>
            <RotateCcw className="mr-1 inline h-4 w-4" /> Clear
          </button>
          {onApplyPlanPoints && (
            <button
              type="button"
              className="btn-primary text-sm"
              disabled={points.length < 2}
              onClick={applyToPlan}
            >
              Apply to floor plan
            </button>
          )}
          {verticalSpan >= 2 && onSuggestFloorHeight && (
            <button
              type="button"
              className="btn-ghost text-sm text-white"
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
