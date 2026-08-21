import { Trash2, Tags } from 'lucide-react';
import type { GraphNode } from '@campusar/shared';

type Props = {
  count: number;
  canChangeKind: boolean;
  busy?: boolean;
  onDelete: () => void;
  onChangeKind: (kind: GraphNode['kind']) => void;
};

const KINDS: GraphNode['kind'][] = [
  'outdoor',
  'indoor',
  'entrance',
  'exit',
  'elevator',
  'stairs',
  'ramp',
];

export function MapBuilderBulkBar({
  count,
  canChangeKind,
  busy,
  onDelete,
  onChangeKind,
}: Props) {
  if (count < 2) return null;
  return (
    <div
      className="pointer-events-auto absolute bottom-14 left-1/2 z-[1100] flex -translate-x-1/2 flex-wrap items-center gap-2 rounded-md border border-line bg-paper-raised px-3 py-2 shadow-md"
      data-bulk-bar
    >
      <span className="text-xs font-semibold text-ink">{count} selected</span>
      <button
        type="button"
        className="btn-danger inline-flex items-center gap-1 !py-1.5 text-xs"
        disabled={busy}
        onClick={onDelete}
      >
        <Trash2 className="h-3.5 w-3.5" /> Delete Selected
      </button>
      {canChangeKind ? (
        <label className="inline-flex items-center gap-1 text-xs text-muted">
          <Tags className="h-3.5 w-3.5" />
          <select
            className="input !py-1 text-xs"
            disabled={busy}
            defaultValue=""
            onChange={(e) => {
              const v = e.target.value as GraphNode['kind'];
              if (v) onChangeKind(v);
              e.target.value = '';
            }}
          >
            <option value="" disabled>
              Change category…
            </option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}
