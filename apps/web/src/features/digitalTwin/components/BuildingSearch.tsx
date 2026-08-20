import { SEARCH_KIND_LABEL } from '../adapters/searchAdapter';
import type { TwinSearchHit } from '../types/digitalTwin';

interface BuildingSearchProps {
  totalCount: number;
  query: string;
  onQueryChange: (value: string) => void;
  results: TwinSearchHit[];
  onPick: (hit: TwinSearchHit) => void;
}

export function BuildingSearch({
  totalCount,
  query,
  onQueryChange,
  results,
  onPick,
}: BuildingSearchProps) {
  return (
    <div className="relative min-w-0 flex-1">
      <label className="label" htmlFor="twin-building-search">
        Search campus
      </label>
      <input
        id="twin-building-search"
        className="input"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Building, POI, or parking"
        autoComplete="off"
      />
      {query.trim() && (
        <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto border border-line bg-paper-raised shadow-lg">
          {results.length === 0 && (
            <li className="px-3 py-2 text-sm text-ink-mute">No matches</li>
          )}
          {results.map((hit) => (
            <li key={`${hit.type}-${hit.id}`}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-paper-soft"
                onClick={() => onPick(hit)}
              >
                <span>
                  <span className="font-medium">{hit.name}</span>
                  {hit.subtitle && <span className="ml-2 text-ink-faint">{hit.subtitle}</span>}
                </span>
                <span className="shrink-0 text-[11px] uppercase tracking-wide text-ink-mute">
                  {SEARCH_KIND_LABEL[hit.type]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-xs text-ink-faint">{totalCount} searchable objects</p>
    </div>
  );
}
