import { useEffect, useMemo, useState } from 'react';
import { Building2, Layers, Search } from 'lucide-react';
import type { Floor, IndoorPlace, IndoorPlaceCategory } from '@campusar/shared';
import { api } from '../../lib/api';
import {
  filterPlacesForBuilding,
  formatPlaceHierarchy,
  loadBuildingContext,
  placeBelongsToBuilding,
  placeFloorLabel,
} from '../../lib/buildingNavigation';

const CATEGORY_LABELS: Record<IndoorPlaceCategory, string> = {
  building: 'Building',
  floor: 'Floors',
  room: 'Rooms',
  cabin: 'Cabins',
  person: 'People',
  cubicle: 'Cubicles',
  facility: 'Facilities',
  other: 'Other',
};

interface IndoorDestinationPickerProps {
  buildingId: string;
  buildingName: string;
  indoorMapId: string | null;
  token?: string | null;
  onSelect: (place: IndoorPlace, detail: string) => void;
  onDismiss: () => void;
}

export function IndoorDestinationPicker({
  buildingId,
  buildingName,
  indoorMapId,
  token,
  onSelect,
  onDismiss,
}: IndoorDestinationPickerProps) {
  const [query, setQuery] = useState('');
  const [catalog, setCatalog] = useState<IndoorPlace[]>([]);
  const [places, setPlaces] = useState<IndoorPlace[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [browseFloorId, setBrowseFloorId] = useState<string | null>(null);
  const [category, setCategory] = useState<IndoorPlaceCategory | ''>('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      loadBuildingContext(buildingId, (id) => api.indoorBuildingContext(id, token)),
      api.indoorPlaces(buildingId, token),
    ])
      .then(([ctx, list]) => {
        if (cancelled) return;
        setFloors(ctx.floors);
        const scoped = filterPlacesForBuilding(list, buildingId);
        setCatalog(scoped);
        setPlaces(scoped);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load indoor places.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [buildingId, token]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setPlaces(catalog);
      return;
    }
    const t = setTimeout(() => {
      setSearching(true);
      api
        .indoorSearchPlaces(q, buildingId, token)
        .then((res) => setPlaces(filterPlacesForBuilding(res, buildingId)))
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : 'Search failed.');
        })
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(t);
  }, [query, buildingId, token, catalog]);

  const categories = useMemo(() => {
    const set = new Set(places.map((p) => p.category));
    return [...set];
  }, [places]);

  const visible = useMemo(() => {
    return places.filter((p) => {
      if (!placeBelongsToBuilding(p, buildingId)) return false;
      if (browseFloorId && p.floorId !== browseFloorId) return false;
      if (category && p.category !== category) return false;
      return true;
    });
  }, [places, buildingId, browseFloorId, category]);

  const quick = useMemo(
    () =>
      places
        .filter(
          (p) =>
            p.category === 'room' ||
            p.category === 'facility' ||
            p.category === 'cabin' ||
            p.category === 'person',
        )
        .slice(0, 6),
    [places],
  );

  function choose(place: IndoorPlace) {
    if (!placeBelongsToBuilding(place, buildingId)) return;
    onSelect(place, formatPlaceHierarchy(place, places, floors));
  }

  return (
    <div
      className="fixed inset-0 z-[2100] flex items-end justify-center bg-ink/40 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="indoor-arrive-title"
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-md border border-line bg-paper-raised p-4 shadow-lg"
        data-indoor-map-id={indoorMapId ?? undefined}
      >
        <p id="indoor-arrive-title" className="inline-flex items-center gap-2 text-lg font-semibold">
          <Building2 size={20} className="text-accent" />
          You have arrived at {buildingName}
        </p>
        <p className="mt-1 text-sm text-ink-mute">Where would you like to go?</p>

        <label className="label mt-4" htmlFor="indoor-dest-search">
          Search inside {buildingName}
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-3 text-ink-faint" size={16} />
          <input
            id="indoor-dest-search"
            className="input pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Room 308, Teacher X, Computer Lab…"
          />
        </div>

        {loading && <p className="mt-3 text-sm text-ink-mute">Loading indoor places…</p>}
        {searching && !loading && <p className="mt-3 text-sm text-ink-mute">Searching…</p>}
        {error && <p className="mt-3 text-sm text-accent-danger">{error}</p>}

        {!loading && !error && query.trim() === '' && quick.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Quick places</p>
            <ul className="mt-2 space-y-1">
              {quick.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="w-full rounded-md border border-line bg-paper-soft px-3 py-2 text-left text-sm hover:border-accent/40"
                    onClick={() => choose(p)}
                  >
                    {p.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={`btn-ghost inline-flex items-center gap-1 !py-1.5 text-xs ${
              browseFloorId ? '!border-accent !text-accent' : ''
            }`}
            onClick={() => setBrowseFloorId((id) => (id ? null : floors[0]?.id ?? null))}
          >
            <Layers size={14} /> Browse floors
          </button>
          {browseFloorId &&
            floors.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`rounded-md border px-2 py-1 text-xs ${
                  browseFloorId === f.id
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-line text-ink-mute'
                }`}
                onClick={() => setBrowseFloorId(f.id)}
              >
                {f.name}
              </button>
            ))}
        </div>

        {categories.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-1">
            <button
              type="button"
              className={`rounded-md px-2 py-1 text-xs ${!category ? 'bg-accent/10 font-semibold text-accent' : 'text-ink-mute'}`}
              onClick={() => setCategory('')}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                className={`rounded-md px-2 py-1 text-xs ${
                  category === c ? 'bg-accent/10 font-semibold text-accent' : 'text-ink-mute'
                }`}
                onClick={() => setCategory(c)}
              >
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
        )}

        <ul className="mt-3 max-h-56 divide-y divide-line overflow-auto rounded-md border border-line">
          {!loading && visible.length === 0 && (
            <li className="px-3 py-4 text-sm text-ink-faint">
              No indoor places match that search in {buildingName}.
            </li>
          )}
          {visible.map((p) => {
            const hierarchy = formatPlaceHierarchy(p, places, floors);
            const floor = placeFloorLabel(p, floors);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left hover:bg-paper-soft"
                  onClick={() => choose(p)}
                >
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-ink-faint">
                    {buildingName}
                    {floor ? ` · ${floor}` : ''}
                    {hierarchy ? ` · ${hierarchy}` : ''}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>

        <button className="btn-ghost mt-4 w-full" type="button" onClick={onDismiss}>
          I&apos;ll choose later
        </button>
      </div>
    </div>
  );
}
