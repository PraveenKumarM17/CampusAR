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
import type {
  Building,
  CampusPlace,
  DangerZone,
  GraphNode,
  IndoorHandoff,
  RouteResponse,
  SiteArea,
} from '@campusar/shared';
import { api } from '../../lib/api';
import { useCampusApi } from '../../hooks/useCampusApi';
import { useCampusLive } from '../../hooks/useCampusLive';
import { usePreviewStore } from '../../stores/previewStore';
import { useAuthStore } from '../../stores/authStore';
import { useNavStore, usePrefsStore } from '../../stores/themeStore';
import { CAMPUS_DEFAULT_ZOOM, CAMPUS_MAX_ZOOM, siteHasPublishedMap } from '../../lib/campus';
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
import { InvalidateMapSize } from '../../components/maps/InvalidateMapSize';
import { GoogleCampusMap, hasGoogleMapsKey } from '../../components/maps/GoogleCampusMap';
import {
  BreakFollowOnInteract,
  FitMapBounds,
  FollowUser,
  RecenterOnSite,
  UserLocationMarker,
} from '../../components/maps/GpsTracker';
import { CampusMapLibreMap } from '../../components/maps/CampusMapLibreMap';
import { PlaceSearchSelect } from '../../components/navigate/PlaceSearchSelect';
import { IndoorDestinationPicker } from '../../components/indoor/IndoorDestinationPicker';
import { EmptySiteNotice } from '../../components/EmptySiteNotice';
import { useActiveSite } from '../../hooks/useActiveSite';
import { MAP_ENGINE } from '../../lib/mapEngine';
import {
  buildingContextToNavPatch,
  buildIndoorNavPath,
  indoorConfirmVisible,
  indoorPickerVisible,
  loadBuildingContext,
  shouldOpenIndoorPicker,
} from '../../lib/buildingNavigation';

type MapPickMode = 'source' | 'destination';

