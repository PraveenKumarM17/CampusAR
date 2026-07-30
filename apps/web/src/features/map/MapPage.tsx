import { useEffect, useMemo, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  Circle,
  Polyline,
  useMap,
} from 'react-leaflet';
import { Search, Filter } from 'lucide-react';
import type {
  Building,
  DangerZone,
  GraphNode,
  RouteResponse,
  SearchResult,
} from '@campusar/shared';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { useNavStore } from '../../stores/themeStore';
import { useNavigate } from 'react-router-dom';
import { useCampusLive } from '../../hooks/useCampusLive';

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) {
      map.fitBounds(points, { padding: [40, 40] });
    }
  }, [map, points]);
  return null;
}

export function MapPage() {
  const token = useAuthStore((s) => s.accessToken);
  const { sourceNodeId, destinationNodeId, setSource, setDestination } = useNavStore();
  const navigate = useNavigate();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [rooms, setRooms] = useState<{ buildingId: string; category: string }[]>([]);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [zones, setZones] = useState<DangerZone[]>([]);
  const [edges, setEdges] = useState<
    { id: string; crowdScore: number; fromNodeId: string; toNodeId: string }[]
  >([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const live = useCampusLive();

  useEffect(() => {
    Promise.all([
      api.buildings(token),
      api.rooms(token),
      api.nodes(token),
      api.edges(token),
      api.zones(),
      api.categories(),
    ]).then(([b, r, n, e, z, c]) => {
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
      setZones(z.filter((x) => x.active));
      setCategories(c);
    });
  }, [token]);

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
      api
        .search(query, token)
        .then(setResults)
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [query, token]);

  const filteredBuildings = useMemo(() => {
    if (!category) return buildings;
    const buildingIds = new Set(
      rooms.filter((r) => r.category === category).map((r) => r.buildingId),
    );
    return buildings.filter((b) => buildingIds.has(b.id));
  }, [buildings, rooms, category]);

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

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

  async function startRoute(destNodeId: string) {
    setDestination(destNodeId);
    if (!sourceNodeId) return;
    try {
      const r = await api.route(
        { sourceNodeId, destinationNodeId: destNodeId, usePrediction: true },
        token,
      );
      setRoute(r);
    } catch {
      setRoute(null);
    }
  }

  const routePoints = (route?.path ?? []).map((p) => [p.latitude, p.longitude] as [number, number]);

  function crowdColor(score: number): string {
    if (score < 0.33) return '#0f6b63';
    if (score < 0.66) return '#c47a12';
    return '#b42318';
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="page-title">Campus map</h1>
          <p className="page-sub">
            Search buildings, rooms, and plan a route.
            {live.connected ? ' · IoT live' : ' · IoT offline'}
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1 sm:w-72">
            <Search
              className="pointer-events-none absolute left-3 top-3 text-ink-faint"
              size={16}
            />
            <input
              className="input pl-9"
              placeholder="Search library, SCI-201..."
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
        </div>
      </div>

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

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="overflow-hidden rounded-md border border-line">
          <MapContainer
            center={[37.7748, -122.419]}
            zoom={17}
            className="h-[58vh] w-full"
            scrollWheelZoom
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            />
            {crowdPolylines.map((line) => (
              <Polyline
                key={line.id}
                positions={line.positions}
                pathOptions={{
                  color: crowdColor(line.crowdScore),
                  weight: 3,
                  opacity: 0.55,
                }}
              />
            ))}
            {filteredBuildings.map((b) => (
              <CircleMarker
                key={b.id}
                center={[b.latitude, b.longitude]}
                radius={10}
                pathOptions={{ color: '#0f6b63', fillColor: '#0f6b63', fillOpacity: 0.7 }}
              >
                <Popup>
                  <strong>{b.name}</strong>
                  <br />
                  {b.code} · {b.floorsCount} floors
                </Popup>
              </CircleMarker>
            ))}
            {nodes
              .filter((n) => n.kind === 'outdoor' || n.kind === 'entrance')
              .map((n) => (
                <CircleMarker
                  key={n.id}
                  center={[n.latitude, n.longitude]}
                  radius={5}
                  pathOptions={{
                    color: n.id === sourceNodeId ? '#0f6b63' : '#148a80',
                    fillOpacity: 0.8,
                  }}
                  eventHandlers={{
                    click: () => {
                      if (!sourceNodeId) setSource(n.id);
                      else if (!destinationNodeId) void startRoute(n.id);
                      else {
                        setSource(n.id);
                        setDestination(null);
                        setRoute(null);
                      }
                    },
                  }}
                >
                  <Popup>{n.name ?? n.kind}</Popup>
                </CircleMarker>
              ))}
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
                        ? '#a78bfa'
                        : '#b42318',
                  fillOpacity: 0.2,
                }}
              >
                <Popup>
                  {z.name} ({z.type})
                </Popup>
              </Circle>
            ))}
            {routePoints.length > 1 && (
              <>
                <Polyline positions={routePoints} pathOptions={{ color: '#0f6b63', weight: 5 }} />
                <FitBounds points={routePoints} />
              </>
            )}
          </MapContainer>
        </div>

        <aside className="space-y-3">
          <div className="panel rounded-md p-4">
            <p className="label">Route</p>
            <p className="text-sm text-ink-mute">
              Source:{' '}
              <span className="font-medium text-ink">{sourceNodeId?.slice(0, 8) ?? '—'}</span>
            </p>
            <p className="text-sm text-ink-mute">
              Destination:{' '}
              <span className="font-medium text-ink">{destinationNodeId?.slice(0, 8) ?? '—'}</span>
            </p>
            {route && (
              <div className="mt-3 space-y-1 text-sm">
                <p>
                  Distance: <strong>{route.totalDistanceM} m</strong>
                </p>
                <p>
                  ETA: <strong>{route.etaMinutes} min</strong>
                </p>
                {route.predictionUsed != null && (
                  <p className="text-xs text-ink-faint">
                    Prediction {route.predictionUsed ? 'on' : 'off'}
                  </p>
                )}
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
                <button
                  className="btn-ghost mt-2 w-full"
                  type="button"
                  onClick={() => navigate('/twin')}
                >
                  Digital Twin
                </button>
              </div>
            )}
          </div>
          <div className="panel rounded-md p-4">
            <p className="label">Buildings{category ? ` · ${category}` : ''}</p>
            <ul className="max-h-64 space-y-2 overflow-auto text-sm">
              {filteredBuildings.map((b) => (
                <li key={b.id} className="rounded-lg border border-line bg-paper-soft px-2 py-1.5">
                  <p className="font-medium">{b.name}</p>
                  <p className="text-xs text-ink-faint">{b.code}</p>
                </li>
              ))}
              {filteredBuildings.length === 0 && (
                <li className="text-xs text-ink-faint">No buildings match this category.</li>
              )}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
