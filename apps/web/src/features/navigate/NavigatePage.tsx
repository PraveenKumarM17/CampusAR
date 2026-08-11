import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MapContainer, Polyline, CircleMarker, Tooltip } from 'react-leaflet';
import {
  RefreshCw,
  Accessibility,
  Mic,
  MicOff,
  LocateFixed,
  Navigation,
  ArrowUpDown,
  Share2,
  CheckCircle2,
  MapPin,
} from 'lucide-react';
import type { CampusPlace, GraphNode, RouteResponse } from '@campusar/shared';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { useNavStore, usePrefsStore } from '../../stores/themeStore';
import { CAMPUS_DEFAULT_ZOOM, CAMPUS_MAP_CENTER, CAMPUS_MAX_ZOOM } from '../../lib/campus';
import { useGeolocation } from '../../hooks/useGeolocation';
import { formatNodeLabel, snapGpsForRouting } from '../../lib/geo';
import {
  buildNavigateShareUrl,
  copyTextToClipboard,
  parseNavigateParams,
} from '../../lib/navigateUrl';
import {
  computeRouteProgress,
  formatDistance,
  isNearDestination,
  updateArrivalHold,
} from '../../lib/routeProgress';
import {
  BasemapModeSwitcher,
  RealBasemapTiles,
  type BasemapMode,
} from '../../components/maps/RealBasemap';
import { GoogleCampusMap, hasGoogleMapsKey } from '../../components/maps/GoogleCampusMap';
import {
  BreakFollowOnInteract,
  FitMapBounds,
  FollowUser,
  UserLocationMarker,
} from '../../components/maps/GpsTracker';
import { PlaceSearchSelect } from '../../components/navigate/PlaceSearchSelect';

type MapPickMode = 'source' | 'destination';