export function NavigatePage() {
  const token = useAuthStore((s) => s.accessToken);
  const campusApi = useCampusApi();
  const previewActive = usePreviewStore((s) => s.active);
  const { activeSiteId, mapCenter } = useActiveSite();
  const {
    sourceNodeId,
    destinationNodeId,
    setSource,
    setDestination,
    selectedBuildingId,
    selectedBuildingName,
    hasIndoorMap,
    indoorMapId,
    indoorDestinationPlaceId,
    indoorDestinationName,
    indoorDestinationDetail,
    arrivalPromptShown,
    indoorPickerDismissed,
    transitionStatus,
    applyBuildingContext,
    markArrivedAtBuilding,
    dismissIndoorPicker,
    setIndoorDestination,
    changeIndoorDestination,
  } = useNavStore();
  const { accessibility, setAccessibility, voiceEnabled, setVoiceEnabled } = usePrefsStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [places, setPlaces] = useState<CampusPlace[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [edges, setEdges] = useState<
    { id: string; crowdScore: number; fromNodeId: string; toNodeId: string }[]
  >([]);
  const [areas, setAreas] = useState<SiteArea[]>([]);
  const [zones, setZones] = useState<DangerZone[]>([]);
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
  const [indoorHandoff, setIndoorHandoff] = useState<IndoorHandoff | null>(null);
  const navigate = useNavigate();
  const { pose, error: gpsError, requestCompassPermission, refreshLocation, watching } =
    useGeolocation(true);
  const useGoogle = hasGoogleMapsKey();
  const useMapLibre = MAP_ENGINE === 'maplibre';
  const live = useCampusLive();
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
  const hasPublishedMap = siteHasPublishedMap({
    buildings: buildings.length,
    nodes: nodes.length,
    edges: edges.length,
  });
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
    Promise.all([
      campusApi.places(token),
      campusApi.nodes(token),
      campusApi.buildings(token),
      campusApi.edges(token),
      campusApi.areas(token),
      api.zones(),
    ])
      .then(([p, n, b, e, a, z]) => {
        setPlaces(p);
        setNodes(n);
        setBuildings(b);
        setEdges(
          e.map((edge) => ({
            id: edge.id,
            crowdScore: edge.crowdScore,
            fromNodeId: edge.fromNodeId,
            toNodeId: edge.toNodeId,
          })),
        );
        setAreas(a);
        setZones(z.filter((x) => x.active));
      })
      .catch(() => {
        setPlaces([]);
        setNodes([]);
        setBuildings([]);
        setEdges([]);
        setAreas([]);
        setZones([]);
      });
  }, [token, activeSiteId, campusApi]);

  useEffect(() => {
    if (!live.crowd.length) return;
    setEdges((prev) =>
      prev.map((edge) => {
        const hit = live.crowd.find((c) => c.edgeId === edge.id);
        return hit ? { ...edge, crowdScore: hit.intensity } : edge;
      }),
    );
  }, [live.crowd]);

  useEffect(() => {
    if (live.zones.length) setZones(live.zones.filter((z) => z.active));
  }, [live.zones]);

  useEffect(() => {
    if (!destinationNodeId) {
      setIndoorHandoff(null);
      return;
    }
    campusApi
      .indoorHandoff(destinationNodeId, token)
      .then((h) => setIndoorHandoff(h))
      .catch(() => setIndoorHandoff(null));
  }, [destinationNodeId, token, campusApi]);

  // Restore route from share URL once places are loaded
  useEffect(() => {
    if (urlAppliedRef.current || places.length === 0) return;
    const { from, to, building } = parseNavigateParams(searchParams.toString());
    if (!from && !to && !building) return;

    void (async () => {
      try {
        if (from || to) {
          const result = await campusApi.resolveNavigate(from, to, token);
          if (urlAppliedRef.current) return;
          if (!result.valid) {
            urlAppliedRef.current = true;
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
        }
        if (building) {
          const ctx = await loadBuildingContext(building, (id) =>
            campusApi.indoorBuildingContext(id, token),
          );
          if (urlAppliedRef.current && !from && !to) return;
          applyBuildingContext(buildingContextToNavPatch(ctx, { allowDraft: previewActive }));
        }
        urlAppliedRef.current = true;
      } catch {
        urlAppliedRef.current = true;
        setError('Could not validate shared route link.');
      }
    })();
  }, [places.length, searchParams, setSource, setDestination, applyBuildingContext, token, campusApi, previewActive]);

  // Keep share URL in sync with selected endpoints
  useEffect(() => {
    if (!sourceNodeId || !destinationNodeId) return;
    if (!placeIdSet.has(sourceNodeId) || !placeIdSet.has(destinationNodeId)) return;
    const next: Record<string, string> = { from: sourceNodeId, to: destinationNodeId };
    if (selectedBuildingId) next.building = selectedBuildingId;
    setSearchParams(next, { replace: true });
  }, [sourceNodeId, destinationNodeId, selectedBuildingId, placeIdSet, setSearchParams]);

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

  useEffect(() => {
    if (
      !shouldOpenIndoorPicker({
        arrived,
        hasIndoorMap,
        arrivalPromptShown,
      })
    ) {
      return;
    }
    markArrivedAtBuilding();
  }, [arrived, hasIndoorMap, arrivalPromptShown, markArrivedAtBuilding]);

  const showIndoorPicker = indoorPickerVisible({
    hasIndoorMap,
    indoorPickerDismissed,
    indoorDestinationPlaceId,
    transitionStatus,
  });
  const showIndoorConfirm = indoorConfirmVisible({
    indoorDestinationPlaceId,
    transitionStatus,
  });

  async function handleBuildingSelect(buildingId: string) {
    try {
      const ctx = await loadBuildingContext(buildingId, (id) =>
        campusApi.indoorBuildingContext(id, token),
      );
      applyBuildingContext(buildingContextToNavPatch(ctx, { allowDraft: previewActive }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load that building.');
    }
  }

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
        const fn = recalc ? campusApi.recalculate : campusApi.route;
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
    [sourceNodeId, destinationNodeId, accessibility, usePrediction, token, voiceEnabled, campusApi],
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
    <div className="space-y-3 sm:space-y-4">
      <div className="flex flex-col gap-2 sm:gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="page-title text-2xl sm:text-3xl">Navigation</h1>
          <p className="page-sub text-xs sm:text-sm">
            Live GPS sets your start · routes around crowd and hazards on RNSIT campus.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <button
            className={`btn-ghost inline-flex items-center justify-center gap-1.5 !py-2 !text-xs sm:gap-2 sm:!py-2.5 sm:!text-sm ${followGps ? '!border-accent !text-accent' : ''}`}
            type="button"
            disabled={!pose && !watching}
            onClick={handleTrackMe}
          >
            <Navigation size={14} className="sm:size-4" />
            <span className="hidden sm:inline">{followGps ? 'Tracking' : 'Track me'}</span>
            <span className="sm:hidden">{followGps ? 'Track' : 'Track'}</span>
          </button>
          <button
            className="btn-ghost inline-flex items-center justify-center gap-1.5 !py-2 !text-xs sm:gap-2 sm:!py-2.5 sm:!text-sm"
            type="button"
            onClick={() => setVoiceEnabled(!voiceEnabled)}
          >
            {voiceEnabled ? <Mic size={14} className="sm:size-4" /> : <MicOff size={14} className="sm:size-4" />}
            Voice
          </button>
          <button
            className="btn-ghost inline-flex items-center justify-center gap-1.5 !py-2 !text-xs sm:gap-2 sm:!py-2.5 sm:!text-sm"
            type="button"
            disabled={!sourceNodeId || !destinationNodeId}
            onClick={() => void handleShareRoute()}
          >
            <Share2 size={14} className="sm:size-4" />
            <span className="hidden sm:inline">Share route</span>
            <span className="sm:hidden">Share</span>
          </button>
          <button
            className="btn-primary inline-flex items-center justify-center gap-1.5 !py-2 !text-xs sm:gap-2 sm:!py-2.5 sm:!text-sm"
            type="button"
            disabled={!sourceNodeId || !destinationNodeId || recalcBusy}
            onClick={() => void compute(true)}
          >
            <RefreshCw size={14} className={`sm:size-4 ${recalcBusy ? 'animate-spin' : ''}`} />
            <span className="hidden lg:inline">Recalculate</span>
            <span className="lg:hidden">Recalc</span>
          </button>
        </div>
      </div>

      {arrived && !showIndoorPicker && !showIndoorConfirm && (
        <div
          className="flex items-center gap-2 rounded-md border border-accent/40 bg-accent/10 px-4 py-3 text-sm font-semibold text-accent"
          role="status"
        >
          <CheckCircle2 size={18} />
          You&apos;ve arrived at{' '}
          {selectedBuildingName ?? (destNode ? formatNodeLabel(destNode) : 'your destination')}!
        </div>
      )}

      {(gpsError || gpsNote || pose) && (
        <p className={`text-xs sm:text-sm ${gpsError ? 'text-accent-warn' : 'text-ink-mute'}`}>
          {gpsError ??
            gpsNote ??
            (pose
              ? `GPS ${pose.latitude.toFixed(5)}, ${pose.longitude.toFixed(5)}${
                  pose.accuracy != null ? ` · ±${Math.round(pose.accuracy)} m` : ''
                }`
              : null)}
        </p>
      )}

      {shareNote && <p className="text-xs text-accent sm:text-sm">{shareNote}</p>}

      {indoorHandoff && !(hasIndoorMap && selectedBuildingId) && (
        <div className="rounded-md border border-accent/40 bg-accent/10 px-4 py-3 text-sm">
          <p className="font-semibold">{indoorHandoff.prompt}</p>
          <button
            type="button"
            className="mt-2 text-sm font-semibold text-accent underline"
            onClick={() => navigate('/indoor')}
          >
            Continue indoor navigation
          </button>
        </div>
      )}

      {error && <p className="text-xs text-accent-danger sm:text-sm">{error}</p>}

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-[280px_1fr] xl:grid-cols-[320px_1fr]">
        <div className="space-y-2 sm:space-y-3">
          <div className="panel rounded-md space-y-2.5 p-3 sm:space-y-3 sm:p-4">
            <PlaceSearchSelect
              label="Source (GPS / manual)"
              placeholder="Search start place…"
              emptyLabel={followGps && !sourceManual ? 'Waiting for GPS…' : 'Clear start'}
              nodes={placeNodes}
              value={sourceNodeId}
              onChange={handleSourceChange}
            />
            {sourceNode && (
              <p className="text-[10px] text-ink-faint sm:text-xs">
                Start: {formatNodeLabel(sourceNode)}
                {sourceManual ? ' · manual' : followGps ? ' · GPS' : ''}
              </p>
            )}

            <div className="flex justify-center">
              <button
                type="button"
                className="btn-ghost inline-flex items-center gap-1.5 !py-1.5 text-xs sm:gap-2 sm:!py-2 sm:text-sm"
                disabled={!sourceNodeId || !destinationNodeId}
                aria-label="Swap source and destination"
                onClick={handleSwap}
              >
                <ArrowUpDown size={14} className="sm:size-4" /> Swap
              </button>
            </div>

            <PlaceSearchSelect
              label="Destination"
              placeholder="Search destination or building…"
              emptyLabel="Clear destination"
              nodes={placeNodes}
              value={destinationNodeId}
              onChange={handleDestinationChange}
              buildings={buildings}
              onSelectBuilding={(id) => void handleBuildingSelect(id)}
              selectedLabel={
                selectedBuildingName
                  ? `${selectedBuildingName}${destNode ? ` · ${formatNodeLabel(destNode)}` : ''}`
                  : null
              }
            />
            {destNode && (
              <p className="text-[10px] text-ink-faint sm:text-xs">To: {formatNodeLabel(destNode)}</p>
            )}

            <div className="flex gap-1.5 sm:gap-2">
              <button
                type="button"
                className={`flex-1 rounded-md border px-2 py-1.5 text-[10px] font-semibold transition-colors sm:px-3 sm:py-2 sm:text-xs ${
                  mapPickMode === 'source'
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-line text-ink-mute hover:bg-paper-soft'
                }`}
                onClick={() => setMapPickMode('source')}
              >
                Map → source
              </button>
              <button
                type="button"
                className={`flex-1 rounded-md border px-2 py-1.5 text-[10px] font-semibold transition-colors sm:px-3 sm:py-2 sm:text-xs ${
                  mapPickMode === 'destination'
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-line text-ink-mute hover:bg-paper-soft'
                }`}
                onClick={() => setMapPickMode('destination')}
              >
                Map → destination
              </button>
            </div>

            <label className="flex items-center justify-between text-xs sm:text-sm">
              <span>Crowd prediction</span>
              <input
                type="checkbox"
                checked={usePrediction}
                onChange={(e) => setUsePrediction(e.target.checked)}
              />
            </label>
            <button
              className="btn-primary w-full !py-2 !text-xs sm:!py-2.5 sm:!text-sm"
              type="button"
              disabled={loading || !sourceNodeId || !destinationNodeId}
              onClick={() => void compute(false)}
            >
              {loading ? 'Finding route…' : 'Get route'}
            </button>
            {error && <p className="text-xs text-accent-danger sm:text-sm">{error}</p>}
          </div>

          <div className="panel rounded-md space-y-2.5 p-3 sm:space-y-3 sm:p-4">
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold sm:gap-2 sm:text-sm">
              <Accessibility size={14} className="text-accent sm:size-4" /> Accessibility
            </p>
            {(
              [
                ['wheelchairMode', 'Wheelchair mode'],
                ['preferLift', 'Prefer lifts'],
                ['preferRamp', 'Prefer ramps'],
                ['avoidStairs', 'Avoid stairs'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center justify-between text-xs sm:text-sm">
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
            <div className="panel rounded-md p-3 sm:p-4">
              <p className="text-xs sm:text-sm">
                <strong>{route.totalDistanceM} m</strong> total · ETA{' '}
                <strong>{route.etaMinutes} min</strong>
                {route.predictionUsed ? ' · predicted crowd' : ''}
              </p>
              {distanceRemainingM != null && pose && (
                <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-accent sm:gap-1.5 sm:text-sm">
                  <MapPin size={12} className="sm:size-[14px]" />
                  {formatDistance(distanceRemainingM)} remaining on route
                </p>
              )}
              <ol className="mt-2 max-h-48 space-y-1.5 overflow-auto text-xs text-ink-mute sm:mt-3 sm:max-h-64 sm:space-y-2 sm:text-sm">
                {route.path.map((step, i) => {
                  const done = i < stepIndex;
                  const current = i === stepIndex && !arrived;
                  return (
                    <li
                      key={`${step.nodeId}-${i}`}
                      ref={(el) => {
                        stepRefs.current[i] = el;
                      }}
                      className={`rounded-lg px-2 py-1.5 transition-colors ${
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
                className="btn-primary mt-2 w-full !py-2 !text-xs sm:mt-3 sm:!py-2.5 sm:!text-sm"
                type="button"
                onClick={() => navigate('/ar')}
              >
                Launch AR navigation
              </button>
            </div>
          )}
        </div>

        {!hasPublishedMap && <EmptySiteNotice compact />}

        <div className="relative overflow-hidden rounded-md border border-line">
          <BasemapModeSwitcher mode={basemapMode} onChange={setBasemapMode} />
          {distanceRemainingM != null && route && pose && (
            <div className="pointer-events-none absolute left-2 top-12 z-[1000] rounded-md border border-line bg-paper-raised/95 px-2 py-1.5 text-xs font-semibold shadow-sm sm:left-3 sm:top-14 sm:px-3 sm:py-2 sm:text-sm">
              {formatDistance(distanceRemainingM)} left
            </div>
          )}
          {useMapLibre ? (
            <CampusMapLibreMap
              className="h-[50vh] w-full sm:h-[55vh] md:h-[60vh] lg:h-[70vh]"
              center={mapCenter}
              basemapMode={basemapMode}
              buildings={buildings}
              placeNodes={placeNodes}
              graphNodes={nodes}
              edges={edges}
              areas={areas}
              zones={zones}
              routePoints={points}
              pose={pose}
              followGps={trackOnMap}
              recenterAt={recenterAt}
              sourceNodeId={sourceNodeId}
              destinationNodeId={destinationNodeId}
              onFollowBreak={() => setFollowGps(false)}
              onPlaceClick={handleMapPlaceClick}
              onBuildingClick={(id) => void handleBuildingSelect(id)}
            />
          ) : useGoogle ? (
            <GoogleCampusMap
              className="h-[50vh] w-full sm:h-[55vh] md:h-[60vh] lg:h-[70vh]"
              mode={basemapMode}
              center={mapCenter}
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
              center={mapCenter}
              zoom={CAMPUS_DEFAULT_ZOOM}
              className="h-[50vh] w-full sm:h-[55vh] md:h-[60vh] lg:h-[70vh]"
              maxZoom={CAMPUS_MAX_ZOOM}
            >
              <InvalidateMapSize />
              <RealBasemapTiles mode={basemapMode} />
              <RecenterOnSite center={mapCenter} enabled={!trackOnMap} />
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
            className={`absolute bottom-3 right-3 z-[1000] inline-flex items-center gap-1.5 rounded-md border border-line bg-paper-raised px-2.5 py-1.5 text-xs font-semibold shadow-sm hover:border-accent sm:bottom-4 sm:right-4 sm:gap-2 sm:px-3 sm:py-2 sm:text-sm ${
              followGps ? 'border-accent text-accent' : ''
            }`}
            onClick={handleTrackMe}
          >
            <LocateFixed size={14} className="text-accent sm:size-4" />
            <span className="hidden sm:inline">{followGps ? 'Tracking' : 'Track me'}</span>
          </button>
        </div>
      </div>

      {showIndoorPicker && selectedBuildingId && selectedBuildingName && (
        <IndoorDestinationPicker
          buildingId={selectedBuildingId}
          buildingName={selectedBuildingName}
          indoorMapId={indoorMapId}
          token={token}
          onSelect={(place, detail) => setIndoorDestination(place.id, place.name, detail)}
          onDismiss={dismissIndoorPicker}
        />
      )}

      {showIndoorConfirm && indoorDestinationPlaceId && selectedBuildingName && (
        <div
          className="fixed inset-0 z-[2100] flex items-end justify-center bg-ink/40 p-3 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="indoor-confirm-title"
        >
          <div className="w-full max-w-lg rounded-md border border-line bg-paper-raised p-4 shadow-lg">
            <h2 id="indoor-confirm-title" className="text-lg font-semibold">
              {indoorDestinationName ?? 'Indoor destination'}
            </h2>
            <p className="mt-2 text-sm text-ink-mute">{selectedBuildingName}</p>
            {indoorDestinationDetail && (
              <p className="mt-1 text-sm text-ink-mute">{indoorDestinationDetail}</p>
            )}
            <p className="mt-3 text-sm font-medium">Ready for indoor navigation</p>
            <button
              className="btn-primary mt-4 w-full"
              type="button"
              onClick={() =>
                navigate(
                  buildIndoorNavPath(selectedBuildingId!, indoorDestinationPlaceId, indoorMapId),
                )
              }
            >
              Start Indoor Navigation
            </button>
            <button
              className="btn-ghost mt-2 w-full"
              type="button"
              onClick={changeIndoorDestination}
            >
              Change Destination
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
