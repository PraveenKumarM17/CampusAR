import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  MapContainer,
  CircleMarker,
  Circle,
  Popup,
  Tooltip,
  Polyline,
  Polygon,
  useMap,
} from 'react-leaflet';
import { Search, Filter, LocateFixed, Navigation } from 'lucide-react';
import type {
  Building,
  DangerZone,
  GraphNode,
  RouteResponse,
  SearchResult,
  SiteArea,
} from '@campusar/shared';
import { api } from '../../lib/api';
import { useCampusApi } from '../../hooks/useCampusApi';
import { useAuthStore } from '../../stores/authStore';
import { useNavStore } from '../../stores/themeStore';
import { useNavigate } from 'react-router-dom';
import { useCampusLive } from '../../hooks/useCampusLive';
import { useGeolocation } from '../../hooks/useGeolocation';
import {
  CAMPUS_DEFAULT_ZOOM,
  CAMPUS_MAX_ZOOM,
  siteHasPublishedMap,
} from '../../lib/campus';
import { closestNamedPlace, namedPlaceNodes, snapGpsForRouting } from '../../lib/geo';
import {
  buildingContextToNavPatch,
  loadBuildingContext,
} from '../../lib/buildingNavigation';
import {
  BasemapModeSwitcher,
  RealBasemapTiles,
  type BasemapMode,
} from '../../components/maps/RealBasemap';
import {
  GoogleCampusMap,
  hasGoogleMapsKey,
} from '../../components/maps/GoogleCampusMap';
import {
  BreakFollowOnInteract,
  FollowUser,
  RecenterOnSite,
  UserLocationMarker,
} from '../../components/maps/GpsTracker';
import { CampusMapLibreMap } from '../../components/maps/CampusMapLibreMap';
import { EmptySiteNotice } from '../../components/EmptySiteNotice';
import { useActiveSite } from '../../hooks/useActiveSite';
import { MAP_ENGINE } from '../../lib/mapEngine';

function FitBounds({ points, enabled }: { points: [number, number][]; enabled: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (!enabled || points.length <= 1) return;
    map.fitBounds(points, { padding: [48, 48] });
  }, [map, points, enabled]);
  return null;
}

function RecenterButton({
  lat,
  lon,
  onClick,
}: {
  lat: number;
  lon: number;
  onClick?: () => void;
}) {
  const map = useMap();
  return (
    <button
      type="button"
      className="absolute bottom-4 right-4 z-[1000] inline-flex items-center gap-2 rounded-md border border-line bg-paper-raised px-3 py-2 text-sm font-semibold text-ink shadow-sm hover:border-accent"
      onClick={() => {
        map.setView([lat, lon], Math.max(map.getZoom(), 18));
        onClick?.();
      }}
    >
      <LocateFixed size={16} className="text-accent" /> My location
    </button>
  );
}

