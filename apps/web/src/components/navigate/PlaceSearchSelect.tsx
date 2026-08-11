import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search, ChevronDown } from 'lucide-react';
import type { GraphNode } from '@campusar/shared';
import { formatNodeLabel } from '../../lib/geo';

interface PlaceSearchSelectProps {
  label: string;
  placeholder: string;
  emptyLabel: string;
  nodes: GraphNode[];
  value: string | null;
  onChange: (nodeId: string | null) => void;
  disabled?: boolean;
}

export function PlaceSearchSelect({
  label,
  placeholder,
  emptyLabel,
  nodes,
  value,
  onChange,
  disabled = false,
}: PlaceSearchSelectProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = useMemo(
    () => (value ? nodes.find((n) => n.id === value) : undefined),
    [nodes, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return nodes;
    return nodes.filter((n) => formatNodeLabel(n).toLowerCase().includes(q));
  }, [nodes, query]);

  useEffect(() => {
    if (!open) setQuery(selected ? formatNodeLabel(selected) : '');
  }, [open, selected]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function pick(id: string) {
    onChange(id);
    setOpen(false);
  }

  function clear() {
    onChange(null);
    setQuery('');
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <label className="label" htmlFor={`${listId}-input`}>
        {label}
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-3 text-ink-faint"
          size={16}
          aria-hidden
        />
        <input
          id={`${listId}-input`}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${listId}-listbox`}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
          placeholder={placeholder}
          className="input w-full pl-9 pr-9"
          value={open ? query : selected ? formatNodeLabel(selected) : query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
            if (e.key === 'Enter' && filtered[0]) pick(filtered[0].id);
          }}
        />
        <button
          type="button"
          className="absolute right-2 top-2 rounded p-1 text-ink-mute hover:bg-paper-soft"
          aria-label={`Open ${label} list`}
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronDown size={16} />
        </button>
      </div>

      {open && (
        <ul
          id={`${listId}-listbox`}
          role="listbox"
          className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border border-line bg-paper-raised py-1 shadow-lg"
        >
          <li role="option">
            <button
              type="button"
              className="w-full px-3 py-2 text-left text-sm text-ink-mute hover:bg-paper-soft"
              onClick={clear}
            >
              {emptyLabel}
            </button>
          </li>
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-sm text-ink-faint">No places match your search</li>
          )}
          {filtered.map((n) => (
            <li key={n.id} role="option" aria-selected={n.id === value}>
              <button
                type="button"
                className={`w-full px-3 py-2 text-left text-sm hover:bg-paper-soft ${
                  n.id === value ? 'bg-accent/10 font-semibold text-accent' : ''
                }`}
                onClick={() => pick(n.id)}
              >
                {formatNodeLabel(n)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