export function NavigatePage() {
  const token = useAuthStore((s) => s.accessToken);
  const { sourceNodeId, destinationNodeId, setSource, setDestination } = useNavStore();
  const { accessibility, setAccessibility, voiceEnabled, setVoiceEnabled } = usePrefsStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [places, setPlaces] = useState<CampusPlace[]>([]);
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [recalcBusy, setRecalcBusy] = useState(false);
  const [usePrediction, setUsePrediction] = useState(true);
  const [basemapMode, setBasemapMode] = useState<BasemapMode>('hybrid');
  const [followGps, setFollowGps] = useState(true);
  const [sourceManual, setSourceManual] = useState(false);
  const [recenterAt, setRecenterAt] = useState(0);
  const [gpsNote, setGpsNote] = useState<string | null>(null);
  const [mapPickMode, setMapPickMode] = useState<MapPickMode>('destination');
  const [arrived, setArrived] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const navigate = useNavigate();
  const { pose, error: gpsError, requestCompassPermission, refreshLocation, watching } =
    useGeolocation(true);
  const useGoogle = hasGoogleMapsKey();
  const routeReqId = useRef(0);
  const urlAppliedRef = useRef(false);
  const arrivalHoldRef = useRef<{ since: number | null }>({ since: null });
  const stepRefs = useRef<(HTMLLIElement | null)[]>([]);

  const placeNodes = useMemo(
    () =>
      places.map(
        (p): GraphNode => ({
          id: p.id,
          name: p.name,
          latitude: p.latitude,
          longitude: p.longitude,
          floorId: p.floorId,
          buildingId: p.buildingId,
          kind: p.kind,
        }),
      ),
    [places],
  );
  const placeIdSet = useMemo(() => new Set(placeNodes.map((n) => n.id)), [placeNodes]);
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const sourceNode = sourceNodeId ? nodeById.get(sourceNodeId) : null;
  const destNode = destinationNodeId ? nodeById.get(destinationNodeId) : null;

  const routeProgress = useMemo(() => {
    if (!route?.path.length || !pose) return null;
    return computeRouteProgress(pose, route.path);
  }, [route, pose]);

  const stepIndex = routeProgress?.stepIndex ?? 0;
  const distanceRemainingM = routeProgress?.distanceRemainingM ?? route?.totalDistanceM ?? null;
  const routeNodeKey = route?.nodeIds.join(',') ?? '';

  useEffect(() => {
    Promise.all([api.places(token), api.nodes(token)])
      .then(([p, n]) => {
        setPlaces(p);
        setNodes(n);
      })
      .catch(() => {
        setPlaces([]);
        setNodes([]);
      });
  }, [token]);

  // Restore route from share URL once places are loaded
  useEffect(() => {
    if (urlAppliedRef.current || places.length === 0) return;
    const { from, to } = parseNavigateParams(searchParams.toString());
    if (!from && !to) return;

    void api.resolveNavigate(from, to, token).then((result) => {
      if (urlAppliedRef.current) return;
      urlAppliedRef.current = true;
      if (!result.valid) {
        setError(result.errors.map((e: { message: string }) => e.message).join(' '));
        return;
      }
      if (result.source) {
        setSource(result.source.id);
        setSourceManual(true);
        setFollowGps(false);
      }
      if (result.destination) {
        setDestination(result.destination.id);
      }
    }).catch(() => {
      urlAppliedRef.current = true;
      setError('Could not validate shared route link.');
    });
  }, [places.length, searchParams, setSource, setDestination, token]);

  // Keep share URL in sync with selected endpoints
  useEffect(() => {
    if (!sourceNodeId || !destinationNodeId) return;
    if (!placeIdSet.has(sourceNodeId) || !placeIdSet.has(destinationNodeId)) return;
    setSearchParams({ from: sourceNodeId, to: destinationNodeId }, { replace: true });
  }, [sourceNodeId, destinationNodeId, placeIdSet, setSearchParams]);

  // Reset arrival when destination or route changes
  useEffect(() => {
    setArrived(false);
    arrivalHoldRef.current = { since: null };
  }, [destinationNodeId, routeNodeKey]);

  // GPS sets source only while tracking — never override manual pick
  useEffect(() => {
    if (!followGps || sourceManual || !pose || placeNodes.length === 0) return;
    const snap = snapGpsForRouting(pose, nodes);
    setGpsNote(snap.message);
    if (snap.ok && snap.node.id !== sourceNodeId) {
      setSource(snap.node.id);
    }
  }, [pose, nodes, placeNodes.length, followGps, sourceManual, sourceNodeId, setSource]);

  // Step highlighting scroll
  useEffect(() => {
    stepRefs.current[stepIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [stepIndex]);

  // Arrival detection with hold to ignore GPS jitter
  useEffect(() => {
    if (!pose || !route?.path.length || arrived) return;
    const near = isNearDestination(pose, route.path);
    const now = Date.now();
    const next = updateArrivalHold(near, now, arrivalHoldRef.current);
    arrivalHoldRef.current = { since: next.since };
    if (next.arrived) setArrived(true);
  }, [pose, route, arrived]);

  const trackOnMap = followGps && pose != null;

  function handleTrackMe() {
    setFollowGps(true);
    setSourceManual(false);
    setRecenterAt(Date.now());
    void requestCompassPermission();
    refreshLocation();
  }

  const compute = useCallback(
    async (recalc = false) => {
      if (!sourceNodeId || !destinationNodeId) {
        setError('Select source and destination.');
        return;
      }
      if (sourceNodeId === destinationNodeId) {
        setError('Source and destination must be different.');
        return;
      }

      const reqId = ++routeReqId.current;
      if (recalc) setRecalcBusy(true);
      else setLoading(true);
      setError(null);

      try {
        const fn = recalc ? api.recalculate : api.route;
        const r = await fn(
          { sourceNodeId, destinationNodeId, accessibility, usePrediction },
          token,
        );
        if (reqId !== routeReqId.current) return;
        setRoute(r);
        if (voiceEnabled && r.path[0] && !recalc) {
          const utter = new SpeechSynthesisUtterance(r.path[0].instruction);
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(utter);
        }
      } catch (err) {
        if (reqId !== routeReqId.current) return;
        const message =
          err instanceof Error ? err.message : 'Routing failed';
        setError(message);
        if (!recalc) setRoute(null);
      } finally {
        if (reqId === routeReqId.current) {
          if (recalc) setRecalcBusy(false);
          else setLoading(false);
        }
      }
    },
    [sourceNodeId, destinationNodeId, accessibility, usePrediction, token, voiceEnabled],
  );

  useEffect(() => {
    if (!sourceNodeId || !destinationNodeId) return;
    if (sourceNodeId === destinationNodeId) return;
    void compute(false);
  }, [sourceNodeId, destinationNodeId, accessibility, usePrediction, compute]);

  useEffect(() => {
    if (!sourceNodeId || !destinationNodeId || sourceNodeId === destinationNodeId) return;
    const t = setInterval(() => {
      void compute(true);
    }, 30_000);
    return () => clearInterval(t);
  }, [sourceNodeId, destinationNodeId, compute]);

  const points = (route?.path ?? []).map((p) => [p.latitude, p.longitude] as [number, number]);

  function handleSourceChange(id: string | null) {
    if (id && !placeIdSet.has(id)) return;
    setSourceManual(true);
    setFollowGps(false);
    setSource(id);
  }

  function handleDestinationChange(id: string | null) {
    if (id && !placeIdSet.has(id)) return;
    setDestination(id);
  }

  function handleMapPlaceClick(id: string) {
    if (!placeIdSet.has(id)) return;
    if (mapPickMode === 'source') {
      handleSourceChange(id);
    } else {
      handleDestinationChange(id);
    }
  }

  function handleSwap() {
    if (!sourceNodeId || !destinationNodeId) return;
    setSource(destinationNodeId);
    setDestination(sourceNodeId);
    setSourceManual(true);
    setFollowGps(false);
    setArrived(false);
  }

  async function handleShareRoute() {
    if (!sourceNodeId || !destinationNodeId) return;
    setShareNote(null);
    try {
      const url = buildNavigateShareUrl(sourceNodeId, destinationNodeId);
      await copyTextToClipboard(url);
      setShareNote('Route link copied to clipboard.');
    } catch {
      setShareNote('Could not copy link — copy the URL from your browser address bar.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="page-title">Navigation</h1>
          <p className="page-sub">
            Live GPS sets your start · routes around crowd and hazards on RNSIT campus.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className={`btn-ghost inline-flex items-center gap-2 ${followGps ? '!border-accent !text-accent' : ''}`}
            type="button"
            disabled={!pose && !watching}
            onClick={handleTrackMe}
          >
            <Navigation size={16} />
            {followGps ? 'Tracking' : 'Track me'}
          </button>
          <button
            className="btn-ghost"
            type="button"
            onClick={() => setVoiceEnabled(!voiceEnabled)}
          >
            {voiceEnabled ? <Mic size={16} /> : <MicOff size={16} />}
            Voice
          </button>
          <button
            className="btn-ghost inline-flex items-center gap-2"
            type="button"
            disabled={!sourceNodeId || !destinationNodeId}
            onClick={() => void handleShareRoute()}
          >
            <Share2 size={16} /> Share route
          </button>
          <button
            className="btn-primary inline-flex items-center gap-2"
            type="button"
            disabled={!sourceNodeId || !destinationNodeId || recalcBusy}
            onClick={() => void compute(true)}
          >
            <RefreshCw size={16} className={recalcBusy ? 'animate-spin' : ''} /> Recalculate
          </button>
        </div>
      </div>

      {arrived && (
        <div
          className="flex items-center gap-2 rounded-md border border-accent/40 bg-accent/10 px-4 py-3 text-sm font-semibold text-accent"
          role="status"
        >
          <CheckCircle2 size={18} />
          You&apos;ve arrived at {destNode ? formatNodeLabel(destNode) : 'your destination'}!
        </div>
      )}

      {(gpsError || gpsNote || pose) && (
        <p className={`text-sm ${gpsError ? 'text-accent-warn' : 'text-ink-mute'}`}>
          {gpsError ??
            gpsNote ??
            (pose
              ? `GPS ${pose.latitude.toFixed(5)}, ${pose.longitude.toFixed(5)}${
                  pose.accuracy != null ? ` · ±${Math.round(pose.accuracy)} m` : ''
                }`
              : null)}
        </p>
      )}

      {shareNote && <p className="text-sm text-accent">{shareNote}</p>}

      {error && <p className="text-sm text-accent-danger">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-3">
          <div className="panel rounded-md space-y-3 p-4">
            <PlaceSearchSelect
              label="Source (GPS / manual)"
              placeholder="Search start place…"
              emptyLabel={followGps && !sourceManual ? 'Waiting for GPS…' : 'Clear start'}
              nodes={placeNodes}
              value={sourceNodeId}
              onChange={handleSourceChange}
            />
            {sourceNode && (
              <p className="text-xs text-ink-faint">
                Start: {formatNodeLabel(sourceNode)}
                {sourceManual ? ' · manual' : followGps ? ' · GPS' : ''}
              </p>
            )}

            <div className="flex justify-center">
              <button
                type="button"
                className="btn-ghost inline-flex items-center gap-2 !py-2 text-sm"
                disabled={!sourceNodeId || !destinationNodeId}
                aria-label="Swap source and destination"
                onClick={handleSwap}
              >
                <ArrowUpDown size={16} /> Swap
              </button>
            </div>

            <PlaceSearchSelect
              label="Destination"
              placeholder="Search destination…"
              emptyLabel="Clear destination"
              nodes={placeNodes}
              value={destinationNodeId}
              onChange={handleDestinationChange}
            />
            {destNode && (
              <p className="text-xs text-ink-faint">To: {formatNodeLabel(destNode)}</p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                className={`flex-1 rounded-md border px-3 py-2 text-xs font-semibold ${
                  mapPickMode === 'source'
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-line text-ink-mute'
                }`}
                onClick={() => setMapPickMode('source')}
              >
                Map → source
              </button>
              <button
                type="button"
                className={`flex-1 rounded-md border px-3 py-2 text-xs font-semibold ${
                  mapPickMode === 'destination'
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-line text-ink-mute'
                }`}
                onClick={() => setMapPickMode('destination')}
              >
                Map → destination
              </button>
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
              disabled={loading || !sourceNodeId || !destinationNodeId}
              onClick={() => void compute(false)}
            >
              {loading ? 'Finding route…' : 'Get route'}
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
                <strong>{route.totalDistanceM} m</strong> total · ETA{' '}
                <strong>{route.etaMinutes} min</strong>
                {route.predictionUsed ? ' · predicted crowd' : ''}
              </p>
              {distanceRemainingM != null && pose && (
                <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-accent">
                  <MapPin size={14} />
                  {formatDistance(distanceRemainingM)} remaining on route
                </p>
              )}
              <ol className="mt-3 max-h-64 space-y-2 overflow-auto text-sm text-ink-mute">
                {route.path.map((step, i) => {
                  const done = i < stepIndex;
                  const current = i === stepIndex && !arrived;
                  return (
                    <li
                      key={`${step.nodeId}-${i}`}
                      ref={(el) => {
                        stepRefs.current[i] = el;
                      }}
                      className={`rounded-lg px-2 py-1.5 ${
                        current
                          ? 'border border-accent bg-accent/10 font-semibold text-ink'
                          : done
                            ? 'bg-paper-soft/60 text-ink-faint line-through'
                            : 'bg-paper-soft'
                      }`}
                      aria-current={current ? 'step' : undefined}
                    >
                      {step.instruction}
                      {step.distanceM > 0 ? ` · ${Math.round(step.distanceM)} m` : ''}
                    </li>
                  );
                })}
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
          {distanceRemainingM != null && route && pose && (
            <div className="pointer-events-none absolute left-3 top-14 z-[1000] rounded-md border border-line bg-paper-raised/95 px-3 py-2 text-sm font-semibold shadow-sm">
              {formatDistance(distanceRemainingM)} left
            </div>
          )}
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
              onPlaceClick={handleMapPlaceClick}
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
              <FitMapBounds points={points} enabled={!trackOnMap && points.length > 1} />

              {placeNodes.map((node) => {
                const isSrc = node.id === sourceNodeId;
                const isDst = node.id === destinationNodeId;
                return (
                  <CircleMarker
                    key={node.id}
                    center={[node.latitude, node.longitude]}
                    radius={isSrc || isDst ? 9 : 6}
                    pathOptions={{
                      color: isSrc ? '#0f6b63' : isDst ? '#c47a12' : '#148a80',
                      fillColor: isSrc ? '#0f6b63' : isDst ? '#c47a12' : '#2aa89c',
                      fillOpacity: 0.9,
                      weight: 2,
                    }}
                    eventHandlers={{
                      click: () => handleMapPlaceClick(node.id),
                    }}
                  >
                    <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
                      {formatNodeLabel(node)}
                    </Tooltip>
                  </CircleMarker>
                );
              })}

              {points.length > 1 && (
                <Polyline positions={points} pathOptions={{ color: '#0f6b63', weight: 6 }} />
              )}

              {pose && <UserLocationMarker pose={pose} />}
            </MapContainer>
          )}
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
        </div>
      </div>
    </div>
  );
}
