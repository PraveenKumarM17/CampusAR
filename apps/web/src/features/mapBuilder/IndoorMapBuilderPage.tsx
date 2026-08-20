import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import {
  Building2,
  DoorOpen,
  Layers,
  MapPin,
  MousePointer2,
  Route,
  Save,
  Shapes,
  Trash2,
} from 'lucide-react';
import type {
  Building,
  Floor,
  FloorPoiCategory,
  IndoorFloorLayoutSnapshot,
  IndoorLayoutValidationResult,
  LocalVec2,
  RoomCategory,
} from '@campusar/shared';
import { FLOOR_PLAN_COORDINATE_SYSTEM } from '@campusar/shared';
import { api, ApiError } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { useActiveSite } from '../../hooks/useActiveSite';
import { useMapEditorAccess } from '../../hooks/useMapEditorAccess';
import { useSiteStore } from '../../stores/siteStore';
import { EmptySiteNotice } from '../../components/EmptySiteNotice';
import { UnsavedChangesDialog } from './UnsavedChangesDialog';
import { MapBuilderNav } from './MapBuilderNav';
import { FloorCanvas } from './FloorCanvas';
import {
  cloneRing,
  ringsEqual,
  type IndoorTool,
  type LayoutEditSession,
  type UnsavedChoice,
} from './indoorLayoutUtils';

const TOOLS: { id: IndoorTool; label: string; icon: typeof MousePointer2 }[] = [
  { id: 'select', label: 'Select', icon: MousePointer2 },
  { id: 'room', label: 'Room', icon: Shapes },
  { id: 'corridor', label: 'Corridor', icon: Route },
  { id: 'poi', label: 'POI', icon: MapPin },
];

const ROOM_CATEGORIES: RoomCategory[] = [
  'office',
  'classroom',
  'lab',
  'ward',
  'meeting_room',
  'storage',
  'restroom',
  'other',
];

const POI_CATEGORIES: FloorPoiCategory[] = [
  'reception',
  'restroom',
  'elevator',
  'stairs',
  'information',
  'waiting',
  'other',
];

