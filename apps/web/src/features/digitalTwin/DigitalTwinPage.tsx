import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { IndoorBuildingContext, RouteResponse } from '@campusar/shared';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { useNavStore, usePrefsStore } from '../../stores/themeStore';
import { useGeolocation } from '../../hooks/useGeolocation';
import { buildCrowdByEdge } from '../../lib/cesiumCampus';
import { buildingContextToNavPatch } from '../../lib/buildingNavigation';
import type { CesiumDigitalTwinHandle } from '../../components/twin/CesiumDigitalTwin';
import { BuildingInfoPanel } from './components/BuildingInfoPanel';
import { BuildingSearch } from './components/BuildingSearch';
import { DigitalTwinControls } from './components/DigitalTwinControls';
import { useDigitalTwinSnapshot } from './hooks/useDigitalTwin';
import { useDigitalTwinLiveData } from './hooks/useDigitalTwinLiveData';
import { buildingsToTwin } from './adapters/buildingAdapter';
import { campusBoundaryFromConfig } from './adapters/boundaryAdapter';
import { entrancesFromNodes } from './adapters/entranceAdapter';
import { greenAreasFromBuildings } from './adapters/greenAreaAdapter';
import { toggleTwinLayer } from './adapters/layerState';
import { parkingAreasFromBuildings } from './adapters/parkingAdapter';
import { campusPoisFromSources } from './adapters/poiAdapter';
import { accessibilityToRouteKind, routeToOverlay } from './adapters/routeAdapter';
import { searchTwinObjects } from './adapters/searchAdapter';
import { walkwaySegmentsFromGraph } from './adapters/walkwayAdapter';
import {
  DEFAULT_TWIN_LAYERS,
  type TwinCameraMode,
  type TwinLayerFlags,
  type TwinPick,
  type TwinSearchHit,
} from './types/digitalTwin';
import { deriveBuildingCrowd } from './utils/buildingVisualization';

const CesiumDigitalTwin = lazy(() =>
  import('../../components/twin/CesiumDigitalTwin').then((m) => ({
    default: m.CesiumDigitalTwin,
  })),
);

function TwinLoading() {
  return (
    <div className="flex h-full min-h-[16rem] items-center justify-center bg-ink-950 text-sm text-ink-mute">
      Loading Campus Digital Twin...
    </div>
  );
}