export function MapPage() {
  const token = useAuthStore((s) => s.accessToken);
  const { sourceNodeId, destinationNodeId, setSource, setDestination, applyBuildingContext } =
    useNavStore();
  const { activeSiteId, label, mapCenter } = useActiveSite();
  const navigate = useNavigate();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [rooms, setRooms] = useState<{ buildingId: string; category: string }[]>([]);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [areas, setAreas] = useState<SiteArea[]>([]);
  const [zones, setZones] = useState<DangerZone[]>([]);
  const [edges, setEdges] = useState<
    { id: string; crowdScore: number; fromNodeId: string; toNodeId: string }[]
  >([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [followGps, setFollowGps] = useState(true);
  const [recenterAt, setRecenterAt] = useState(0);
  const [gpsNote, setGpsNote] = useState<string | null>(null);
  const [basemapMode, setBasemapMode] = useState<BasemapMode>('hybrid');
  const useGoogle = hasGoogleMapsKey();
  const useMapLibre = MAP_ENGINE === 'maplibre';
  const live = useCampusLive();
  const campusApi = useCampusApi();
  const { pose, error: gpsError, requestCompassPermission, refreshLocation, watching } =
    useGeolocation(true);

  useEffect(() => {
    Promise.all([
      campusApi.buildings(token),
      campusApi.rooms(token),
      campusApi.nodes(token),
      campusApi.edges(token),
      campusApi.areas(token),
      api.zones(),
      api.categories(),
    ]).then(([b, r, n, e, a, z, c]) => {
      setBuildings(b);
      setRooms(r.map((room) => ({ buildingId: room.buildingId, category: room.category })));
      setNodes(n);
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
      setCategories(c);
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
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      campusApi
        .search(query, token)
        .then(setResults)
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [query, token, campusApi]);

  // Snap live GPS → nearest campus node for routing only (marker stays on raw GPS)
  useEffect(() => {
    if (!followGps || !pose || nodes.length === 0) return;
    const snap = snapGpsForRouting(pose, nodes);
    setGpsNote(snap.message);
    if (snap.ok && snap.node.id !== sourceNodeId) {
      setSource(snap.node.id);
    }
  }, [pose, nodes, followGps, sourceNodeId, setSource]);

  const trackOnMap = followGps && pose != null;

  function handleTrackMe() {
    setFollowGps(true);
    setRecenterAt(Date.now());
    void requestCompassPermission();
    refreshLocation();
  }

  const filteredBuildings = useMemo(() => {
    if (!category) return buildings;
    const buildingIds = new Set(
      rooms.filter((r) => r.category === category).map((r) => r.buildingId),
    );
    return buildings.filter((b) => buildingIds.has(b.id));
  }, [buildings, rooms, category]);

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const placeNodes = useMemo(() => namedPlaceNodes(nodes), [nodes]);
  const hasPublishedMap = siteHasPublishedMap({
    buildings: buildings.length,
    nodes: nodes.length,
    edges: edges.length,
  });

  const crowdPolylines = useMemo(() => {
    return edges
      .map((edge) => {
        const from = nodeById.get(edge.fromNodeId);
        const to = nodeById.get(edge.toNodeId);
        if (!from || !to) return null;
        return {
          id: edge.id,
          crowdScore: edge.crowdScore,
          positions: [
            [from.latitude, from.longitude] as [number, number],
            [to.latitude, to.longitude] as [number, number],
          ],
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      crowdScore: number;
      positions: [number, number][];
    }>;
  }, [edges, nodeById]);

  async function computeRoute(fromId: string, toId: string) {
    try {
      const r = await campusApi.route(
        { sourceNodeId: fromId, destinationNodeId: toId, usePrediction: true },
        token,
      );
      setRoute(r);
    } catch {
      setRoute(null);
    }
  }

  async function startRoute(destNodeId: string) {
    setDestination(destNodeId);
    const from = sourceNodeId;
    if (!from) return;
    await computeRoute(from, destNodeId);
  }

  async function startBuildingRoute(buildingId: string) {
    try {
      const ctx = await loadBuildingContext(buildingId, (id) =>
        campusApi.indoorBuildingContext(id, token),
      );
      applyBuildingContext(buildingContextToNavPatch(ctx));
      const entranceId = ctx.entrance?.outdoorNodeId;
      if (entranceId && sourceNodeId) {
        await computeRoute(sourceNodeId, entranceId);
      }
    } catch {
      setGpsNote('Could not load that building for navigation.');
    }
  }

  // Recalculate when GPS snap changes source while destination set
  useEffect(() => {
    if (!sourceNodeId || !destinationNodeId || !followGps) return;
    if (sourceNodeId === destinationNodeId) return;
    const t = setTimeout(() => {
      void computeRoute(sourceNodeId, destinationNodeId);
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceNodeId, destinationNodeId, followGps]);

  const routePoints = (route?.path ?? []).map((p) => [p.latitude, p.longitude] as [number, number]);
  const sourceNode = sourceNodeId ? nodeById.get(sourceNodeId) : null;
  const destNode = destinationNodeId ? nodeById.get(destinationNodeId) : null;

  function crowdColor(score: number): string {
    if (score < 0.33) return '#0f6b63';
    if (score < 0.66) return '#c47a12';
    return '#b42318';
  }

  const handlePlaceClick = useCallback(
    (id: string) => {
      if (followGps && sourceNodeId) {
        void startRoute(id);
        return;
      }
      if (!sourceNodeId) setSource(id);
      else if (!destinationNodeId) void startRoute(id);
      else {
        setSource(id);
        setDestination(null);
        setRoute(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- startRoute closes over latest source
    [followGps, sourceNodeId, destinationNodeId, setSource, setDestination],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="page-title">Campus map</h1>
          <p className="page-sub">
            {label} — gate to every block, with live GPS tracking.
            {live.connected ? ' · IoT live' : ' · IoT offline'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search
              className="pointer-events-none absolute left-3 top-3 text-ink-faint"
              size={16}
            />
            <input
              className="input pl-9"
              placeholder="Search Admin, ECE, Ground A…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="relative">
            <Filter
              className="pointer-events-none absolute left-3 top-3 text-ink-faint"
              size={16}
            />
            <select
              className="input appearance-none pl-9 pr-8"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">All</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className={`btn-ghost inline-flex items-center gap-2 ${followGps ? '!border-accent !text-accent' : ''}`}
            disabled={!pose && !watching}
            onClick={handleTrackMe}
          >
            <Navigation size={16} />
            {followGps ? 'Tracking' : 'Track me'}
          </button>
          <button
            type="button"
            className="btn-primary inline-flex items-center gap-2"
            disabled={!pose || placeNodes.length === 0}
            onClick={() => {
              if (!pose) return;
              const nearest = closestNamedPlace(pose, placeNodes);
              if (!nearest) {
                setGpsNote('No named places nearby yet — ask an admin to pin locations.');
                return;
              }
              setFollowGps(true);
              setRecenterAt(Date.now());
              void startRoute(nearest.node.id);
              setGpsNote(
                `Routing to closest place: ${nearest.node.name} (${Math.round(nearest.distanceM)} m)`,
              );
            }}
          >
            Route to closest place
          </button>
        </div>
      </div>

      {(gpsError || gpsNote || pose) && (
        <p className={`text-sm ${gpsError ? 'text-accent-warn' : 'text-ink-mute'}`}>
          {gpsError ??
            gpsNote ??
            (pose
              ? `GPS ${pose.latitude.toFixed(5)}, ${pose.longitude.toFixed(5)}${
                  pose.accuracy != null ? ` · ±${Math.round(pose.accuracy)} m` : ''
                }${pose.accuracy != null && pose.accuracy > 65 ? ' · waiting for precise fix' : ''}`
              : null)}
        </p>
      )}

      {results.length > 0 && (
        <div className="panel rounded-md p-3">
          <p className="mb-2 text-xs font-semibold text-ink-mute">Results</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {results.map((r) => (
              <button
                key={`${r.type}-${r.id}`}
                type="button"
                className="rounded-md border border-line bg-paper-soft p-3 text-left hover:border-accent/40"
                onClick={() => {
                  if (r.type === 'building') {
                    void startBuildingRoute(r.id);
                    return;
                  }
                  if (r.nodeId) void startRoute(r.nodeId);
                }}
              >
                <p className="font-semibold">{r.name}</p>
                <p className="text-xs text-ink-faint">
                  {r.code}
                  {r.buildingName ? ` · ${r.buildingName}` : ''} · {r.type}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {!hasPublishedMap && <EmptySiteNotice compact />}

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="relative overflow-hidden rounded-md border border-line">
          <BasemapModeSwitcher mode={basemapMode} onChange={setBasemapMode} />
          {useMapLibre ? (
            <CampusMapLibreMap
              className="h-[62vh] w-full"
              center={mapCenter}
              basemapMode={basemapMode}
              buildings={filteredBuildings}
              placeNodes={placeNodes}
              graphNodes={nodes}
              edges={edges}
              areas={areas}
              zones={zones}
              routePoints={routePoints}
              pose={pose}
              followGps={trackOnMap}
              recenterAt={recenterAt}
              sourceNodeId={sourceNodeId}
              destinationNodeId={destinationNodeId}
              onFollowBreak={() => setFollowGps(false)}
              onPlaceClick={handlePlaceClick}
              onBuildingClick={(id) => void startBuildingRoute(id)}
            />
          ) : useGoogle ? (
            <GoogleCampusMap
              className="h-[62vh] w-full"
              mode={basemapMode}
              center={mapCenter}
              placeNodes={placeNodes}
              sourceNodeId={sourceNodeId}
              destinationNodeId={destinationNodeId}
              routePoints={routePoints}
              pathLines={crowdPolylines.map((line) => ({
                id: line.id,
                positions: line.positions,
                color: crowdColor(line.crowdScore),
                weight: 4,
                opacity: 0.7,
              }))}
              zones={zones}
              pose={pose}
              followGps={trackOnMap}
              recenterAt={recenterAt}
              onFollowBreak={() => setFollowGps(false)}
              onPlaceClick={handlePlaceClick}
            />
          ) : (
            <MapContainer
              center={mapCenter}
              zoom={CAMPUS_DEFAULT_ZOOM}
              className="h-[62vh] w-full"
              scrollWheelZoom
              maxZoom={CAMPUS_MAX_ZOOM}
            >
              <RealBasemapTiles mode={basemapMode} />
              <RecenterOnSite center={mapCenter} enabled={!trackOnMap} />
              <BreakFollowOnInteract onBreak={() => setFollowGps(false)} />
              <FollowUser pose={pose} enabled={trackOnMap} recenterAt={recenterAt} />

              {/* Walk network */}
              {crowdPolylines.map((line) => (
                <Polyline
                  key={line.id}
                  positions={line.positions}
                  pathOptions={{
                    color: crowdColor(line.crowdScore),
                    weight: 4,
                    opacity: 0.75,
                  }}
                />
              ))}

              {/* Named campus places */}
              {placeNodes.map((node) => {
                const isSrc = node.id === sourceNodeId;
                const isDst = node.id === destinationNodeId;
                return (
                  <CircleMarker
                    key={node.id}
                    center={[node.latitude, node.longitude]}
                    radius={isSrc || isDst ? 9 : 6}
                    pathOptions={{
                      color: isSrc ? '#0f6b63' : isDst ? '#1a2228' : '#148a80',
                      fillColor: isSrc ? '#0f6b63' : isDst ? '#1a2228' : '#2aa89c',
                      fillOpacity: 0.9,
                      weight: 2,
                    }}
                    eventHandlers={{
                      click: () => handlePlaceClick(node.id),
                    }}
                  >
                    <Tooltip
                      direction="top"
                      offset={[0, -6]}
                      opacity={0.95}
                      permanent={
                        node.kind === 'entrance' ||
                        /Ground|Gate|Parking|Temple|Court|Corner|Gallery|Plaza|Junction|Auditorium|Admin|ECE|IT|Civil|Cyber|BCA|School|PUC|MBA|Mech|Jain/.test(
                          node.name ?? '',
                        )
                      }
                    >
                      <span className="font-semibold text-ink">{node.name ?? node.kind}</span>
                    </Tooltip>
                    <Popup>
                      <strong>{node.name}</strong>
                      <br />
                      <button type="button" onClick={() => void startRoute(node.id)}>
                        Route here
                      </button>
                    </Popup>
                  </CircleMarker>
                );
              })}

              {filteredBuildings.map((b) =>
                b.footprint && b.footprint.length >= 3 ? (
                  <Polygon
                    key={`b-${b.id}`}
                    positions={b.footprint.map((p) => [p.latitude, p.longitude] as [number, number])}
                    pathOptions={{
                      color: '#0f6b63',
                      fillColor: '#0f6b63',
                      fillOpacity: 0.25,
                      weight: 2,
                    }}
                  >
                    <Popup>
                      <strong>{b.name}</strong>
                      <br />
                      {b.code} · {b.floorsCount} floors
                      <br />
                      <button type="button" onClick={() => void startBuildingRoute(b.id)}>
                        Route to entrance
                      </button>
                    </Popup>
                  </Polygon>
                ) : (
                  <CircleMarker
                    key={`b-${b.id}`}
                    center={[b.latitude, b.longitude]}
                    radius={3}
                    pathOptions={{ color: '#ffffff', fillColor: '#0f6b63', fillOpacity: 0.35, weight: 1 }}
                  >
                    <Popup>
                      <strong>{b.name}</strong>
                      <br />
                      {b.code} · {b.floorsCount} floors
                      <br />
                      <button type="button" onClick={() => void startBuildingRoute(b.id)}>
                        Route to entrance
                      </button>
                    </Popup>
                  </CircleMarker>
                ),
              )}

              {zones.map((z) => (
                <Circle
                  key={z.id}
                  center={[z.latitude, z.longitude]}
                  radius={z.radiusM}
                  pathOptions={{
                    color:
                      z.type === 'construction' || z.type === 'fire'
                        ? '#c47a12'
                        : z.type === 'poor_lighting'
                          ? '#6b7c8a'
                          : '#b42318',
                    fillOpacity: 0.18,
                  }}
                >
                  <Popup>
                    {z.name} ({z.type})
                  </Popup>
                </Circle>
              ))}

              {pose && (
                <>
                  <UserLocationMarker pose={pose} />
                  <RecenterButton
                    lat={pose.latitude}
                    lon={pose.longitude}
                    onClick={handleTrackMe}
                  />
                </>
              )}

              {routePoints.length > 1 && (
                <>
                  <Polyline positions={routePoints} pathOptions={{ color: '#0f6b63', weight: 6 }} />
                  <FitBounds points={routePoints} enabled={!trackOnMap} />
                </>
              )}
            </MapContainer>
          )}
          {(useGoogle || useMapLibre) && pose && (
            <button
              type="button"
              className={`absolute bottom-4 right-4 z-[1000] inline-flex items-center gap-2 rounded-md border border-line bg-paper-raised px-3 py-2 text-sm font-semibold text-ink shadow-sm hover:border-accent ${
                followGps ? 'border-accent text-accent' : ''
              }`}
              onClick={handleTrackMe}
            >
              <LocateFixed size={16} className="text-accent" /> Track me
            </button>
          )}
          {!useGoogle && !useMapLibre && (
            <p className="pointer-events-none absolute bottom-3 left-3 z-[1000] max-w-xs rounded-md bg-ink/75 px-2 py-1 text-[10px] text-white/90">
              Real satellite + roads. Add VITE_GOOGLE_MAPS_API_KEY for Google Maps 3D tilt.
            </p>
          )}
        </div>

        <aside className="space-y-3">
          <div className="panel rounded-md p-4">
            <p className="label">Route</p>
            <p className="text-sm text-ink-mute">
              From:{' '}
              <span className="font-medium text-ink">{sourceNode?.name ?? '— (enable GPS or tap map)'}</span>
            </p>
            <p className="mt-1 text-sm text-ink-mute">
              To:{' '}
              <span className="font-medium text-ink">{destNode?.name ?? '—'}</span>
            </p>
            <label className="label mt-3">Go to</label>
            <select
              className="input"
              value={destinationNodeId ?? ''}
              onChange={(e) => {
                const id = e.target.value;
                if (id) void startRoute(id);
              }}
            >
              <option value="">Select destination…</option>
              {placeNodes
                .slice()
                .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
                .map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.name}
                  </option>
                ))}
            </select>
            {route && (
              <div className="mt-3 space-y-1 text-sm">
                <p>
                  Distance: <strong>{route.totalDistanceM} m</strong>
                </p>
                <p>
                  ETA: <strong>{route.etaMinutes} min</strong>
                </p>
                <button
                  className="btn-primary mt-3 w-full"
                  type="button"
                  onClick={() => navigate('/navigate')}
                >
                  Open navigation
                </button>
                <button
                  className="btn-ghost mt-2 w-full"
                  type="button"
                  onClick={() => navigate('/ar')}
                >
                  Start AR
                </button>
              </div>
            )}
          </div>

          <div className="panel rounded-md p-4">
            <p className="label">Campus places</p>
            <ul className="max-h-72 space-y-1.5 overflow-auto text-sm">
              {filteredBuildings
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((b) => (
                    <li key={b.id}>
                      <button
                        type="button"
                        className="w-full rounded-md border border-line bg-paper-soft px-2 py-1.5 text-left hover:border-accent/40"
                        onClick={() => {
                          void startBuildingRoute(b.id);
                        }}
                      >
                        <p className="font-medium">{b.name}</p>
                        <p className="text-xs text-ink-faint">{b.code}</p>
                      </button>
                    </li>
                  ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
