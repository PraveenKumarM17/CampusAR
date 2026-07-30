import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, MapPin, Volume2, AlertTriangle, Users, CheckCircle2 } from 'lucide-react';
import type { RouteResponse } from '@campusar/shared';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { useNavStore, usePrefsStore } from '../../stores/themeStore';
import { useCampusLive } from '../../hooks/useCampusLive';
import { GuideDollViewport, poseFromRouteContext } from './GuideDoll';
import { CAMPUS_LABEL } from '../../lib/campus';

export function ArPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const token = useAuthStore((s) => s.accessToken);
  const { sourceNodeId, destinationNodeId } = useNavStore();
  const { accessibility, voiceEnabled, avatarGender, setAvatarGender } = usePrefsStore();
  const live = useCampusLive();
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [arrivedAck, setArrivedAck] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        setCameraError('Camera unavailable — showing simulated AR overlay.');
      }
    }
    void startCamera();
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    function onOrient(e: DeviceOrientationEvent) {
      const webkit = e as DeviceOrientationEvent & { webkitCompassHeading?: number };
      if (typeof webkit.webkitCompassHeading === 'number') {
        setHeading(webkit.webkitCompassHeading);
      } else if (e.alpha != null) {
        setHeading((360 - e.alpha) % 360);
      }
    }
    window.addEventListener('deviceorientation', onOrient);
    return () => window.removeEventListener('deviceorientation', onOrient);
  }, []);

  async function loadRoute() {
    if (!sourceNodeId || !destinationNodeId) {
      setError('Pick a source and destination on Map or Navigate first.');
      return;
    }
    try {
      const r = await api.recalculate(
        { sourceNodeId, destinationNodeId, accessibility, usePrediction: true },
        token,
      );
      setRoute(r);
      setStepIndex(0);
      setArrivedAck(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load route');
    }
  }

  useEffect(() => {
    void loadRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceNodeId, destinationNodeId, accessibility, token]);

  useEffect(() => {
    if (!sourceNodeId || !destinationNodeId || arrivedAck) return;
    const t = setInterval(() => {
      void loadRoute();
    }, 10_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceNodeId, destinationNodeId, accessibility, token, arrivedAck]);

  const step = route?.path[stepIndex];
  const arrived = Boolean(
    route &&
      stepIndex >= route.path.length - 1 &&
      (step?.distanceM === 0 || step?.instruction.toLowerCase().includes('arrived')),
  );

  const remaining = useMemo(() => {
    if (!route) return 0;
    return route.path.slice(stepIndex).reduce((sum, s) => sum + s.distanceM, 0);
  }, [route, stepIndex]);

  const arrowRotation = useMemo(() => {
    const bearing = step?.bearing ?? 0;
    if (heading == null) return bearing;
    return ((bearing - heading + 540) % 360) - 180;
  }, [step?.bearing, heading]);

  const avgCrowd = useMemo(() => {
    if (!live.crowd.length) return null;
    const sum = live.crowd.reduce((s, c) => s + c.intensity, 0);
    return sum / live.crowd.length;
  }, [live.crowd]);

  const nextStep = route?.path[stepIndex + 1];
  const pose = poseFromRouteContext({
    instruction: step?.instruction,
    nextInstruction: nextStep?.instruction,
    distanceToNextM: step?.distanceM ?? Infinity,
    arrived: arrived || arrivedAck,
    waveWithinM: 30,
  });
  const isWaving = pose === 'waveLeft' || pose === 'waveRight';

  useEffect(() => {
    if (!voiceEnabled || !step) return;
    if (arrived || arrivedAck) {
      const utter = new SpeechSynthesisUtterance('Success. You have reached your destination.');
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
      return;
    }
    const utter = new SpeechSynthesisUtterance(step.instruction);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  }, [step, voiceEnabled, arrived, arrivedAck]);

  useEffect(() => {
    if (!route || heading != null || arrived || arrivedAck) return;
    const timer = setInterval(() => {
      setStepIndex((i) => {
        const next = Math.min(i + 1, route.path.length - 1);
        if (next === route.path.length - 1) setArrivedAck(true);
        return next;
      });
    }, 8000);
    return () => clearInterval(timer);
  }, [route, heading, arrived, arrivedAck]);

  useEffect(() => {
    if (arrived) setArrivedAck(true);
  }, [arrived]);

  function goNext() {
    if (!route) return;
    setStepIndex((i) => {
      const next = Math.min(i + 1, route.path.length - 1);
      if (next === route.path.length - 1) setArrivedAck(true);
      return next;
    });
  }

  const showSuccess = arrived || arrivedAck;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="page-title">AR Navigation</h1>
          <p className="page-sub">{CAMPUS_LABEL} — follow the guide on camera.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-ink-mute">Guide doll</span>
          <div className="inline-flex border border-line bg-paper-raised">
            <button
              type="button"
              className={`px-3 py-2 text-sm font-semibold ${
                avatarGender === 'female' ? 'bg-accent text-white' : 'text-ink-mute'
              }`}
              onClick={() => setAvatarGender('female')}
            >
              Female
            </button>
            <button
              type="button"
              className={`px-3 py-2 text-sm font-semibold ${
                avatarGender === 'male' ? 'bg-accent text-white' : 'text-ink-mute'
              }`}
              onClick={() => setAvatarGender('male')}
            >
              Male
            </button>
          </div>
        </div>
      </div>

      {(live.lastEmergency || avgCrowd != null) && (
        <div className="flex flex-wrap gap-2">
          {live.lastEmergency && (
            <div className="inline-flex items-center gap-2 rounded-md border border-accent-danger/40 bg-accent-danger/10 px-3 py-2 text-sm text-accent-danger">
              <AlertTriangle size={14} /> {live.lastEmergency}
            </div>
          )}
          {avgCrowd != null && (
            <div className="inline-flex items-center gap-2 border border-line bg-paper-raised px-3 py-2 text-sm">
              <Users size={14} className="text-accent" />
              Crowd {Math.round(avgCrowd * 100)}% · {live.connected ? 'live' : 'cached'}
            </div>
          )}
        </div>
      )}

      {/* Viewport: doll on right, chrome top + bottom — nothing over the doll */}
      <div className="relative overflow-hidden rounded-md border border-line bg-ink-950">
        <video ref={videoRef} className="h-[min(78vh,720px)] w-full object-cover" playsInline muted />
        {!videoRef.current?.srcObject && cameraError && (
          <div className="absolute inset-0 bg-[linear-gradient(160deg,#2a353e,#12171c)]" />
        )}

        {/* Top status bar */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-3 sm:p-4">
          <div className="rounded-md border border-white/20 bg-ink/80 px-3 py-2 text-sm text-white backdrop-blur-sm">
            <p className="text-xs text-white/70">Distance remaining</p>
            <p className="font-display text-xl font-semibold">
              {showSuccess ? 0 : Math.round(remaining)} m
            </p>
            {route && !showSuccess && (
              <p className="text-xs text-white/65">ETA ~{route.etaMinutes} min</p>
            )}
          </div>
          <div className="rounded-md border border-white/20 bg-ink/80 px-3 py-2 text-right text-sm text-white backdrop-blur-sm">
            <p className="inline-flex items-center justify-end gap-1 text-xs text-white/65">
              <MapPin size={12} /> {showSuccess ? 'Arrived' : 'Next waypoint'}
            </p>
            <p className="font-semibold">
              {route
                ? `Step ${Math.min(stepIndex + 1, route.path.length)}/${route.path.length}`
                : '—'}
            </p>
          </div>
        </div>

        {/* Bearing arrow — upper center, clear of doll */}
        {!showSuccess && (
          <div className="pointer-events-none absolute left-1/2 top-[22%] z-10 -translate-x-1/2">
            <div className="ar-arrow flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-md">
              <ArrowUp
                size={32}
                className="text-white transition-transform duration-200"
                style={{ transform: `rotate(${arrowRotation}deg)` }}
              />
            </div>
          </div>
        )}

        {/* Guide doll — right side only, above bottom panel, no text overlays */}
        <GuideDollViewport
          gender={avatarGender}
          pose={pose}
          className="pointer-events-none absolute bottom-36 right-2 z-10 h-52 w-36 sm:bottom-40 sm:right-4 sm:h-64 sm:w-44"
        />

        {/* Bottom instruction + controls — full width under doll feet */}
        <div className="absolute inset-x-0 bottom-0 z-20 border-t border-white/10 bg-gradient-to-t from-ink/95 via-ink/85 to-ink/40 px-3 pb-3 pt-8 sm:px-4">
          {showSuccess ? (
            <div className="mx-auto max-w-lg rounded-md border border-accent/40 bg-accent px-4 py-3 text-center text-white animate-fade-up">
              <p className="inline-flex items-center justify-center gap-2 font-display text-lg font-semibold sm:text-xl">
                <CheckCircle2 size={20} /> Success
              </p>
              <p className="mt-1 text-sm sm:text-base">You have reached your destination.</p>
            </div>
          ) : (
            <div className="mx-auto max-w-lg rounded-md border border-white/15 bg-ink/70 px-3 py-2.5 text-center text-white backdrop-blur-sm sm:px-4 sm:py-3">
              {isWaving && (
                <p className="mb-1 text-xs font-semibold text-[#9fe0d8]">
                  {pose === 'waveLeft' ? 'Turn left ahead' : 'Turn right ahead'}
                </p>
              )}
              <p className="inline-flex items-center justify-center gap-2 text-xs text-white/70">
                <Volume2 size={12} /> Next instruction
              </p>
              <p className="mt-1 font-display text-base font-semibold sm:text-lg">
                {step?.instruction ?? 'Waiting for route…'}
              </p>
            </div>
          )}

          <div className="mt-3 flex justify-center gap-2">
            {!showSuccess ? (
              <>
                <button
                  type="button"
                  className="btn-ghost !bg-paper-raised"
                  onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
                >
                  Back
                </button>
                <button type="button" className="btn-primary" onClick={goNext}>
                  Next turn
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setStepIndex(0);
                  setArrivedAck(false);
                }}
              >
                Walk it again
              </button>
            )}
          </div>
        </div>
      </div>

      {(error || cameraError) && <p className="text-sm text-accent-warn">{error ?? cameraError}</p>}
    </div>
  );
}
