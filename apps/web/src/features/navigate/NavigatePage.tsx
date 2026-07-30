import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker } from 'react-leaflet';
import { RefreshCw, Accessibility, Mic, MicOff } from 'lucide-react';
import type { GraphNode, RouteResponse } from '@campusar/shared';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { useNavStore, usePrefsStore } from '../../stores/themeStore';
import { useNavigate } from 'react-router-dom';

export function NavigatePage() {
  const token = useAuthStore((s) => s.accessToken);
  const { sourceNodeId, destinationNodeId, setSource, setDestination } = useNavStore();
  const { accessibility, setAccessibility, voiceEnabled, setVoiceEnabled } = usePrefsStore();
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [usePrediction, setUsePrediction] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.nodes(token).then(setNodes);
  }, [token]);

  async function compute(recalc = false) {
    if (!sourceNodeId || !destinationNodeId) {
      setError('Select source and destination nodes');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const fn = recalc ? api.recalculate : api.route;
      const r = await fn({ sourceNodeId, destinationNodeId, accessibility, usePrediction }, token);
      setRoute(r);
      if (voiceEnabled && r.path[0]) {
        const utter = new SpeechSynthesisUtterance(r.path[0].instruction);
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utter);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Routing failed');
      setRoute(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (sourceNodeId && destinationNodeId) void compute(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!sourceNodeId || !destinationNodeId) return;
    const t = setInterval(() => {
      void compute(true);
    }, 10_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceNodeId, destinationNodeId, accessibility, usePrediction, token]);

  const points = (route?.path ?? []).map((p) => [p.latitude, p.longitude] as [number, number]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="page-title">Navigation</h1>
          <p className="page-sub">Routes that account for crowd, safety, and accessibility.</p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn-ghost"
            type="button"
            onClick={() => setVoiceEnabled(!voiceEnabled)}
          >
            {voiceEnabled ? <Mic size={16} /> : <MicOff size={16} />}
            Voice
          </button>
          <button
            className="btn-primary"
            type="button"
            disabled={loading}
            onClick={() => compute(true)}
          >
            <RefreshCw size={16} /> Recalculate
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-3">
          <div className="panel rounded-md p-4 space-y-3">
            <div>
              <label className="label">Source</label>
              <select
                className="input"
                value={sourceNodeId ?? ''}
                onChange={(e) => setSource(e.target.value || null)}
              >
                <option value="">Select node</option>
                {nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name ?? n.kind} ({n.kind})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Destination</label>
              <select
                className="input"
                value={destinationNodeId ?? ''}
                onChange={(e) => setDestination(e.target.value || null)}
              >
                <option value="">Select node</option>
                {nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name ?? n.kind} ({n.kind})
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center justify-between text-sm">
              <span className="inline-flex items-center gap-2">Crowd prediction</span>
              <input
                type="checkbox"
                checked={usePrediction}
                onChange={(e) => setUsePrediction(e.target.checked)}
              />
            </label>
            <button
              className="btn-primary w-full"
              type="button"
              disabled={loading}
              onClick={() => compute(false)}
            >
              Get route
            </button>
            {error && <p className="text-sm text-accent-danger">{error}</p>}
          </div>

          <div className="panel rounded-md p-4 space-y-3">
            <p className="inline-flex items-center gap-2 text-sm font-semibold">
              <Accessibility size={16} className="text-accent" /> Accessibility
            </p>
            {(
              [
                ['wheelchairMode', 'Wheelchair mode'],
                ['preferLift', 'Prefer lifts'],
                ['preferRamp', 'Prefer ramps'],
                ['avoidStairs', 'Avoid stairs'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center justify-between text-sm">
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={accessibility[key]}
                  onChange={(e) => setAccessibility({ [key]: e.target.checked })}
                />
              </label>
            ))}
          </div>

          {route && (
            <div className="panel rounded-md p-4">
              <p className="text-sm">
                <strong>{route.totalDistanceM} m</strong> · ETA{' '}
                <strong>{route.etaMinutes} min</strong>
              </p>
              <p className="mt-1 text-xs text-ink-faint">
                Cost {route.cost}
                {route.predictionUsed != null
                  ? ` · prediction ${route.predictionUsed ? 'on' : 'off'}`
                  : ''}
                {' · auto-refresh 10s'}
              </p>
              <ol className="mt-3 max-h-64 space-y-2 overflow-auto text-sm text-ink-mute">
                {route.path.map((step, i) => (
                  <li key={`${step.nodeId}-${i}`} className="rounded-lg bg-paper-soft px-2 py-1.5">
                    {step.instruction}
                    {step.distanceM > 0 ? ` · ${Math.round(step.distanceM)} m` : ''}
                  </li>
                ))}
              </ol>
              <button
                className="btn-primary mt-3 w-full"
                type="button"
                onClick={() => navigate('/ar')}
              >
                Launch AR navigation
              </button>
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-md border border-line">
          <MapContainer center={[37.7748, -122.419]} zoom={17} className="h-[70vh] w-full">
            <TileLayer
              attribution="&copy; OSM"
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            />
            {points.length > 1 && (
              <Polyline positions={points} pathOptions={{ color: '#0f6b63', weight: 6 }} />
            )}
            {points[0] && (
              <CircleMarker center={points[0]} radius={8} pathOptions={{ color: '#0f6b63' }} />
            )}
            {points.length > 1 && (
              <CircleMarker
                center={points[points.length - 1]}
                radius={8}
                pathOptions={{ color: '#c47a12' }}
              />
            )}
          </MapContainer>
        </div>
      </div>
    </div>
  );
}