export function IndoorMapBuilderPage() {
  const { buildingId: routeBuildingId } = useParams<{ buildingId?: string }>();
  const token = useAuthStore((s) => s.accessToken);
  const { canEdit, loading: accessLoading } = useMapEditorAccess();
  const { label } = useActiveSite();
  const sites = useSiteStore((s) => s.sites);

  const [buildings, setBuildings] = useState<Building[]>([]);
  const [buildingId, setBuildingId] = useState<string | null>(routeBuildingId ?? null);
  const [snapshot, setSnapshot] = useState<IndoorFloorLayoutSnapshot | null>(null);
  const [selectedFloorId, setSelectedFloorId] = useState<string | null>(null);
  const [tool, setTool] = useState<IndoorTool>('select');
  const [selectedKind, setSelectedKind] = useState<'room' | 'corridor' | 'poi' | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftRect, setDraftRect] = useState<LocalVec2[] | null>(null);
  const [pendingTool, setPendingTool] = useState<IndoorTool | null>(null);
  const [editSession, setEditSession] = useState<LayoutEditSession | null>(null);
  const [validation, setValidation] = useState<IndoorLayoutValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const dirtyRef = useRef(false);
  const [unsavedDialog, setUnsavedDialog] = useState<{
    title: string;
    message: string;
    onResolve: (choice: UnsavedChoice) => void;
  } | null>(null);

  const hasUnsavedEdit =
    editSession !== null && !ringsEqual(editSession.originalGeometry, editSession.draftGeometry);
  const hasUnsaved = dirtyRef.current || hasUnsavedEdit || Boolean(draftRect?.length);

  const buildingName = useMemo(() => {
    const b = buildings.find((x) => x.id === buildingId);
    return b?.name ?? buildingId;
  }, [buildings, buildingId]);

  const floorRooms = useMemo(
    () => (snapshot?.rooms ?? []).filter((r) => r.floorId === selectedFloorId),
    [snapshot, selectedFloorId],
  );
  const floorCorridors = useMemo(
    () => (snapshot?.corridors ?? []).filter((c) => c.floorId === selectedFloorId),
    [snapshot, selectedFloorId],
  );
  const floorPois = useMemo(
    () => (snapshot?.pois ?? []).filter((p) => p.floorId === selectedFloorId),
    [snapshot, selectedFloorId],
  );

  const requestUnsavedChoice = useCallback(
    (title: string, message: string): Promise<UnsavedChoice> =>
      new Promise((resolve) => {
        if (!hasUnsaved) {
          resolve('discard');
          return;
        }
        setUnsavedDialog({
          title,
          message,
          onResolve: (choice) => {
            setUnsavedDialog(null);
            resolve(choice);
          },
        });
      }),
    [hasUnsaved],
  );

  const reloadBuildings = useCallback(async () => {
    if (!token) return;
    const snap = await api.mapBuilder.snapshot(token);
    setBuildings(snap.buildings);
  }, [token]);

  const reloadSnapshot = useCallback(async () => {
    if (!token || !buildingId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.mapBuilder.indoorSnapshot(buildingId, token);
      setSnapshot(data);
      setSelectedFloorId((prev) => prev ?? data.floors[0]?.id ?? null);
      dirtyRef.current = false;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load indoor layout');
    } finally {
      setLoading(false);
    }
  }, [token, buildingId]);

  useEffect(() => {
    if (!token || !canEdit) return;
    reloadBuildings().catch(() => undefined);
  }, [token, canEdit, reloadBuildings]);

  useEffect(() => {
    if (routeBuildingId) setBuildingId(routeBuildingId);
  }, [routeBuildingId]);

  useEffect(() => {
    if (buildingId) reloadSnapshot().catch(() => undefined);
  }, [buildingId, reloadSnapshot]);

  const saveGeometryEdit = useCallback(async () => {
    if (!token || !editSession) return false;
    try {
      if (editSession.kind === 'room') {
        await api.mapBuilder.updateRoom(
          editSession.id,
          {
            localGeometry: editSession.draftGeometry,
            expectedUpdatedAt: editSession.expectedUpdatedAt,
          },
          token,
        );
      } else {
        await api.mapBuilder.updateCorridor(
          editSession.id,
          {
            localGeometry: editSession.draftGeometry,
            expectedUpdatedAt: editSession.expectedUpdatedAt,
          },
          token,
        );
      }
      setEditSession(null);
      await reloadSnapshot();
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
      return false;
    }
  }, [token, editSession, reloadSnapshot]);

  const cancelGeometryEdit = () => {
    setEditSession(null);
    setDraftRect(null);
  };

  async function guardNavigation(action: () => void) {
    const choice = await requestUnsavedChoice('Unsaved indoor edits', 'Save layout changes before leaving?');
    if (choice === 'stay') return;
    if (choice === 'save') {
      const ok = await saveGeometryEdit();
      if (!ok) return;
    }
    cancelGeometryEdit();
    setDraftRect(null);
    dirtyRef.current = false;
    action();
  }

  async function createFloor(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token || !buildingId) return;
    const fd = new FormData(e.currentTarget);
    try {
      await api.mapBuilder.createFloor(
        {
          buildingId,
          level: Number(fd.get('level')),
          name: String(fd.get('name')),
        },
        token,
      );
      e.currentTarget.reset();
      await reloadSnapshot();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create floor');
    }
  }

  async function saveDraftShape(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token || !buildingId || !selectedFloorId || !draftRect?.length) return;
    const fd = new FormData(e.currentTarget);
    const shapeTool = pendingTool ?? tool;
    try {
      if (shapeTool === 'room') {
        await api.mapBuilder.createRoom(
          {
            buildingId,
            floorId: selectedFloorId,
            name: String(fd.get('name')),
            code: String(fd.get('code')),
            category: String(fd.get('category')) as RoomCategory,
            localGeometry: draftRect,
          },
          token,
        );
      } else {
        await api.mapBuilder.createCorridor(
          {
            buildingId,
            floorId: selectedFloorId,
            name: String(fd.get('name') || '') || null,
            localGeometry: draftRect,
          },
          token,
        );
      }
      setDraftRect(null);
      setPendingTool(null);
      setTool('select');
      await reloadSnapshot();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
    }
  }

  async function savePoi(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token || !buildingId || !selectedFloorId) return;
    const fd = new FormData(e.currentTarget);
    try {
      await api.mapBuilder.createPoi(
        {
          buildingId,
          floorId: selectedFloorId,
          name: String(fd.get('name')),
          category: String(fd.get('category')) as FloorPoiCategory,
          localX: Number(fd.get('localX')),
          localY: Number(fd.get('localY')),
        },
        token,
      );
      e.currentTarget.reset();
      await reloadSnapshot();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save POI');
    }
  }

  async function deleteSelected() {
    if (!token || !selectedId || !selectedKind) return;
    if (!window.confirm('Delete this item?')) return;
    try {
      if (selectedKind === 'room') await api.mapBuilder.deleteRoom(selectedId, token);
      else if (selectedKind === 'corridor') await api.mapBuilder.deleteCorridor(selectedId, token);
      else await api.mapBuilder.deletePoi(selectedId, token);
      setSelectedId(null);
      setSelectedKind(null);
      await reloadSnapshot();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Delete failed');
    }
  }

  async function runValidation() {
    if (!token || !buildingId) return;
    setValidation(await api.mapBuilder.indoorValidate(buildingId, token));
  }

  if (accessLoading) return <p className="p-6 text-muted">Checking editor access…</p>;
  if (!canEdit) return <Navigate to="/map" replace />;
  if (sites.length === 0) return <EmptySiteNotice />;

  if (!buildingId) {
    return (
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="page-title">Indoor Map Builder</h1>
            <p className="page-sub">Select a building to manage floors and floor plans. Site: {label}</p>
          </div>
          <MapBuilderNav mode="indoor" />
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {buildings.map((b) => (
            <Link
              key={b.id}
              to={`/admin/map-builder/indoor/${b.id}`}
              className="rounded-lg border border-line bg-paper-raised p-4 hover:border-accent"
            >
              <Building2 className="mb-2 h-5 w-5 text-accent" />
              <p className="font-semibold text-ink">{b.name}</p>
              <p className="text-sm text-muted">{b.code}</p>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  const selectedRoom = floorRooms.find((r) => r.id === selectedId);
  const selectedCorridor = floorCorridors.find((c) => c.id === selectedId);
  const selectedPoi = floorPois.find((p) => p.id === selectedId);
  const shapeTool = pendingTool ?? tool;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="page-title">Indoor Map Builder</h1>
          <p className="text-sm text-muted">
            {buildingName} · {FLOOR_PLAN_COORDINATE_SYSTEM} · {label}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MapBuilderNav mode="indoor" />
          <button type="button" className="btn-secondary text-sm" onClick={() => void runValidation()}>
            Validate
          </button>
          <Link to="/admin/map-builder/indoor" className="btn-secondary text-sm">
            Change building
          </Link>
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      )}

      <div className="flex min-h-0 flex-1 gap-3">
        <aside className="w-56 shrink-0 space-y-3 overflow-y-auto rounded-lg border border-line bg-paper-raised p-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Layers className="h-4 w-4" /> Floors
          </h2>
          <ul className="space-y-1">
            {(snapshot?.floors ?? []).map((f: Floor) => (
              <li key={f.id}>
                <button
                  type="button"
                  className={`w-full rounded-md px-2 py-1.5 text-left text-sm ${
                    selectedFloorId === f.id ? 'bg-accent/15 font-semibold text-accent' : 'hover:bg-paper'
                  }`}
                  onClick={() =>
                    void guardNavigation(() => {
                      setSelectedFloorId(f.id);
                      setSelectedId(null);
                    })
                  }
                >
                  {f.level}: {f.name}
                </button>
              </li>
            ))}
          </ul>
          <form className="space-y-2 border-t border-line pt-3" onSubmit={(e) => void createFloor(e)}>
            <p className="text-xs font-semibold text-muted">Add floor</p>
            <input name="level" type="number" className="input w-full text-sm" placeholder="Level" required />
            <input name="name" className="input w-full text-sm" placeholder="Display name" required />
            <button type="submit" className="btn-primary w-full text-sm">
              Create floor
            </button>
          </form>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap gap-1">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-sm ${
                  tool === t.id ? 'bg-accent text-white' : 'border border-line bg-paper-raised'
                }`}
                onClick={() => {
                  setTool(t.id);
                  if (t.id === 'room' || t.id === 'corridor') setPendingTool(t.id);
                }}
              >
                <t.icon className="h-3.5 w-3.5" /> {t.label}
              </button>
            ))}
          </div>
          {selectedFloorId ? (
            <FloorCanvas
              tool={tool}
              rooms={floorRooms}
              corridors={floorCorridors}
              pois={floorPois}
              selectedId={selectedId}
              selectedKind={selectedKind}
              draftRect={editSession?.draftGeometry ?? draftRect}
              onDraftRect={(ring) => {
                if (editSession) setEditSession({ ...editSession, draftGeometry: ring ?? [] });
                else setDraftRect(ring);
              }}
              onSelect={(kind, id) => {
                setSelectedKind(kind);
                setSelectedId(id);
              }}
              onClearSelect={() => {
                setSelectedKind(null);
                setSelectedId(null);
              }}
              onPoiPlace={(pt) => {
                const form = document.getElementById('poi-form') as HTMLFormElement | null;
                if (form) {
                  (form.elements.namedItem('localX') as HTMLInputElement).value = String(pt.x);
                  (form.elements.namedItem('localY') as HTMLInputElement).value = String(pt.y);
                }
              }}
            />
          ) : (
            <p className="flex flex-1 items-center justify-center text-muted">
              {loading ? 'Loading…' : 'Create or select a floor to edit the layout.'}
            </p>
          )}
        </div>

        <aside className="w-72 shrink-0 space-y-3 overflow-y-auto rounded-lg border border-line bg-paper-raised p-3">
          {draftRect && draftRect.length >= 3 && !editSession && (
            <form className="space-y-2" onSubmit={(e) => void saveDraftShape(e)}>
              <h3 className="text-sm font-semibold">Save new {shapeTool}</h3>
              {shapeTool === 'room' && (
                <>
                  <input name="name" className="input w-full text-sm" placeholder="Room name" required />
                  <input name="code" className="input w-full text-sm" placeholder="Code" required />
                  <select name="category" className="input w-full text-sm" defaultValue="office">
                    {ROOM_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </>
              )}
              {shapeTool === 'corridor' && (
                <input name="name" className="input w-full text-sm" placeholder="Corridor name (optional)" />
              )}
              <div className="flex gap-2">
                <button type="submit" className="btn-primary flex-1 text-sm">
                  <Save className="mr-1 inline h-3.5 w-3.5" /> Save
                </button>
                <button type="button" className="btn-secondary text-sm" onClick={() => setDraftRect(null)}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          {editSession && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Edit geometry</h3>
              <button type="button" className="btn-primary w-full text-sm" onClick={() => void saveGeometryEdit()}>
                Save geometry
              </button>
              <button type="button" className="btn-secondary w-full text-sm" onClick={cancelGeometryEdit}>
                Cancel
              </button>
            </div>
          )}

          {selectedRoom && (
            <div className="space-y-2 border-t border-line pt-2">
              <h3 className="text-sm font-semibold">{selectedRoom.name}</h3>
              <p className="text-xs text-muted">
                {selectedRoom.code} · {selectedRoom.category}
              </p>
              <button
                type="button"
                className="btn-secondary w-full text-sm"
                onClick={() => {
                  if (!selectedRoom.localGeometry) return;
                  setEditSession({
                    kind: 'room',
                    id: selectedRoom.id,
                    originalGeometry: cloneRing(selectedRoom.localGeometry),
                    draftGeometry: cloneRing(selectedRoom.localGeometry),
                    expectedUpdatedAt: selectedRoom.updatedAt,
                  });
                  setDraftRect(null);
                }}
              >
                Edit geometry
              </button>
              <button type="button" className="btn-danger w-full text-sm" onClick={() => void deleteSelected()}>
                <Trash2 className="mr-1 inline h-3.5 w-3.5" /> Delete
              </button>
            </div>
          )}

          {selectedCorridor && (
            <div className="space-y-2 border-t border-line pt-2">
              <h3 className="text-sm font-semibold">{selectedCorridor.name ?? 'Corridor'}</h3>
              <button type="button" className="btn-danger w-full text-sm" onClick={() => void deleteSelected()}>
                Delete corridor
              </button>
            </div>
          )}

          {selectedPoi && (
            <div className="space-y-2 border-t border-line pt-2">
              <h3 className="text-sm font-semibold">{selectedPoi.name}</h3>
              <p className="text-xs text-muted">{selectedPoi.category}</p>
              <button type="button" className="btn-danger w-full text-sm" onClick={() => void deleteSelected()}>
                Delete POI
              </button>
            </div>
          )}

          <form id="poi-form" className="space-y-2 border-t border-line pt-2" onSubmit={(e) => void savePoi(e)}>
            <h3 className="flex items-center gap-1 text-sm font-semibold">
              <DoorOpen className="h-4 w-4" /> Add POI
            </h3>
            <input name="name" className="input w-full text-sm" placeholder="Name" required />
            <select name="category" className="input w-full text-sm" defaultValue="other">
              {POI_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input name="localX" type="number" step="0.1" className="input w-full text-sm" placeholder="X (m)" required />
            <input name="localY" type="number" step="0.1" className="input w-full text-sm" placeholder="Y (m)" required />
            <button type="submit" className="btn-primary w-full text-sm">
              Save POI
            </button>
          </form>

          {validation && (
            <div className="border-t border-line pt-2 text-xs">
              <p className="font-semibold">
                Validation: {validation.errorCount} errors, {validation.warningCount} warnings
              </p>
              <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto text-muted">
                {[...validation.errors, ...validation.warnings].map((v, i) => (
                  <li key={i}>{v.message}</li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      <UnsavedChangesDialog
        open={unsavedDialog !== null}
        title={unsavedDialog?.title ?? ''}
        message={unsavedDialog?.message ?? ''}
        onStay={() => unsavedDialog?.onResolve('stay')}
        onDiscard={() => unsavedDialog?.onResolve('discard')}
        onSave={() => void saveGeometryEdit().then((ok) => unsavedDialog?.onResolve(ok ? 'save' : 'stay'))}
      />
    </div>
  );
}
