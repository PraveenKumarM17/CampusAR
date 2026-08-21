import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  Building2,
  CircleDot,
  DoorOpen,
  GitBranch,
  Layers,
  Link2,
  MapPin,
  MousePointer2,
  Ruler,
  Route,
  Save,
  Shapes,
  Trash2,
  ArrowUpDown,
  Camera,
} from 'lucide-react';
import type {
  Building,
  Floor,
  FloorPoiCategory,
  IndoorGraphEditorSnapshot,
  IndoorLayoutValidationResult,
  IndoorNodeKind,
  LocalVec2,
  RoomCategory,
} from '@campusar/shared';
import { DEFAULT_FLOOR_HEIGHT_M, FLOOR_PLAN_COORDINATE_SYSTEM } from '@campusar/shared';
import { api, ApiError } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { useActiveSite } from '../../hooks/useActiveSite';
import { useMapEditorAccess } from '../../hooks/useMapEditorAccess';
import { useSiteStore } from '../../stores/siteStore';
import { EmptySiteNotice } from '../../components/EmptySiteNotice';
import { UnsavedChangesDialog } from './UnsavedChangesDialog';
import { MapBuilderNav } from './MapBuilderNav';
import { FloorCanvas } from './FloorCanvas';
import { IndoorArMeasurePanel } from './IndoorArMeasurePanel';
import {
  cloneRing,
  ringsEqual,
  type IndoorTool,
  type LayoutEditSession,
  type UnsavedChoice,
} from './indoorLayoutUtils';
import {
  floorElevationM,
  formatMeasureDistance,
  geometryFromMeasurePoints,
  measuredRoomExtents,
  polylineLength2D,
} from './indoorArMeasure';

const LAYOUT_TOOLS: { id: IndoorTool; label: string; icon: typeof MousePointer2 }[] = [
  { id: 'select', label: 'Select', icon: MousePointer2 },
  { id: 'measure', label: 'Measure', icon: Ruler },
  { id: 'room', label: 'Room', icon: Shapes },
  { id: 'corridor', label: 'Corridor', icon: Route },
  { id: 'poi', label: 'POI', icon: MapPin },
];

