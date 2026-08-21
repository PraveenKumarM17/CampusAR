import { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { Building, GraphEdge, GraphNode, SiteArea } from '@campusar/shared';
import { ApiError } from '../../lib/api';
import type { FeatureSelection } from './MapBuilderLayersPanel';

const AUTOSAVE_MS = 800;

const NODE_KINDS: GraphNode['kind'][] = [
  'outdoor',
  'indoor',
  'entrance',
  'exit',
  'elevator',
  'stairs',
  'ramp',
];

const AREA_TYPES: SiteArea['type'][] = ['parking', 'open_area', 'restricted', 'assembly'];

type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export type InspectorSaveConflict = {
  kind: 'building' | 'node' | 'edge' | 'area';
  id: string;
  localPatch: Record<string, unknown>;
  message: string;
};

type Props = {
  selection: FeatureSelection;
  buildings: Building[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  areas: SiteArea[];
  conflictFeatureId?: string | null;
  onAutosaveStatusChange?: (status: AutosaveStatus) => void;
  onConflict: (conflict: InspectorSaveConflict) => void;
  onSavedBuilding: (b: Building) => void;
  onSavedNode: (n: GraphNode) => void;
  onSavedEdge: (e: GraphEdge) => void;
  onSavedArea: (a: SiteArea) => void;
  onDelete: () => void;
  save: (args: {
    kind: 'building' | 'node' | 'edge' | 'area';
    id: string;
    patch: Record<string, unknown>;
  }) => Promise<Building | GraphNode | GraphEdge | SiteArea>;
};

export type { AutosaveStatus as InspectorAutosaveStatus };

export function MapBuilderInspectorPanel({
  selection,
  buildings,
  nodes,
  edges,
  areas,
  conflictFeatureId,
  onAutosaveStatusChange,
  onConflict,
  onSavedBuilding,
  onSavedNode,
  onSavedEdge,
  onSavedArea,
  onDelete,
  save,
}: Props) {
  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const saveGenRef = useRef(0);

  function setAutosave(next: AutosaveStatus) {
    setStatus(next);
    onAutosaveStatusChange?.(next);
  }

  const [buildingDraft, setBuildingDraft] = useState<{ name: string; code: string } | null>(null);
  const [nodeDraft, setNodeDraft] = useState<{
    name: string;
    kind: GraphNode['kind'];
    buildingId: string;
  } | null>(null);
  const [edgeDraft, setEdgeDraft] = useState<{
    distanceM: number;
    accessibilityScore: number;
    blocked: boolean;
  } | null>(null);
  const [areaDraft, setAreaDraft] = useState<{ name: string; type: SiteArea['type'] } | null>(null);

  const selectedBuilding =
    selection?.kind === 'building' ? buildings.find((b) => b.id === selection.id) : null;
  const selectedNode =
    selection?.kind === 'node' ? nodes.find((n) => n.id === selection.id) : null;
  const selectedEdge =
    selection?.kind === 'edge' ? edges.find((e) => e.id === selection.id) : null;
  const selectedArea =
    selection?.kind === 'area' ? areas.find((a) => a.id === selection.id) : null;

  const inConflict =
    Boolean(conflictFeatureId) &&
    selection != null &&
    'id' in selection &&
    selection.id === conflictFeatureId;

  useEffect(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setAutosave('idle');
    setError(null);
    if (selectedBuilding) {
      setBuildingDraft({ name: selectedBuilding.name, code: selectedBuilding.code });
      setNodeDraft(null);
      setEdgeDraft(null);
      setAreaDraft(null);
    } else if (selectedNode) {
      setNodeDraft({
        name: selectedNode.name ?? '',
        kind: selectedNode.kind,
        buildingId: selectedNode.buildingId ?? '',
      });
      setBuildingDraft(null);
      setEdgeDraft(null);
      setAreaDraft(null);
    } else if (selectedEdge) {
      setEdgeDraft({
        distanceM: selectedEdge.distanceM,
        accessibilityScore: selectedEdge.accessibilityScore,
        blocked: selectedEdge.blocked,
      });
      setBuildingDraft(null);
      setNodeDraft(null);
      setAreaDraft(null);
    } else if (selectedArea) {
      setAreaDraft({ name: selectedArea.name, type: selectedArea.type });
      setBuildingDraft(null);
      setNodeDraft(null);
      setEdgeDraft(null);
    } else {
      setBuildingDraft(null);
      setNodeDraft(null);
      setEdgeDraft(null);
      setAreaDraft(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset on selection identity
  }, [selection?.kind, selection && 'id' in selection ? selection.id : null]);

  useEffect(() => {
    if (inConflict) return;
    if (selectedBuilding) {
      setBuildingDraft({ name: selectedBuilding.name, code: selectedBuilding.code });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBuilding?.updatedAt, selectedBuilding?.name, selectedBuilding?.code, inConflict]);

  function scheduleSave(
    kind: 'building' | 'node' | 'edge' | 'area',
    id: string,
    patch: Record<string, unknown>,
  ) {
    if (inConflict) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setAutosave('pending');
    setError(null);
    const gen = ++saveGenRef.current;
    timerRef.current = window.setTimeout(() => {
      void (async () => {
        setAutosave('saving');
        try {
          const updated = await save({ kind, id, patch });
          if (gen !== saveGenRef.current) return;
          if (kind === 'building') onSavedBuilding(updated as Building);
          if (kind === 'node') onSavedNode(updated as GraphNode);
          if (kind === 'edge') onSavedEdge(updated as GraphEdge);
          if (kind === 'area') onSavedArea(updated as SiteArea);
          setAutosave('saved');
        } catch (err) {
          if (gen !== saveGenRef.current) return;
          setAutosave('error');
          if (err instanceof ApiError && err.status === 409) {
            onConflict({
              kind,
              id,
              localPatch: patch,
              message: err.message,
            });
            setError(null);
            return;
          }
          setError(err instanceof Error ? err.message : 'Save failed');
        }
      })();
    }, AUTOSAVE_MS);
  }

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    [],
  );

  if (!selection) {
    return (
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Inspector</p>
        <p className="mt-2 text-sm text-muted">Select a feature on the map or in Layers.</p>
      </div>
    );
  }

  const statusLabel =
    status === 'pending'
      ? 'Unsaved…'
      : status === 'saving'
        ? 'Saving…'
        : status === 'saved'
          ? 'Saved'
          : status === 'error'
            ? inConflict
              ? 'Conflict'
              : 'Save failed'
            : '';

  return (
    <div className={`space-y-3 ${inConflict ? 'rounded-md ring-2 ring-accent-danger/50 p-2' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Inspector</p>
        <span
          className={`text-[11px] font-semibold ${
            status === 'error' || inConflict ? 'text-accent-danger' : 'text-ink-faint'
          }`}
          data-autosave-status={inConflict ? 'conflict' : status}
        >
          {statusLabel}
        </span>
      </div>
      {error ? (
        <p className="rounded border border-accent-danger/40 bg-accent-danger/10 px-2 py-1 text-xs text-accent-danger">
          {error}
        </p>
      ) : null}
      {inConflict ? (
        <p className="text-[11px] font-semibold text-accent-danger">
          Resolve the conflict below before editing further.
        </p>
      ) : null}

      {selectedBuilding && buildingDraft ? (
        <div className="space-y-3">
          <p className="font-semibold text-ink">Building</p>
          <label className="block text-xs text-muted">
            Name
            <input
              className="input mt-1 w-full"
              value={buildingDraft.name}
              disabled={inConflict}
              onChange={(e) => {
                const name = e.target.value;
                setBuildingDraft((d) => (d ? { ...d, name } : d));
                scheduleSave('building', selectedBuilding.id, {
                  name,
                  code: buildingDraft.code,
                  expectedUpdatedAt: selectedBuilding.updatedAt,
                });
              }}
            />
          </label>
          <label className="block text-xs text-muted">
            Code
            <input
              className="input mt-1 w-full"
              value={buildingDraft.code}
              disabled={inConflict}
              onChange={(e) => {
                const code = e.target.value;
                setBuildingDraft((d) => (d ? { ...d, code } : d));
                scheduleSave('building', selectedBuilding.id, {
                  name: buildingDraft.name,
                  code,
                  expectedUpdatedAt: selectedBuilding.updatedAt,
                });
              }}
            />
          </label>
          <button
            type="button"
            className="btn-danger inline-flex w-full items-center justify-center gap-2"
            onClick={onDelete}
            disabled={inConflict}
          >
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        </div>
      ) : null}

      {selectedNode && nodeDraft ? (
        <div className="space-y-3">
          <p className="font-semibold text-ink">Node</p>
          <label className="block text-xs text-muted">
            Name
            <input
              className="input mt-1 w-full"
              value={nodeDraft.name}
              disabled={inConflict}
              onChange={(e) => {
                const name = e.target.value;
                setNodeDraft((d) => (d ? { ...d, name } : d));
                scheduleSave('node', selectedNode.id, {
                  name: name || null,
                  kind: nodeDraft.kind,
                  buildingId: nodeDraft.buildingId || null,
                });
              }}
            />
          </label>
          <label className="block text-xs text-muted">
            Kind
            <select
              className="input mt-1 w-full"
              value={nodeDraft.kind}
              disabled={inConflict}
              onChange={(e) => {
                const kind = e.target.value as GraphNode['kind'];
                setNodeDraft((d) => (d ? { ...d, kind } : d));
                scheduleSave('node', selectedNode.id, {
                  name: nodeDraft.name || null,
                  kind,
                  buildingId: nodeDraft.buildingId || null,
                });
              }}
            >
              {NODE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-muted">
            Building
            <select
              className="input mt-1 w-full"
              value={nodeDraft.buildingId}
              disabled={inConflict}
              onChange={(e) => {
                const buildingId = e.target.value;
                setNodeDraft((d) => (d ? { ...d, buildingId } : d));
                scheduleSave('node', selectedNode.id, {
                  name: nodeDraft.name || null,
                  kind: nodeDraft.kind,
                  buildingId: buildingId || null,
                });
              }}
            >
              <option value="">None</option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn-danger inline-flex w-full items-center justify-center gap-2"
            onClick={onDelete}
            disabled={inConflict}
          >
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        </div>
      ) : null}

      {selectedEdge && edgeDraft ? (
        <div className="space-y-3">
          <p className="font-semibold text-ink">Walkway</p>
          <label className="block text-xs text-muted">
            Distance (m)
            <input
              className="input mt-1 w-full"
              type="number"
              value={edgeDraft.distanceM}
              disabled={inConflict}
              onChange={(e) => {
                const distanceM = Number(e.target.value);
                setEdgeDraft((d) => (d ? { ...d, distanceM } : d));
                scheduleSave('edge', selectedEdge.id, {
                  distanceM,
                  accessibilityScore: edgeDraft.accessibilityScore,
                  blocked: edgeDraft.blocked,
                });
              }}
            />
          </label>
          <label className="block text-xs text-muted">
            Accessibility score
            <input
              className="input mt-1 w-full"
              type="number"
              value={edgeDraft.accessibilityScore}
              disabled={inConflict}
              onChange={(e) => {
                const accessibilityScore = Number(e.target.value);
                setEdgeDraft((d) => (d ? { ...d, accessibilityScore } : d));
                scheduleSave('edge', selectedEdge.id, {
                  distanceM: edgeDraft.distanceM,
                  accessibilityScore,
                  blocked: edgeDraft.blocked,
                });
              }}
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={edgeDraft.blocked}
              disabled={inConflict}
              onChange={(e) => {
                const blocked = e.target.checked;
                setEdgeDraft((d) => (d ? { ...d, blocked } : d));
                scheduleSave('edge', selectedEdge.id, {
                  distanceM: edgeDraft.distanceM,
                  accessibilityScore: edgeDraft.accessibilityScore,
                  blocked,
                });
              }}
            />
            Blocked
          </label>
          <button
            type="button"
            className="btn-danger inline-flex w-full items-center justify-center gap-2"
            onClick={onDelete}
            disabled={inConflict}
          >
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        </div>
      ) : null}

      {selectedArea && areaDraft ? (
        <div className="space-y-3">
          <p className="font-semibold text-ink">Area</p>
          <label className="block text-xs text-muted">
            Name
            <input
              className="input mt-1 w-full"
              value={areaDraft.name}
              disabled={inConflict}
              onChange={(e) => {
                const name = e.target.value;
                setAreaDraft((d) => (d ? { ...d, name } : d));
                scheduleSave('area', selectedArea.id, { name, type: areaDraft.type });
              }}
            />
          </label>
          <label className="block text-xs text-muted">
            Type
            <select
              className="input mt-1 w-full"
              value={areaDraft.type}
              disabled={inConflict}
              onChange={(e) => {
                const type = e.target.value as SiteArea['type'];
                setAreaDraft((d) => (d ? { ...d, type } : d));
                scheduleSave('area', selectedArea.id, { name: areaDraft.name, type });
              }}
            >
              {AREA_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn-danger inline-flex w-full items-center justify-center gap-2"
            onClick={onDelete}
            disabled={inConflict}
          >
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        </div>
      ) : null}
    </div>
  );
}
