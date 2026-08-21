import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Camera, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
import type { IndoorRouteResponse } from '@campusar/shared';

type Props = {
  route: IndoorRouteResponse;
  destinationName: string;
  onFinish: () => void;
};

type CompassEvent = DeviceOrientationEvent & { webkitCompassHeading?: number };

function normalizeAngle(value: number): number {
  return ((value + 540) % 360) - 180;
}

/**
 * Camera guidance for an already-localized indoor route.
 *
 * QR/anchor localization establishes the route's local frame. Browser WebXR
 * world tracking is not consistently available, so progression is explicit
 * unless a native/WebXR tracker supplies live local coordinates later.
 */
export function IndoorArNavigator({ route, destinationName, onFinish }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [heading, setHeading] = useState<number | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const step = route.nodes[Math.min(stepIndex, route.nodes.length - 1)] ?? null;
  const next = route.nodes[Math.min(stepIndex + 1, route.nodes.length - 1)] ?? null;
  const arrived = stepIndex >= Math.max(0, route.nodes.length - 1);
  const arrowRotation = useMemo(
    () => (heading == null || !step ? 0 : normalizeAngle(step.bearing - heading)),
    [heading, step],
  );

  useEffect(() => {
    let stream: MediaStream | null = null;
    void navigator.mediaDevices
      ?.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      .then(async (nextStream) => {
        stream = nextStream;
        if (!videoRef.current) return;
        videoRef.current.srcObject = nextStream;
        await videoRef.current.play();
      })
      .catch(() => setCameraError('Camera unavailable — route instructions remain available.'));

    return () => stream?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    const update = (event: DeviceOrientationEvent) => {
      const compass = event as CompassEvent;
      const nextHeading =
        typeof compass.webkitCompassHeading === 'number'
          ? compass.webkitCompassHeading
          : typeof event.alpha === 'number'
            ? 360 - event.alpha
            : null;
      if (nextHeading != null) setHeading(nextHeading);
    };
    window.addEventListener('deviceorientation', update, true);
    return () => window.removeEventListener('deviceorientation', update, true);
  }, []);

  async function requestSensors() {
    const orientation = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };
    if (orientation.requestPermission) await orientation.requestPermission().catch(() => 'denied');
  }

  return (
    <section className="relative min-h-[28rem] overflow-hidden rounded-md border border-line bg-ink-950 text-white">
      <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" playsInline muted />
      <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/80" />

      <div className="relative z-10 flex min-h-[28rem] flex-col items-center justify-between p-4">
        <div className="flex w-full items-start justify-between gap-3">
          <div className="rounded-md bg-black/65 px-3 py-2 backdrop-blur-sm">
            <p className="text-xs text-white/70">Indoor AR route</p>
            <p className="font-semibold">{destinationName}</p>
          </div>
          <div className="rounded-md bg-black/65 px-3 py-2 text-right text-sm backdrop-blur-sm">
            {Math.min(stepIndex + 1, route.nodes.length)}/{route.nodes.length}
          </div>
        </div>

        {!arrived ? (
          <div className="flex flex-col items-center">
            <button
              type="button"
              className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-white/80 bg-accent/90 shadow-xl"
              onClick={() => void requestSensors()}
              aria-label="Enable compass"
            >
              <ArrowUp
                className="h-14 w-14 transition-transform duration-200"
                style={{ transform: `rotate(${arrowRotation}deg)` }}
              />
            </button>
            <p className="mt-4 max-w-sm rounded-md bg-black/70 px-4 py-3 text-center text-lg font-semibold backdrop-blur-sm">
              {step?.instruction ?? 'Continue along the indoor route'}
            </p>
            <p className="mt-2 rounded bg-black/60 px-2 py-1 text-sm">
              {next ? `${next.distanceM.toFixed(1)} m to next point` : 'Destination ahead'}
            </p>
          </div>
        ) : (
          <div className="rounded-md border border-emerald-300/60 bg-emerald-700/85 px-6 py-5 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10" />
            <p className="mt-2 text-xl font-semibold">You have arrived</p>
            <p>{destinationName}</p>
          </div>
        )}

        <div className="w-full">
          {cameraError && (
            <p className="mb-2 rounded bg-black/70 px-3 py-2 text-center text-xs text-amber-200">
              <Camera className="mr-1 inline h-3.5 w-3.5" /> {cameraError}
            </p>
          )}
          <div className="flex justify-center gap-2">
            {!arrived ? (
              <>
                <button
                  type="button"
                  className="btn-ghost !border-white/30 !bg-black/65 !text-white"
                  disabled={stepIndex === 0}
                  onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
                >
                  <ChevronLeft size={16} /> Back
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setStepIndex((i) => Math.min(route.nodes.length - 1, i + 1))}
                >
                  Reached point <ChevronRight size={16} />
                </button>
              </>
            ) : (
              <button type="button" className="btn-primary" onClick={onFinish}>
                Finish navigation
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
