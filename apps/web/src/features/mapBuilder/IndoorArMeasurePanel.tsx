import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, RotateCcw, X } from 'lucide-react';
import type { LocalVec2, LocalVec3 } from '@campusar/shared';
import {
  arSessionToFloorPlan,
  distance3D,
  formatMeasureDistance,
  polylineLength3D,
  segmentMidpoint3D,
  verticalSpan3D,
} from './indoorArMeasure';

type Props = {
  onClose: () => void;
  /** Apply measured floor-plan points to the canvas (origin = first AR point). */
  onApplyPlanPoints: (
    points: LocalVec2[],
    measurement: { source: 'camera_ar'; heightM?: number },
  ) => void;
  /** Suggest floor height from vertical AR span. */
  onSuggestFloorHeight?: (heightM: number) => void;
};

/**
 * Mobile AR measure mode — ports AR-Measure tap-to-measure flow using WebXR hit-test when available.
 * Falls back to camera preview + canvas measure instructions.
 * @see https://github.com/lightlessdays/AR-Measure
 */
export function IndoorArMeasurePanel({ onClose, onApplyPlanPoints, onSuggestFloorHeight }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const sessionRef = useRef<XRSession | null>(null);
  const pointsRef = useRef<LocalVec3[]>([]);
  const [arSupported, setArSupported] = useState<boolean | null>(null);
  const [arActive, setArActive] = useState(false);
  const [points, setPoints] = useState<LocalVec3[]>([]);
  const [status, setStatus] = useState('Checking AR support…');
  const [error, setError] = useState<string | null>(null);

  pointsRef.current = points;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!navigator.xr?.isSessionSupported) {
        if (!cancelled) {
          setArSupported(false);
          setStatus('WebXR AR not available — use Measure tool on the floor plan canvas.');
        }
        return;
      }
      const ok = await navigator.xr.isSessionSupported('immersive-ar').catch(() => false);
      if (!cancelled) {
        setArSupported(ok);
        setStatus(
          ok
            ? 'Tap Start AR, then tap the floor to place measurement points.'
            : 'WebXR AR not available on this device — use Measure tool on the floor plan canvas.',
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
    setArActive(false);
    setStatus('AR session ended.');
  }, []);

  useEffect(() => () => stopAr(), [stopAr]);

  const startAr = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !navigator.xr) return;
    setError(null);
    try {
      const session = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['local-floor'],
        optionalFeatures: ['hit-test'],
      });
      sessionRef.current = session;
      const gl = canvas.getContext('webgl', { xrCompatible: true });
      if (!gl) throw new Error('WebGL not available');
      await gl.makeXRCompatible();
      session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl) });
      const refSpace = await session.requestReferenceSpace('local-floor');
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
      });

      session.addEventListener('end', () => {
        sessionRef.current = null;
        setArActive(false);
      });

      const onFrame = (_time: number, _frame: XRFrame) => {
        const sess = sessionRef.current;
        if (!sess) return;
        const baseLayer = sess.renderState.baseLayer;
        if (baseLayer) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, baseLayer.framebuffer);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        }
        sess.requestAnimationFrame(onFrame);
      };
      session.requestAnimationFrame(onFrame);
      setArActive(true);
      setStatus('Aim at the floor and tap to place points. Distances appear below.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start AR session');
      setArActive(false);
    }
  }, []);

  const clearPoints = () => {
    pointsRef.current = [];
    setPoints([]);
  };

  const applyToPlan = () => {
    if (points.length < 2) return;
    const origin = points[0];
    onApplyPlanPoints(arSessionToFloorPlan(points, origin), {
      source: 'camera_ar',
      heightM: verticalSpan >= 0.5 ? Number(verticalSpan.toFixed(3)) : undefined,
    });
    onClose();
  };

  const verticalSpan = verticalSpan3D(points);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90 text-white">
      <div className="flex items-center justify-between gap-2 border-b border-white/20 px-3 py-2">
        <p className="text-sm font-semibold">AR Measure</p>
        <button type="button" className="rounded p-1 hover:bg-white/10" onClick={onClose} aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        <canvas ref={canvasRef} className={`h-full w-full ${arActive ? 'block' : 'hidden'}`} />
        {!arActive && (
          <video ref={videoRef} className="h-full w-full object-cover" autoPlay playsInline muted />
        )}
        {!arActive && arSupported === false && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 p-4 text-center text-sm">
            <p>
              Use the <strong>Measure</strong> tool on the floor plan canvas to tap corners and save rooms with
              real-world distances.
            </p>
          </div>
        )}
      </div>

      <div className="space-y-2 border-t border-white/20 p-3 text-sm">
        {error && <p className="text-red-300">{error}</p>}
        <p className="text-white/80">{status}</p>

        {points.length > 0 && (
          <ul className="max-h-28 space-y-1 overflow-y-auto text-xs">
            {points.map((p, i) => (
              <li key={`${p.x}-${p.y}-${p.z}-${i}`}>
                Point {i + 1}: ({p.x.toFixed(2)}, {p.y.toFixed(2)}, {p.z.toFixed(2)})
                {i > 0 && (
                  <span className="ml-2 text-emerald-300">
                    Δ {formatMeasureDistance(distance3D(points[i - 1], p))}
                  </span>
                )}
              </li>
            ))}
            {points.length > 1 && (
              <li className="font-semibold text-emerald-300">
                Total path: {formatMeasureDistance(polylineLength3D(points))}
              </li>
            )}
            {verticalSpan >= 0.5 && (
              <li className="text-amber-200">Vertical span: {formatMeasureDistance(verticalSpan)}</li>
            )}
          </ul>
        )}

        <div className="flex flex-wrap gap-2">
          {arSupported && !arActive && (
            <button type="button" className="btn-primary text-sm" onClick={() => void startAr()}>
              <Camera className="mr-1 inline h-4 w-4" /> Start AR
            </button>
          )}
          {arActive && (
            <button type="button" className="btn-secondary text-sm" onClick={stopAr}>
              Stop AR
            </button>
          )}
          <button type="button" className="btn-secondary text-sm" onClick={clearPoints} disabled={!points.length}>
            <RotateCcw className="mr-1 inline h-4 w-4" /> Clear
          </button>
          <button
            type="button"
            className="btn-primary text-sm"
            disabled={points.length < 2}
            onClick={applyToPlan}
          >
            Apply to floor plan
          </button>
          {verticalSpan >= 2 && onSuggestFloorHeight && (
            <button
              type="button"
              className="btn-secondary text-sm"
              onClick={() => onSuggestFloorHeight(Number(verticalSpan.toFixed(2)))}
            >
              Use {formatMeasureDistance(verticalSpan)} as floor height
            </button>
          )}
        </div>

        {points.length > 1 && (
          <p className="text-xs text-white/60">
            Midpoint of last segment:{' '}
            {(() => {
              const a = points[points.length - 2];
              const b = points[points.length - 1];
              const m = segmentMidpoint3D(a, b);
              return `(${m.x.toFixed(2)}, ${m.y.toFixed(2)}, ${m.z.toFixed(2)})`;
            })()}
          </p>
        )}
      </div>
    </div>
  );
}
