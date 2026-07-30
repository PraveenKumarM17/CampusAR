import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, MapPin, Volume2, AlertTriangle, Users } from 'lucide-react';
import type { RouteResponse } from '@campusar/shared';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { useNavStore, usePrefsStore } from '../../stores/themeStore';
import { useCampusLive } from '../../hooks/useCampusLive';

export function ArPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const token = useAuthStore((s) => s.accessToken);
  const { sourceNodeId, destinationNodeId } = useNavStore();
  const { accessibility, voiceEnabled } = usePrefsStore();
  const live = useCampusLive();
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [heading, setHeading] = useState<number | null>(null);

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
      // alpha: compass heading when available (webkitCompassHeading on iOS)
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
    if (!sourceNodeId || !destinationNodeId) return;
    const t = setInterval(() => {
      void loadRoute();
    }, 10_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceNodeId, destinationNodeId, accessibility, token]);

  const step = route?.path[stepIndex];
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

  useEffect(() => {
    if (!voiceEnabled || !step) return;
    const utter = new SpeechSynthesisUtterance(step.instruction);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  }, [step, voiceEnabled]);

  // Timed fallback when no pose sensors: advance every 8s
  useEffect(() => {
    if (!route || heading != null) return;
    const timer = setInterval(() => {
      setStepIndex((i) => Math.min(i + 1, route.path.length - 1));
    }, 8000);
    return () => clearInterval(timer);
  }, [route, heading]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold">AR Navigation</h1>
        <p className="text-sm text-white/60">
          Compass-aligned guidance over the live camera with predictive re-routing.
        </p>
      </div>

      {(live.lastEmergency || avgCrowd != null) && (
        <div className="flex flex-wrap gap-2">
          {live.lastEmergency && (
            <div className="inline-flex items-center gap-2 rounded-xl border border-accent-danger/40 bg-accent-danger/15 px-3 py-2 text-sm text-accent-danger">
              <AlertTriangle size={14} /> {live.lastEmergency}
            </div>
          )}
          {avgCrowd != null && (
            <div className="inline-flex items-center gap-2 rounded-xl glass px-3 py-2 text-sm">
              <Users size={14} className="text-accent" />
              Crowd {Math.round(avgCrowd * 100)}% · {live.connected ? 'live' : 'cached'}
            </div>
          )}
        </div>
      )}

      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-ink-900 shadow-glass">
        <video ref={videoRef} className="h-[70vh] w-full object-cover" playsInline muted />
        {!videoRef.current?.srcObject && cameraError && (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,#1c2740, #070b14)]" />
        )}

        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="glass-strong pointer-events-auto rounded-2xl px-3 py-2 text-sm">
              <p className="text-xs uppercase tracking-wide text-white/50">Distance remaining</p>
              <p className="font-display text-xl font-bold text-accent-soft">
                {Math.round(remaining)} m
              </p>
              {route && <p className="text-xs text-white/50">ETA ~{route.etaMinutes} min</p>}
            </div>
            <div className="glass-strong rounded-2xl px-3 py-2 text-right text-sm">
              <p className="inline-flex items-center gap-1 text-xs text-white/50">
                <MapPin size={12} /> Next waypoint
              </p>
              <p className="font-semibold">
                {route ? `Step ${stepIndex + 1}/${route.path.length}` : '—'}
              </p>
              <p className="text-xs text-white/45">
                {step ? `${Math.round(step.distanceM)} m` : ''}
                {heading != null ? ` · heading ${Math.round(heading)}°` : ''}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-center gap-4">
            <div className="ar-arrow relative flex h-24 w-24 items-center justify-center rounded-full bg-accent/30 backdrop-blur-md pulse-ring">
              <ArrowUp
                size={48}
                className="text-white drop-shadow-lg transition-transform duration-200"
                style={{ transform: `rotate(${arrowRotation}deg)` }}
              />
            </div>
            <div className="glass-strong max-w-md rounded-2xl px-4 py-3 text-center">
              <p className="inline-flex items-center gap-2 text-xs uppercase tracking-wide text-accent-soft">
                <Volume2 size={12} /> Next instruction
              </p>
              <p className="mt-1 font-display text-lg font-semibold">
                {step?.instruction ?? 'Waiting for route…'}
              </p>
            </div>
          </div>

          <div className="pointer-events-auto flex justify-center gap-2">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
            >
              Back
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setStepIndex((i) => Math.min(i + 1, (route?.path.length ?? 1) - 1))}
            >
              Next turn
            </button>
          </div>
        </div>
      </div>

      {(error || cameraError) && <p className="text-sm text-accent-warn">{error ?? cameraError}</p>}
    </div>
  );
}