const GRAPH_TOOLS: { id: IndoorTool; label: string; icon: typeof MousePointer2; nodeKind?: IndoorNodeKind }[] = [
  { id: 'node', label: 'Nav node', icon: CircleDot, nodeKind: 'corridor' },
  { id: 'connect', label: 'Connect', icon: GitBranch },
  { id: 'entrance', label: 'Entrance', icon: DoorOpen, nodeKind: 'entrance' },
  { id: 'room_entrance', label: 'Room link', icon: Link2, nodeKind: 'room_entrance' },
  { id: 'stairs', label: 'Stairs', icon: ArrowUpDown, nodeKind: 'stairs' },
  { id: 'elevator', label: 'Elevator', icon: Layers, nodeKind: 'elevator' },
  { id: 'handoff', label: 'Handoff', icon: Link2 },
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
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.accessToken);
  const { canEdit, loading: accessLoading } = useMapEditorAccess();
  const { label, activeSiteId } = useActiveSite();
  const sites = useSiteStore((s) => s.sites);

  const [buildings, setBuildings] = useState<Building[]>([]);
  const [buildingsReady, setBuildingsReady] = useState(false);
  const [buildingId, setBuildingId] = useState<string | null>(routeBuildingId ?? null);
  const [snapshot, setSnapshot] = useState<IndoorGraphEditorSnapshot | null>(null);
  const [selectedFloorId, setSelectedFloorId] = useState<string | null>(null);
  const [tool, setTool] = useState<IndoorTool>('select');
  const [selectedKind, setSelectedKind] = useState<'room' | 'corridor' | 'poi' | 'node' | 'edge' | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [anchorCode, setAnchorCode] = useState('');
  const [connectFromId, setConnectFromId] = useState<string | null>(null);
  const [pendingHandoffOutdoorId, setPendingHandoffOutdoorId] = useState<string | null>(null);
  const [draftRect, setDraftRect] = useState<LocalVec2[] | null>(null);
  const [measurePoints, setMeasurePoints] = useState<LocalVec2[]>([]);
  const [measureSaveAs, setMeasureSaveAs] = useState<'room' | 'corridor'>('room');
  const [measurementSource, setMeasurementSource] = useState<
    'camera_ar' | 'floor_plan' | 'manual'
  >('floor_plan');
  const [measuredHeightM, setMeasuredHeightM] = useState<number | null>(null);
  const [arPanelOpen, setArPanelOpen] = useState(false);
  const [floorHeightM, setFloorHeightM] = useState(DEFAULT_FLOOR_HEIGHT_M);
  const [floorHeightBusy, setFloorHeightBusy] = useState(false);
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
  const hasUnsaved =
    dirtyRef.current || hasUnsavedEdit || Boolean(draftRect?.length) || measurePoints.length > 0;

  const buildingName = useMemo(() => {
    const b = buildings.find((x) => x.id === buildingId);
    return b?.name ?? buildingId;
  }, [buildings, buildingId]);

  const activeBuilding = useMemo(
    () => buildings.find((x) => x.id === buildingId) ?? null,
    [buildings, buildingId],
  );

  useEffect(() => {
    if (activeBuilding?.floorHeightM) setFloorHeightM(activeBuilding.floorHeightM);
    else setFloorHeightM(DEFAULT_FLOOR_HEIGHT_M);
  }, [activeBuilding?.id, activeBuilding?.floorHeightM]);

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
  const floorNodes = useMemo(
    () => (snapshot?.nodes ?? []).filter((n) => n.floorId === selectedFloorId && n.active),
    [snapshot, selectedFloorId],
  );
  const floorEdges = useMemo(() => {
    const ids = new Set(floorNodes.map((n) => n.id));
    return (snapshot?.edges ?? []).filter(
      (e) => e.active && ids.has(e.fromNodeId) && ids.has(e.toNodeId),
    );
  }, [snapshot, floorNodes]);

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
    setBuildingsReady(true);
  }, [token]);

  const reloadSnapshot = useCallback(async () => {
    if (!token || !buildingId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.mapBuilder.indoorGraphSnapshot(buildingId, token);
      setSnapshot(data);
      setSelectedFloorId((prev) => prev ?? data.floors[0]?.id ?? null);
      dirtyRef.current = false;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError('That building is not in the current site map. Choose one from the list.');
        navigate('/admin/map-builder/indoor', { replace: true });
        return;
      }
      setError(err instanceof ApiError ? err.message : 'Failed to load indoor layout');
    } finally {
      setLoading(false);
    }
  }, [token, buildingId, navigate]);

  useEffect(() => {
    if (accessLoading || !canEdit || !token || !activeSiteId) {
      setBuildingsReady(false);
      return;
    }
    reloadBuildings().catch(() => {
      setBuildings([]);
      setBuildingsReady(true);
    });
  }, [accessLoading, canEdit, token, activeSiteId, reloadBuildings]);

  useEffect(() => {
    setBuildingId(routeBuildingId ?? null);
  }, [routeBuildingId]);

  useEffect(() => {
    if (accessLoading || !canEdit || !buildingsReady || !buildingId) return;
    if (!buildings.some((b) => b.id === buildingId)) {
      setError('That building is not in the current site map. Choose one from the list.');
      navigate('/admin/map-builder/indoor', { replace: true });
      return;
    }
    reloadSnapshot().catch(() => undefined);
  }, [accessLoading, canEdit, buildingsReady, buildingId, buildings, reloadSnapshot, navigate]);

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
    setMeasurePoints([]);
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

  async function saveFloorHeight(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token || !buildingId || !activeBuilding) return;
    setFloorHeightBusy(true);
    setError(null);
    try {
      const updated = await api.mapBuilder.updateBuilding(
        buildingId,
        { floorHeightM, expectedUpdatedAt: activeBuilding.updatedAt },
        token,
      );
      setBuildings((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
      setFloorHeightM(updated.floorHeightM ?? DEFAULT_FLOOR_HEIGHT_M);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save floor height');
    } finally {
      setFloorHeightBusy(false);
    }
  }

  function applyMeasureToDraft() {
    const ring = geometryFromMeasurePoints(measurePoints);
    if (!ring.length) {
      setError('Need at least 2 measure points with 0.25 m minimum span.');
      return;
    }
    setDraftRect(ring);
    if (measurementSource !== 'camera_ar') setMeasurementSource('floor_plan');
    setPendingTool(measureSaveAs);
    setTool(measureSaveAs);
    setMeasurePoints([]);
    setError(null);
  }

  function applyArMeasurePoints(
    planPoints: LocalVec2[],
    measurement: { source: 'camera_ar'; heightM?: number },
  ) {
    setMeasurePoints(planPoints);
    setMeasurementSource(measurement.source);
    setMeasuredHeightM(measurement.heightM ?? null);
    setTool('measure');
    setArPanelOpen(false);
  }

  async function saveDraftShape(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token || !buildingId || !selectedFloorId || !draftRect?.length) return;
    const fd = new FormData(e.currentTarget);
    const shapeTool = pendingTool ?? tool;
    try {
      if (shapeTool === 'room') {
        const extents = measuredRoomExtents(draftRect);
        await api.mapBuilder.createRoom(
          {
            buildingId,
            floorId: selectedFloorId,
            name: String(fd.get('name')),
            code: String(fd.get('code')),
            category: String(fd.get('category')) as RoomCategory,
            localGeometry: draftRect,
            measuredLengthM: extents?.lengthM,
            measuredWidthM: extents?.widthM,
            measuredHeightM: measuredHeightM ?? floorHeightM,
            measurementSource,
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
      setMeasurementSource('floor_plan');
      setMeasuredHeightM(null);
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

  async function ensureGraphMap() {
    if (!token || !buildingId) return null;
    if (snapshot?.editMapId) return snapshot.editMapId;
    const map = await api.mapBuilder.ensureIndoorGraphMap(buildingId, token);
    return map.id;
  }

  async function createAnchorForSelectedNode() {
    if (!token || !selectedNode || !snapshot?.editMapId) return;
    const code = anchorCode.trim().toUpperCase();
    if (code.length < 3) {
      setError('Enter a QR/anchor code with at least 3 characters.');
      return;
    }
    try {
      await api.mapBuilder.createIndoorAnchor(
        {
          mapId: snapshot.editMapId,
          nodeId: selectedNode.id,
          floorId: selectedNode.floorId,
          anchorCode: code,
          physicalMarkerType: 'qr',
          localX: selectedNode.localX,
          localY: selectedNode.localY,
          localZ: selectedNode.localZ,
        },
        token,
      );
      setAnchorCode('');
      await reloadSnapshot();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create QR anchor');
    }
  }

  async function handleGraphPoint(pt: LocalVec2) {
    if (!token || !buildingId || !selectedFloorId) return;
    const mapId = await ensureGraphMap();
    if (!mapId) return;
    try {
      if (tool === 'connect') return;
      if (tool === 'handoff') return;
      const graphTool = GRAPH_TOOLS.find((t) => t.id === tool);
      const kind = graphTool?.nodeKind ?? 'corridor';
      await api.mapBuilder.createIndoorGraphNode(
        {
          buildingId,
          floorId: selectedFloorId,
          planX: pt.x,
          planY: pt.y,
          mapId,
          kind,
        },
        token,
      );
      await reloadSnapshot();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create navigation node');
    }
  }

  async function handleNodeSelect(nodeId: string) {
    if (tool === 'connect') {
      if (!connectFromId) {
        setConnectFromId(nodeId);
        setSelectedKind('node');
        setSelectedId(nodeId);
        return;
      }
      if (connectFromId === nodeId) {
        setConnectFromId(null);
        return;
      }
      if (!token || !buildingId) return;
      try {
        const fromNode = snapshot?.nodes.find((n) => n.id === connectFromId);
        const toNode = snapshot?.nodes.find((n) => n.id === nodeId);
        const crossFloor = fromNode && toNode && fromNode.floorId !== toNode.floorId;
        let kind: 'walk' | 'stairs' | 'elevator' | 'ramp' = 'walk';
        if (crossFloor) {
          const connectorKinds = new Set(['stairs', 'elevator', 'ramp']);
          if (connectorKinds.has(fromNode.kind)) kind = fromNode.kind as typeof kind;
          else if (connectorKinds.has(toNode.kind)) kind = toNode.kind as typeof kind;
          else kind = 'elevator';
        }
        await api.mapBuilder.createIndoorGraphEdge(
          {
            buildingId,
            fromNodeId: connectFromId,
            toNodeId: nodeId,
            mapId: snapshot?.editMapId ?? undefined,
            kind,
            wheelchairAccessible: kind === 'walk' || kind === 'elevator' || kind === 'ramp',
          },
          token,
        );
        setConnectFromId(null);
        await reloadSnapshot();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not connect nodes');
      }
      return;
    }
    if (tool === 'handoff' && pendingHandoffOutdoorId) {
      if (!token || !buildingId) return;
      try {
        await api.mapBuilder.createIndoorHandoff(
          {
            buildingId,
            outdoorNodeId: pendingHandoffOutdoorId,
            indoorNodeId: nodeId,
            mapId: snapshot?.editMapId ?? undefined,
          },
          token,
        );
        setPendingHandoffOutdoorId(null);
        setTool('select');
        await reloadSnapshot();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not create handoff');
      }
      return;
    }
    setSelectedKind('node');
    setSelectedId(nodeId);
  }

  async function handleNodeDragEnd(nodeId: string, pt: LocalVec2) {
    if (!token) return;
    try {
      await api.mapBuilder.moveIndoorGraphNode(nodeId, { planX: pt.x, planY: pt.y }, token);
      await reloadSnapshot();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not move node');
    }
  }

  async function linkSelectedRoom() {
    if (!token || !buildingId || selectedKind !== 'room' || !selectedId) return;
    try {
      await api.mapBuilder.linkRoomToGraph(
        { buildingId, roomId: selectedId, mapId: snapshot?.editMapId ?? undefined, createEntrance: true },
        token,
      );
      await reloadSnapshot();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not link room');
    }
  }

  async function unlinkSelectedRoom() {
    if (!token || !buildingId || selectedKind !== 'room' || !selectedId) return;
    try {
      await api.mapBuilder.unlinkRoomFromGraph(
        buildingId,
        selectedId,
        snapshot?.editMapId ?? undefined,
        token,
      );
      await reloadSnapshot();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not unlink room');
    }
  }

  async function deleteSelected() {
    if (!token || !selectedId || !selectedKind) return;
    if (!window.confirm('Delete this item?')) return;
    try {
      if (selectedKind === 'room') await api.mapBuilder.deleteRoom(selectedId, token);
      else if (selectedKind === 'corridor') await api.mapBuilder.deleteCorridor(selectedId, token);
      else if (selectedKind === 'poi') await api.mapBuilder.deletePoi(selectedId, token);
      else if (selectedKind === 'node') await api.mapBuilder.deleteIndoorGraphNode(selectedId, token);
      else if (selectedKind === 'edge') await api.mapBuilder.deleteIndoorGraphEdge(selectedId, token);
      setSelectedId(null);
      setSelectedKind(null);
      setConnectFromId(null);
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
        {error && (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">{error}</p>
        )}
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
  const selectedNode = floorNodes.find((n) => n.id === selectedId);
  const selectedEdge = floorEdges.find((e) => e.id === selectedId);
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
                  <span className="block text-[10px] font-normal text-muted">
                    elev. {formatMeasureDistance(floorElevationM(f.level, floorHeightM))}
                  </span>
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

          <form className="space-y-2 border-t border-line pt-3" onSubmit={(e) => void saveFloorHeight(e)}>
            <p className="text-xs font-semibold text-muted">Floor height factor (m)</p>
            <p className="text-[11px] text-muted">
              Elevation = level × height. Level 2 at 3.5 m → {formatMeasureDistance(floorElevationM(2, floorHeightM))}.
            </p>
            <input
              type="number"
              step="0.1"
              min="2"
              max="20"
              className="input w-full text-sm"
              value={floorHeightM}
              onChange={(e) => setFloorHeightM(Number(e.target.value))}
              required
            />
            <button type="submit" className="btn-secondary w-full text-sm" disabled={floorHeightBusy}>
              {floorHeightBusy ? 'Saving…' : 'Save height factor'}
            </button>
          </form>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap gap-1">
            {LAYOUT_TOOLS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-sm ${
                  tool === t.id ? 'bg-accent text-white' : 'border border-line bg-paper-raised'
                }`}
                onClick={() => {
                  setTool(t.id);
                  if (t.id === 'room' || t.id === 'corridor') setPendingTool(t.id);
                  if (t.id !== 'measure') setMeasurePoints([]);
                  setConnectFromId(null);
                  setPendingHandoffOutdoorId(null);
                }}
              >
                <t.icon className="h-3.5 w-3.5" /> {t.label}
              </button>
            ))}
            <button
              type="button"
              className="flex items-center gap-1 rounded-md border border-line bg-paper-raised px-2 py-1 text-sm"
              onClick={() => setArPanelOpen(true)}
            >
              <Camera className="h-3.5 w-3.5" /> AR Measure
            </button>
          </div>
          <div className="flex flex-wrap gap-1 border-t border-line pt-2">
            <span className="self-center text-xs font-semibold text-muted">Graph</span>
            {GRAPH_TOOLS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-sm ${
                  tool === t.id ? 'bg-violet-600 text-white' : 'border border-line bg-paper-raised'
                }`}
                onClick={() => {
                  setTool(t.id);
                  setConnectFromId(null);
                  setPendingHandoffOutdoorId(null);
                }}
              >
                <t.icon className="h-3.5 w-3.5" /> {t.label}
              </button>
            ))}
          </div>
          {tool === 'measure' && (
            <p className="text-xs text-emerald-700">
              Tap floor-plan corners to measure. Segment distances use AR-Measure vector math (
              {measurePoints.length > 1
                ? `total ${formatMeasureDistance(polylineLength2D(measurePoints))}`
                : '2+ points'}
              ).
            </p>
          )}
          {connectFromId && (
            <p className="text-xs text-violet-700">Connect: select the second node to link.</p>
          )}
          {pendingHandoffOutdoorId && (
            <p className="text-xs text-violet-700">Handoff: select the indoor entrance node.</p>
          )}
          {selectedFloorId ? (
            <FloorCanvas
              tool={tool}
              rooms={floorRooms}
              corridors={floorCorridors}
              pois={floorPois}
              nodes={floorNodes}
              edges={floorEdges}
              connectFromId={connectFromId}
              roomLinks={snapshot?.roomLinks}
              selectedId={selectedId}
              selectedKind={selectedKind}
              draftRect={editSession?.draftGeometry ?? draftRect}
              measurePoints={tool === 'measure' ? measurePoints : []}
              onDraftRect={(ring) => {
                if (editSession) setEditSession({ ...editSession, draftGeometry: ring ?? [] });
                else setDraftRect(ring);
              }}
              onMeasurePoint={(pt) => setMeasurePoints((prev) => [...prev, pt])}
              onSelect={(kind, id) => {
                if (kind === 'node') void handleNodeSelect(id);
                else {
                  setSelectedKind(kind);
                  setSelectedId(id);
                }
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
              onGraphPoint={(pt) => void handleGraphPoint(pt)}
              onNodeDragEnd={(nodeId, pt) => void handleNodeDragEnd(nodeId, pt)}
            />
          ) : (
            <p className="flex flex-1 items-center justify-center text-muted">
              {loading ? 'Loading…' : 'Create or select a floor to edit the layout.'}
            </p>
          )}
        </div>

        <aside className="w-72 shrink-0 space-y-3 overflow-y-auto rounded-lg border border-line bg-paper-raised p-3">
          {tool === 'measure' && measurePoints.length > 0 && !draftRect?.length && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Measured shape</h3>
              <p className="text-xs text-muted">
                {measurePoints.length} point(s) ·{' '}
                {measurePoints.length > 1
                  ? formatMeasureDistance(polylineLength2D(measurePoints))
                  : 'add another point'}
              </p>
              <select
                className="input w-full text-sm"
                value={measureSaveAs}
                onChange={(e) => setMeasureSaveAs(e.target.value as 'room' | 'corridor')}
              >
                <option value="room">Save as room</option>
                <option value="corridor">Save as corridor</option>
              </select>
              <div className="flex gap-2">
                <button type="button" className="btn-primary flex-1 text-sm" onClick={applyMeasureToDraft}>
                  Build &amp; save…
                </button>
                <button type="button" className="btn-secondary text-sm" onClick={() => setMeasurePoints([])}>
                  Clear
                </button>
              </div>
            </div>
          )}

          {draftRect && draftRect.length >= 3 && !editSession && (
            <form className="space-y-2" onSubmit={(e) => void saveDraftShape(e)}>
              <h3 className="text-sm font-semibold">Save new {shapeTool}</h3>
              {shapeTool === 'room' && (
                <>
                  {(() => {
                    const extents = measuredRoomExtents(draftRect);
                    return extents ? (
                      <div className="rounded-md border border-line bg-paper-soft p-2 text-xs text-muted">
                        <p className="font-semibold text-ink">Measured dimensions</p>
                        <p>
                          {formatMeasureDistance(extents.lengthM)} ×{' '}
                          {formatMeasureDistance(extents.widthM)} ×{' '}
                          {formatMeasureDistance(measuredHeightM ?? floorHeightM)} high
                        </p>
                        <p className="mt-1">Source: {measurementSource.replace('_', ' ')}</p>
                      </div>
                    ) : null;
                  })()}
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
                {snapshot?.roomLinks[selectedRoom.id] ? ' · linked' : ''}
              </p>
              {selectedRoom.measuredLengthM && selectedRoom.measuredWidthM && (
                <p className="rounded-md bg-paper-soft p-2 text-xs text-muted">
                  {formatMeasureDistance(selectedRoom.measuredLengthM)} ×{' '}
                  {formatMeasureDistance(selectedRoom.measuredWidthM)}
                  {selectedRoom.measuredHeightM
                    ? ` × ${formatMeasureDistance(selectedRoom.measuredHeightM)} high`
                    : ''}
                  {selectedRoom.measurementSource
                    ? ` · ${selectedRoom.measurementSource.replace('_', ' ')}`
                    : ''}
                </p>
              )}
              <button
                type="button"
                className="btn-secondary w-full text-sm"
                onClick={() => void linkSelectedRoom()}
              >
                Link to navigation
              </button>
              {snapshot?.roomLinks[selectedRoom.id] && (
                <button type="button" className="btn-secondary w-full text-sm" onClick={() => void unlinkSelectedRoom()}>
                  Unlink navigation
                </button>
              )}
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

          {selectedNode && (
            <div className="space-y-2 border-t border-line pt-2">
              <h3 className="text-sm font-semibold">{selectedNode.name ?? 'Navigation node'}</h3>
              <p className="text-xs text-muted">{selectedNode.kind}</p>
              {snapshot?.anchors.some((anchor) => anchor.nodeId === selectedNode.id) ? (
                <div className="rounded-md border border-line bg-paper-soft p-2 text-xs">
                  <p className="font-semibold text-ink">QR anchors</p>
                  {snapshot.anchors
                    .filter((anchor) => anchor.nodeId === selectedNode.id)
                    .map((anchor) => (
                      <code key={anchor.id} className="mt-1 block break-all text-accent">
                        {anchor.anchorCode}
                      </code>
                    ))}
                </div>
              ) : (
                <div className="space-y-2 rounded-md border border-line bg-paper-soft p-2">
                  <label className="text-xs font-semibold text-muted" htmlFor="indoor-anchor-code">
                    QR marker code
                  </label>
                  <input
                    id="indoor-anchor-code"
                    className="input w-full text-sm uppercase"
                    value={anchorCode}
                    onChange={(event) => setAnchorCode(event.target.value)}
                    placeholder="IT-GF-ENTRANCE-01"
                  />
                  <button
                    type="button"
                    className="btn-secondary w-full text-sm"
                    disabled={!snapshot?.editMapId}
                    onClick={() => void createAnchorForSelectedNode()}
                  >
                    Create QR anchor
                  </button>
                  <p className="text-[11px] text-muted">
                    Print this exact code as a QR value. Visitors scan it to establish their
                    indoor position.
                  </p>
                </div>
              )}
              <button type="button" className="btn-danger w-full text-sm" onClick={() => void deleteSelected()}>
                Delete node
              </button>
            </div>
          )}

          {selectedEdge && (
            <div className="space-y-2 border-t border-line pt-2">
              <h3 className="text-sm font-semibold">Edge</h3>
              <p className="text-xs text-muted">
                {selectedEdge.kind} · {selectedEdge.distanceM.toFixed(1)} m
              </p>
              <button type="button" className="btn-danger w-full text-sm" onClick={() => void deleteSelected()}>
                Delete edge
              </button>
            </div>
          )}

          <div className="space-y-2 border-t border-line pt-2">
            <h3 className="text-sm font-semibold">Outdoor → indoor handoffs</h3>
            {(snapshot?.handoffs ?? []).length === 0 && (
              <p className="text-xs text-muted">No handoffs configured.</p>
            )}
            {(snapshot?.handoffs ?? []).map((h) => {
              const outdoor = snapshot?.outdoorEntrances.find((e) => e.id === h.outdoorNodeId);
              return (
                <div key={h.id} className="flex items-center justify-between gap-2 text-xs">
                  <span>{outdoor?.name ?? h.outdoorNodeId.slice(0, 8)}</span>
                  <button
                    type="button"
                    className="text-red-600"
                    onClick={() =>
                      void api.mapBuilder.deleteIndoorHandoff(h.id, token).then(() => reloadSnapshot())
                    }
                  >
                    Remove
                  </button>
                </div>
              );
            })}
            <p className="text-xs text-muted">Use Handoff tool: pick outdoor entrance, then indoor node.</p>
            <ul className="space-y-1">
              {(snapshot?.outdoorEntrances ?? []).map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    className={`w-full rounded px-2 py-1 text-left text-xs ${
                      pendingHandoffOutdoorId === e.id ? 'bg-violet-100' : 'hover:bg-paper'
                    }`}
                    onClick={() => {
                      setPendingHandoffOutdoorId(e.id);
                      setTool('handoff');
                    }}
                  >
                    {e.name ?? e.id.slice(0, 8)}
                  </button>
                </li>
              ))}
            </ul>
          </div>

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

      {arPanelOpen && (
        <IndoorArMeasurePanel
          onClose={() => setArPanelOpen(false)}
          onApplyPlanPoints={applyArMeasurePoints}
          onSuggestFloorHeight={(h) => setFloorHeightM(h)}
        />
      )}
    </div>
  );
}
