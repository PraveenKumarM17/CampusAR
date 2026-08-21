import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Layers } from 'lucide-react';
import type { Building, GraphEdge, GraphNode, SiteArea } from '@campusar/shared';

export type LayerGroupKey = 'buildings' | 'nodes' | 'edges' | 'areas';

export type LayerVisibility = Record<LayerGroupKey, boolean>;

export const DEFAULT_LAYER_VISIBILITY: LayerVisibility = {
  buildings: true,
  nodes: true,
  edges: true,
  areas: true,
};

export type FeatureSelection =
  | { kind: 'building'; id: string }
  | { kind: 'node'; id: string }
  | { kind: 'edge'; id: string }
  | { kind: 'area'; id: string }
  | null;

type Props = {
  buildings: Building[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  areas: SiteArea[];
  visibility: LayerVisibility;
  onVisibilityChange: (next: LayerVisibility) => void;
  selection: FeatureSelection;
  onSelect: (next: FeatureSelection) => void;
};

type GroupState = Record<LayerGroupKey, { open: boolean; query: string }>;

function matchesQuery(label: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return label.toLowerCase().includes(q);
}

function edgeLabel(edge: GraphEdge, nodes: GraphNode[]): string {
  const from = nodes.find((n) => n.id === edge.fromNodeId);
  const to = nodes.find((n) => n.id === edge.toNodeId);
  const a = from?.name || from?.kind || edge.fromNodeId.slice(0, 6);
  const b = to?.name || to?.kind || edge.toNodeId.slice(0, 6);
  return `${a} → ${b}${edge.blocked ? ' (blocked)' : ''}`;
}

export function MapBuilderLayersPanel({
  buildings,
  nodes,
  edges,
  areas,
  visibility,
  onVisibilityChange,
  selection,
  onSelect,
}: Props) {
  const [groupState, setGroupState] = useState<GroupState>({
    buildings: { open: true, query: '' },
    nodes: { open: true, query: '' },
    edges: { open: false, query: '' },
    areas: { open: false, query: '' },
  });

  const filtered = useMemo(
    () => ({
      buildings: buildings.filter((b) =>
        matchesQuery(`${b.name} ${b.code}`, groupState.buildings.query),
      ),
      nodes: nodes.filter((n) =>
        matchesQuery(`${n.name ?? ''} ${n.kind}`, groupState.nodes.query),
      ),
      edges: edges.filter((e) => matchesQuery(edgeLabel(e, nodes), groupState.edges.query)),
      areas: areas.filter((a) => matchesQuery(`${a.name} ${a.type}`, groupState.areas.query)),
    }),
    [buildings, nodes, edges, areas, groupState],
  );

  function toggleOpen(key: LayerGroupKey) {
    setGroupState((s) => ({ ...s, [key]: { ...s[key], open: !s[key].open } }));
  }

  function setQuery(key: LayerGroupKey, query: string) {
    setGroupState((s) => ({ ...s, [key]: { ...s[key], query } }));
  }

  function renderGroup(
    key: LayerGroupKey,
    title: string,
    total: number,
    rows: { id: string; label: string; sub?: string }[],
    kind: NonNullable<FeatureSelection>['kind'],
  ) {
    const state = groupState[key];
    return (
      <div className="border-b border-line last:border-b-0">
        <div className="flex items-center gap-1 px-1 py-1.5">
          <button
            type="button"
            className="rounded p-0.5 text-ink-mute hover:bg-paper-raised"
            aria-label={state.open ? `Collapse ${title}` : `Expand ${title}`}
            onClick={() => toggleOpen(key)}
          >
            {state.open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          <label className="flex flex-1 cursor-pointer items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
            <input
              type="checkbox"
              checked={visibility[key]}
              onChange={(e) => onVisibilityChange({ ...visibility, [key]: e.target.checked })}
              aria-label={`Toggle ${title} visibility`}
            />
            <Layers className="h-3 w-3" />
            {title} ({total})
          </label>
        </div>
        {state.open ? (
          <div className="space-y-1 pb-2 pl-6 pr-1">
            <input
              className="input w-full !py-1 text-xs"
              placeholder={`Search ${title.toLowerCase()}…`}
              value={state.query}
              onChange={(e) => setQuery(key, e.target.value)}
            />
            <ul className="max-h-40 space-y-0.5 overflow-y-auto" data-layer-group={key}>
              {rows.length === 0 ? (
                <li className="px-2 py-1 text-xs text-ink-faint">No matches</li>
              ) : (
                rows.map((row) => {
                  const active = selection?.kind === kind && selection.id === row.id;
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        data-feature-id={row.id}
                        data-feature-kind={kind}
                        className={`w-full rounded px-2 py-1.5 text-left text-xs ${
                          active
                            ? 'bg-accent/15 font-semibold text-accent'
                            : 'text-ink hover:bg-paper-raised'
                        }`}
                        onClick={() => onSelect({ kind, id: row.id })}
                      >
                        <span className="block truncate">{row.label}</span>
                        {row.sub ? (
                          <span className="block truncate text-[10px] text-ink-faint">{row.sub}</span>
                        ) : null}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
        Layers &amp; Features
      </p>
      <div className="rounded-md border border-line bg-paper-raised/40">
        {renderGroup(
          'buildings',
          'Buildings',
          buildings.length,
          filtered.buildings.map((b) => ({ id: b.id, label: b.name, sub: b.code })),
          'building',
        )}
        {renderGroup(
          'nodes',
          'Nodes',
          nodes.length,
          filtered.nodes.map((n) => ({
            id: n.id,
            label: n.name?.trim() || `(unnamed ${n.kind})`,
            sub: n.kind,
          })),
          'node',
        )}
        {renderGroup(
          'edges',
          'Edges',
          edges.length,
          filtered.edges.map((e) => ({
            id: e.id,
            label: edgeLabel(e, nodes),
            sub: `${Math.round(e.distanceM)} m · ${e.kind}`,
          })),
          'edge',
        )}
        {renderGroup(
          'areas',
          'Areas',
          areas.length,
          filtered.areas.map((a) => ({ id: a.id, label: a.name, sub: a.type })),
          'area',
        )}
      </div>
    </div>
  );
}
