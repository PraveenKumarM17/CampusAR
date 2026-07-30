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
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [zones, setZones] = useState<DangerZone[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [route, setRoute] = useState<RouteResponse | null>(null);

  useEffect(() => {
    Promise.all([api.buildings(token), api.nodes(token), api.zones(), api.categories()]).then(
      ([b, n, z, c]) => {
        setBuildings(b);
        setNodes(n);
        setZones(z.filter((x) => x.active));
        setCategories(c);
      },
    );
  }, [token]);

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
    return buildings;
  }, [buildings, category]);

  async function startRoute(destNodeId: string) {
    setDestination(destNodeId);
    if (!sourceNodeId) return;
    try {
      const r = await api.route({ sourceNodeId, destinationNodeId: destNodeId }, token);
      setRoute(r);
    } catch {
      setRoute(null);
    }
  }

  const routePoints = (route?.path ?? []).map((p) => [p.latitude, p.longitude] as [number, number]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Campus map</h1>
          <p className="text-sm text-white/60">Search buildings, rooms, and plan a route.</p>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1 sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-3 text-white/40" size={16} />
            <input
              className="input pl-9"
              placeholder="Search library, SCI-201..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="relative">
            <Filter className="pointer-events-none absolute left-3 top-3 text-white/40" size={16} />
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
        <div className="glass rounded-2xl p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">
            Results
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {results.map((r) => (
              <button
                key={`${r.type}-${r.id}`}
                type="button"
                className="rounded-xl border border-white/10 bg-black/20 p-3 text-left hover:border-accent/40"
                onClick={() => {
                  if (r.nodeId) void startRoute(r.nodeId);
                }}
              >
                <p className="font-semibold">{r.name}</p>
                <p className="text-xs text-white/50">
                  {r.code}
                  {r.buildingName ? ` · ${r.buildingName}` : ''} · {r.type}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="overflow-hidden rounded-3xl border border-white/10 shadow-glass">
          <MapContainer
            center={[37.7748, -122.419]}
            zoom={17}
            className="h-[58vh] w-full"
            scrollWheelZoom
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />
            {filteredBuildings.map((b) => (
              <CircleMarker
                key={b.id}
                center={[b.latitude, b.longitude]}
                radius={10}
                pathOptions={{ color: '#3d9bfd', fillColor: '#3d9bfd', fillOpacity: 0.7 }}
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
                    color: n.id === sourceNodeId ? '#3ddeb5' : '#7ec0ff',
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
                    z.type === 'construction'
                      ? '#f0a35e'
                      : z.type === 'poor_lighting'
                        ? '#a78bfa'
                        : '#f07178',
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
                <Polyline positions={routePoints} pathOptions={{ color: '#3ddeb5', weight: 5 }} />
                <FitBounds points={routePoints} />
              </>
            )}
          </MapContainer>
        </div>

        <aside className="space-y-3">
          <div className="glass rounded-2xl p-4">
            <p className="label">Route</p>
            <p className="text-sm text-white/70">
              Source: <span className="text-white">{sourceNodeId?.slice(0, 8) ?? '—'}</span>
            </p>
            <p className="text-sm text-white/70">
              Destination:{' '}
              <span className="text-white">{destinationNodeId?.slice(0, 8) ?? '—'}</span>
            </p>
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
          <div className="glass rounded-2xl p-4">
            <p className="label">Buildings</p>
            <ul className="max-h-64 space-y-2 overflow-auto text-sm">
              {buildings.map((b) => (
                <li key={b.id} className="rounded-lg border border-white/5 bg-black/10 px-2 py-1.5">
                  <p className="font-medium">{b.name}</p>
                  <p className="text-xs text-white/45">{b.code}</p>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