export function DigitalTwinPage() {
  const token = useAuthStore((s) => s.accessToken);
  const navigate = useNavigate();
  const live = useDigitalTwinLiveData();
  const { pose } = useGeolocation(true);
  const {
    buildings,
    nodes,
    edges,
    zones: snapshotZones,
    crowd: snapshotCrowd,
    exits,
    contacts,
    setCrowd,
    setZones,
    loading,
    error,
    reload,
  } = useDigitalTwinSnapshot(token);
  const sourceNodeId = useNavStore((s) => s.sourceNodeId);
  const destinationNodeId = useNavStore((s) => s.destinationNodeId);
  const applyBuildingContext = useNavStore((s) => s.applyBuildingContext);
  const setDestination = useNavStore((s) => s.setDestination);
  const accessibility = usePrefsStore((s) => s.accessibility);

  const viewerRef = useRef<CesiumDigitalTwinHandle>(null);
  const [selection, setSelection] = useState<TwinPick | null>(null);
  const [query, setQuery] = useState('');
  const [layers, setLayers] = useState<TwinLayerFlags>(DEFAULT_TWIN_LAYERS);
  const [cameraMode, setCameraMode] = useState<TwinCameraMode>('3D');
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [viewerReady, setViewerReady] = useState(false);
  const [indoor, setIndoor] = useState<IndoorBuildingContext | null>(null);
  const [indoorLoading, setIndoorLoading] = useState(false);
  const [navigateBusy, setNavigateBusy] = useState(false);
  const [route, setRoute] = useState<RouteResponse | null>(null);

  const crowd = live.crowd.length ? live.crowd : snapshotCrowd;
  const zones = live.zones.length ? live.zones : snapshotZones;

  useEffect(() => {
    if (live.crowd.length) setCrowd(live.crowd);
    if (live.zones.length) setZones(live.zones);
  }, [live.crowd, live.zones, setCrowd, setZones]);

  const twinBuildings = useMemo(() => buildingsToTwin(buildings), [buildings]);
  const walkways = useMemo(() => walkwaySegmentsFromGraph(nodes, edges), [nodes, edges]);
  const pois = useMemo(
    () => campusPoisFromSources({ nodes, exits, contacts }),
    [nodes, exits, contacts],
  );
  const entrances = useMemo(() => entrancesFromNodes(nodes), [nodes]);
  const parking = useMemo(() => parkingAreasFromBuildings(buildings), [buildings]);
  const greenAreas = useMemo(() => greenAreasFromBuildings(buildings), [buildings]);
  const boundary = useMemo(() => campusBoundaryFromConfig(), []);
  const searchableCount = useMemo(
    () => searchTwinObjects({ buildings: twinBuildings, pois, parking, query: '' }).length,
    [twinBuildings, pois, parking],
  );
  const searchResults = useMemo(
    () => searchTwinObjects({ buildings: twinBuildings, pois, parking, query }).slice(0, 12),
    [twinBuildings, pois, parking, query],
  );
  const selectedBuilding =
    selection?.kind === 'building' ? (twinBuildings.find((b) => b.id === selection.id) ?? null) : null;
  const selectedPoi = selection?.kind === 'poi' ? (pois.find((p) => p.id === selection.id) ?? null) : null;
  const selectedEntrance =
    selection?.kind === 'entrance' ? (entrances.find((e) => e.id === selection.id) ?? null) : null;
  const selectedParking =
    selection?.kind === 'parking' ? (parking.find((p) => p.id === selection.id) ?? null) : null;
  const selectedGreen =
    selection?.kind === 'green' ? (greenAreas.find((g) => g.id === selection.id) ?? null) : null;
  const crowdByEdge = useMemo(() => buildCrowdByEdge(crowd, edges), [crowd, edges]);
  const selectedCrowd = selectedBuilding
    ? deriveBuildingCrowd(selectedBuilding.id, nodes, edges, crowdByEdge)
    : { band: 'UNKNOWN' as const, intensity: null };

  const lastUpdated = crowd[0]?.updatedAt
    ? new Date(crowd[0].updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null;

  useEffect(() => {
    if (selection?.kind !== 'building' || !selection.id) {
      setIndoor(null);
      return;
    }
    let cancelled = false;
    setIndoorLoading(true);
    api
      .indoorBuildingContext(selection.id, token)
      .then((ctx) => {
        if (!cancelled) setIndoor(ctx);
      })
      .catch(() => {
        if (!cancelled) setIndoor(null);
      })
      .finally(() => {
        if (!cancelled) setIndoorLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selection, token]);

  useEffect(() => {
    if (!sourceNodeId || !destinationNodeId) {
      setRoute(null);
      return;
    }
    let cancelled = false;
    api
      .route(
        {
          sourceNodeId,
          destinationNodeId,
          accessibility,
        },
        token,
      )
      .then((next) => {
        if (!cancelled) setRoute(next);
      })
      .catch(() => {
        if (!cancelled) setRoute(null);
      });
    return () => {
      cancelled = true;
    };
  }, [sourceNodeId, destinationNodeId, accessibility, token]);

  const overlay = useMemo(
    () => routeToOverlay(route, accessibilityToRouteKind(accessibility.wheelchairMode), nodes),
    [route, accessibility.wheelchairMode, nodes],
  );

  function applyPick(pick: TwinPick | null, fly = true) {
    setSelection(pick);
    setQuery('');
    if (!pick || !fly) return;
    if (pick.kind === 'building') viewerRef.current?.flyToBuilding(pick.id);
    else if (pick.kind === 'poi') {
      const poi = pois.find((p) => p.id === pick.id);
      if (poi) viewerRef.current?.flyToPOI(poi);
    } else if (pick.kind === 'entrance') {
      const entrance = entrances.find((e) => e.id === pick.id);
      if (entrance) viewerRef.current?.flyToPOI(entrance);
    } else if (pick.kind === 'parking') {
      const lot = parking.find((p) => p.id === pick.id);
      if (lot) viewerRef.current?.flyToPOI(lot);
    } else if (pick.kind === 'green') {
      const area = greenAreas.find((g) => g.id === pick.id);
      if (area) viewerRef.current?.flyToPOI(area);
    }
  }

  function pickFromSearch(hit: TwinSearchHit) {
    if (hit.type === 'building') applyPick({ kind: 'building', id: hit.id });
    else if (hit.type === 'poi') applyPick({ kind: 'poi', id: hit.id });
    else applyPick({ kind: 'parking', id: hit.id });
  }

  async function navigateHere() {
    setNavigateBusy(true);
    try {
      if (selection?.kind === 'entrance' && selectedEntrance) {
        setDestination(selectedEntrance.nodeId);
        navigate(`/navigate?to=${encodeURIComponent(selectedEntrance.nodeId)}`);
        return;
      }
      if (selection?.kind === 'poi' && selectedPoi?.metadata?.nodeId) {
        const nodeId = String(selectedPoi.metadata.nodeId);
        setDestination(nodeId);
        navigate(`/navigate?to=${encodeURIComponent(nodeId)}`);
        return;
      }
      if (selection?.kind === 'parking' && selectedParking) {
        const node = nodes.find((n) => n.buildingId === selectedParking.id);
        if (node) {
          setDestination(node.id);
          navigate(`/navigate?to=${encodeURIComponent(node.id)}`);
          return;
        }
      }
      if (!selectedBuilding) return;
      const ctx = indoor ?? (await api.indoorBuildingContext(selectedBuilding.id, token));
      const patch = buildingContextToNavPatch(ctx);
      applyBuildingContext(patch);
      const dest = patch.outdoorEntranceNodeId;
      if (dest) {
        setDestination(dest);
        const params = new URLSearchParams({ to: dest, building: selectedBuilding.id });
        navigate(`/navigate?${params.toString()}`);
        return;
      }
      navigate(`/map`);
    } finally {
      setNavigateBusy(false);
    }
  }

  const navigateLabel =
    selection?.kind === 'entrance'
      ? 'Navigate to entrance'
      : selection?.kind === 'poi'
        ? 'Navigate here'
        : selection?.kind === 'parking'
          ? 'Navigate to parking'
          : 'Navigate here';

  const showError = error || viewerError;
  const emptyCoords = !loading && twinBuildings.length === 0;

  return (
    <div className="flex min-h-[calc(100vh-8.5rem)] flex-col gap-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="page-title">Digital Twin</h1>
          <p className="page-sub">
            Cesium campus environment from existing buildings, walkways, entrances, and live crowd —
            same API as Map and Navigate.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="border border-line bg-paper-raised px-3 py-2 text-sm">
            WS: {live.connected ? 'live' : 'reconnecting…'}
          </span>
          <span className="border border-line bg-paper-raised px-3 py-2 text-sm">
            Simulator: {live.status?.running ? 'on' : 'off'}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row">
        <BuildingSearch
          totalCount={searchableCount}
          query={query}
          onQueryChange={setQuery}
          results={searchResults}
          onPick={pickFromSearch}
        />
        <DigitalTwinControls
          layers={layers}
          available={{
            pois: pois.length > 0,
            entrances: entrances.length > 0,
            parking: parking.length > 0,
            greenAreas: greenAreas.length > 0,
            hazards: true,
          }}
          onToggle={(key) => setLayers((s) => toggleTwinLayer(s, key))}
          cameraMode={cameraMode}
          onCameraMode={setCameraMode}
          onResetCamera={() => viewerRef.current?.flyToCampus()}
          onFocusSelected={() => selection && applyPick(selection, true)}
          canFocusSelected={Boolean(selection)}
          onFocusRoute={() => viewerRef.current?.focusRoute()}
          canFocusRoute={Boolean(overlay)}
        />
      </div>

      {showError && (
        <div className="border border-accent-danger/40 bg-paper-raised p-3 text-sm">
          <p className="font-medium">Unable to load the Digital Twin.</p>
          <p className="mt-1 text-ink-mute">{showError}</p>
          <button
            type="button"
            className="btn-primary mt-3"
            onClick={() => {
              setViewerError(null);
              reload();
            }}
          >
            Retry
          </button>
        </div>
      )}

      {emptyCoords && !showError && (
        <p className="text-sm text-ink-mute">
          No buildings with valid coordinates were returned. Check campus seed data.
        </p>
      )}

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-md border border-line bg-ink-950">
        {loading && !viewerReady && <TwinLoading />}
        <Suspense fallback={<TwinLoading />}>
          <CesiumDigitalTwin
            ref={viewerRef}
            buildings={twinBuildings}
            walkways={walkways}
            pois={pois}
            entrances={entrances}
            parking={parking}
            greenAreas={greenAreas}
            boundary={boundary}
            nodes={nodes}
            edges={edges}
            crowdByEdge={crowdByEdge}
            zones={zones}
            userLatitude={pose?.latitude}
            userLongitude={pose?.longitude}
            selectedBuildingId={selectedBuilding?.id ?? null}
            onSelect={(pick) => applyPick(pick, false)}
            layers={layers}
            navigationRoute={overlay}
            cameraMode={cameraMode}
            onReady={() => setViewerReady(true)}
            onError={setViewerError}
            className="h-[min(70vh,40rem)] sm:h-[70vh]"
          />
        </Suspense>
        <div className="pointer-events-none absolute bottom-3 left-3 right-3 sm:bottom-4 sm:left-auto sm:right-4">
          <div className="pointer-events-auto">
            <BuildingInfoPanel
              pick={selection}
              building={selectedBuilding}
              poi={selectedPoi}
              entrance={selectedEntrance}
              parking={selectedParking}
              green={selectedGreen}
              crowdBand={selectedCrowd.band}
              lastUpdated={lastUpdated}
              indoor={indoor}
              indoorLoading={indoorLoading}
              onClose={() => setSelection(null)}
              onFocus={() => selection && applyPick(selection, true)}
              onNavigate={() => void navigateHere()}
              navigateBusy={navigateBusy}
              navigateLabel={navigateLabel}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
