import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, MapPin, Volume2 } from 'lucide-react';
import type { RouteResponse } from '@campusar/shared';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { useNavStore, usePrefsStore } from '../../stores/themeStore';

export function ArPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const token = useAuthStore((s) => s.accessToken);
  const { sourceNodeId, destinationNodeId } = useNavStore();
  const { accessibility, voiceEnabled } = usePrefsStore();
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    if (!sourceNodeId || !destinationNodeId) {
      setError('Pick a source and destination on Map or Navigate first.');
      return;
    }
    api
      .route({ sourceNodeId, destinationNodeId, accessibility }, token)
      .then((r) => {
        setRoute(r);
        setStepIndex(0);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load route'));
  }, [sourceNodeId, destinationNodeId, accessibility, token]);

  const step = route?.path[stepIndex];
  const remaining = useMemo(() => {
    if (!route) return 0;
    return route.path.slice(stepIndex).reduce((sum, s) => sum + s.distanceM, 0);
  }, [route, stepIndex]);

  useEffect(() => {
    if (!voiceEnabled || !step) return;
    const utter = new SpeechSynthesisUtterance(step.instruction);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  }, [step, voiceEnabled]);

  useEffect(() => {
    if (!route) return;
    const timer = setInterval(() => {
      setStepIndex((i) => Math.min(i + 1, route.path.length - 1));
    }, 5000);
    return () => clearInterval(timer);
  }, [route]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold">AR Navigation</h1>
        <p className="text-sm text-white/60">
          Floating guidance over the live camera with turn-by-turn voice.
        </p>
      </div>

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
            </div>
            <div className="glass-strong rounded-2xl px-3 py-2 text-right text-sm">
              <p className="inline-flex items-center gap-1 text-xs text-white/50">
                <MapPin size={12} /> Destination
              </p>
              <p className="font-semibold">
                {route ? `Step ${stepIndex + 1}/${route.path.length}` : '—'}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-center gap-4">
            <div className="ar-arrow relative flex h-24 w-24 items-center justify-center rounded-full bg-accent/30 backdrop-blur-md pulse-ring">
              <ArrowUp
                size={48}
                className="text-white drop-shadow-lg"
                style={{ transform: `rotate(${(step?.bearing ?? 0) - 0}deg)` }}
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
