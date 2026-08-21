import { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { Building } from '@campusar/shared';

export type PaletteAction = {
  id: string;
  label: string;
  keywords?: string;
  disabled?: boolean;
  hint?: string;
  run: () => void;
};

type Props = {
  open: boolean;
  onClose: () => void;
  buildings: Building[];
  onGoToBuilding: (b: Building) => void;
  actions: PaletteAction[];
};

function score(query: string, label: string, keywords = ''): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const hay = `${label} ${keywords}`.toLowerCase();
  if (hay.startsWith(q)) return 100;
  if (hay.includes(q)) return 50;
  const parts = q.split(/\s+/);
  if (parts.every((p) => hay.includes(p))) return 25;
  return 0;
}

export function MapBuilderCommandPalette({
  open,
  onClose,
  buildings,
  onGoToBuilding,
  actions,
}: Props) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActive(0);
    }
  }, [open]);

  const items = useMemo(() => {
    const base = actions.map((a) => ({
      id: a.id,
      label: a.label,
      disabled: a.disabled,
      hint: a.hint,
      score: score(query, a.label, a.keywords),
      run: a.run,
    }));
    const buildingItems = buildings.map((b) => ({
      id: `building:${b.id}`,
      label: `Go to building… ${b.name}`,
      disabled: false,
      hint: b.code,
      score: score(query, `go to building ${b.name} ${b.code}`, b.name),
      run: () => {
        onGoToBuilding(b);
        onClose();
      },
    }));
    return [...base, ...buildingItems]
      .filter((i) => i.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);
  }, [actions, buildings, onClose, onGoToBuilding, query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[4000] flex items-start justify-center bg-black/40 p-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      data-command-palette
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-lg border border-line bg-paper-raised shadow-xl">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <Search className="h-4 w-4 text-ink-mute" />
          <input
            autoFocus
            className="input flex-1 !border-0 !bg-transparent !px-0 !shadow-none"
            placeholder="Type a command or building name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, items.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                const item = items[active];
                if (item && !item.disabled) item.run();
              }
            }}
          />
          <button type="button" className="btn-ghost !p-1" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <ul className="max-h-80 overflow-y-auto py-1">
          {items.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">No matches</li>
          ) : (
            items.map((item, i) => (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={item.disabled}
                  title={item.hint}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${
                    i === active ? 'bg-accent/15 text-accent' : 'text-ink hover:bg-paper-soft'
                  } ${item.disabled ? 'opacity-50' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => {
                    if (!item.disabled) item.run();
                  }}
                >
                  <span>{item.label}</span>
                  {item.hint ? <span className="text-[11px] text-ink-faint">{item.hint}</span> : null}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
