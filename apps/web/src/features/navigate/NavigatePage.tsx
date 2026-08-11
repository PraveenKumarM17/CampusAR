import { useEffect, useState } from 'react';
import { MapContainer, Polyline, CircleMarker } from 'react-leaflet';
import { RefreshCw, Accessibility, Mic, MicOff, LocateFixed } from 'lucide-react';
import type { GraphNode, RouteResponse } from '@campusar/shared';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { useNavStore, usePrefsStore } from '../../stores/themeStore';
import { useNavigate } from 'react-router-dom';
import { CAMPUS_DEFAULT_ZOOM, CAMPUS_MAP_CENTER, CAMPUS_MAX_ZOOM } from '../../lib/campus';
import { useGeolocation } from '../../hooks/useGeolocation';
import { snapGpsForRouting } from '../../lib/geo';
import {
  BasemapModeSwitcher,
  RealBasemapTiles,
  type BasemapMode,
} from '../../components/maps/RealBasemap';
import { GoogleCampusMap, hasGoogleMapsKey } from '../../components/maps/GoogleCampusMap';
import {
  BreakFollowOnInteract,
  FollowUser,
  UserLocationMarker,
} from '../../components/maps/GpsTracker';

export function NavigatePage() {
  const token = useAuthStore((s) => s.accessToken);
  const { sourceNodeId, destinationNodeId, setSource, setDestination } = useNavStore();
  const { accessibility, setAccessibility, voiceEnabled, setVoiceEnabled } = usePrefsStore();
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [usePrediction, setUsePrediction] = useState(true);
  const [basemapMode, setBasemapMode] = useState<BasemapMode>('hybrid');
  const [followGps, setFollowGps] = useState(true);
  const [recenterAt, setRecenterAt] = useState(0);
  const [gpsNote, setGpsNote] = useState<string | null>(null);
  const navigate = useNavigate();
  const { pose, error: gpsError, requestCompassPermission, refreshLocation } = useGeolocation(true);
  const useGoogle = hasGoogleMapsKey();

  useEffect(() => {
    api.nodes(token).then(setNodes);
  }, [token]);

  useEffect(() => {
    if (!pose || nodes.length === 0) return;
    const snap = snapGpsForRouting(pose, nodes);
    setGpsNote(snap.message);
    if (snap.ok && snap.node.id !== sourceNodeId) setSource(snap.node.id);
  }, [pose, nodes, sourceNodeId, setSource]);

  const trackOnMap = followGps && pose != null;

  function handleTrackMe() {
    setFollowGps(true);
    setRecenterAt(Date.now());
    void requestCompassPermission();
    refreshLocation();
  }

  async function compute(recalc = false) {
    if (!sourceNodeId || !destinationNodeId) {
      setError('Select source and destination (GPS sets source when available)');
      return;
    }
    if (sourceNodeId === destinationNodeId) {
      setError('You are already at the destination');
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
  }, [sourceNodeId, destinationNodeId]);

  useEffect(() => {
    if (!sourceNodeId || !destinationNodeId) return;
    const t = setInterval(() => {
      void compute(true);
    }, 10_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceNodeId, destinationNodeId, accessibility, usePrediction, token]);

  const points = (route?.path ?? []).map((p) => [p.latitude, p.longitude] as [number, number]);
  const placeNodes = nodes.filter(
    (n) => n.kind === 'entrance' || n.kind === 'outdoor' || n.kind === 'exit',
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="page-title">Navigation</h1>
          <p className="page-sub">
            Live GPS sets your start · routes around crowd and hazards on RNSIT campus.
          </p>
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

      {(gpsError || gpsNote) && (
        <p className={`text-sm ${gpsError ? 'text-accent-warn' : 'text-ink-mute'}`}>
          {gpsError ?? gpsNote}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-3">
          <div className="panel rounded-md space-y-3 p-4">
            <div>
              <label className="label">Source (GPS / manual)</label>
              <select
                className="input"
                value={sourceNodeId ?? ''}
                onChange={(e) => setSource(e.target.value || null)}
              >
                <option value="">Waiting for GPS…</option>
                {placeNodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name ?? n.kind}
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
                <option value="">Select place</option>
                {placeNodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name ?? n.kind}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center justify-between text-sm">
              <span>Crowd prediction</span>
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

          <div className="panel rounded-md space-y-3 p-4">
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

        <div className="relative overflow-hidden rounded-md border border-line">
          <BasemapModeSwitcher mode={basemapMode} onChange={setBasemapMode} />
          {useGoogle ? (
            <GoogleCampusMap
              className="h-[70vh] w-full"
              mode={basemapMode}
              placeNodes={placeNodes}
              sourceNodeId={sourceNodeId}
              destinationNodeId={destinationNodeId}
              routePoints={points}
              pose={pose}
              followGps={trackOnMap}
              recenterAt={recenterAt}
              onFollowBreak={() => setFollowGps(false)}
              onPlaceClick={(id) => setDestination(id)}
            />
          ) : (
            <MapContainer
              center={CAMPUS_MAP_CENTER}
              zoom={CAMPUS_DEFAULT_ZOOM}
              className="h-[70vh] w-full"
              maxZoom={CAMPUS_MAX_ZOOM}
            >
              <RealBasemapTiles mode={basemapMode} />
              <BreakFollowOnInteract onBreak={() => setFollowGps(false)} />
              <FollowUser pose={pose} enabled={trackOnMap} recenterAt={recenterAt} />
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
              {pose && <UserLocationMarker pose={pose} />}
            </MapContainer>
          )}
          {pose && (
            <button
              type="button"
              className={`absolute bottom-4 right-4 z-[1000] inline-flex items-center gap-2 rounded-md border border-line bg-paper-raised px-3 py-2 text-sm font-semibold shadow-sm hover:border-accent ${
                followGps ? 'border-accent text-accent' : ''
              }`}
              onClick={handleTrackMe}
            >
              <LocateFixed size={16} className="text-accent" />
              {followGps ? 'Tracking' : 'Track me'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
