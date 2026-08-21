import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MapContainer,
  CircleMarker,
  Marker,
  Polygon,
  Polyline,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import {
  AlertTriangle,
  Building2,
  CircleDot,
  DoorOpen,
  Layers,
  MapPin,
  MousePointer2,
  Route,
  Save,
  Shapes,
  Trash2,
  Eye,
  Upload,
  Loader2,
} from 'lucide-react';
import type {
  Building,
  GeoPoint,
  GraphEdge,
  GraphNode,
  MapBuilderSnapshot,
  MapValidationIssue,
  SiteArea,
  UnifiedMapValidationResult,
} from '@campusar/shared';
import { api, ApiError } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { useActiveSite } from '../../hooks/useActiveSite';
import { useMapEditorAccess } from '../../hooks/useMapEditorAccess';
import { useSiteStore } from '../../stores/siteStore';
import { usePreviewStore } from '../../stores/previewStore';
import { useNavStore } from '../../stores/themeStore';
import { clearBuildingContextCache } from '../../lib/buildingNavigation';
import {
  publishBlockedByValidation,
  publishConfirmMessage,
} from './mapBuilderPublish';
import { CAMPUS_DEFAULT_ZOOM, CAMPUS_MAX_ZOOM, siteMapCenter } from '../../lib/campus';
import { haversineMeters } from '../../lib/geo';
import { BasemapModeSwitcher, RealBasemapTiles, type BasemapMode } from '../../components/maps/RealBasemap';
import { RecenterOnSite } from '../../components/maps/GpsTracker';
import { Navigate, useNavigate } from 'react-router-dom';
import { EmptySiteNotice } from '../../components/EmptySiteNotice';
import { EditableFootprintLayer } from './EditableFootprintLayer';
import { UnsavedChangesDialog } from './UnsavedChangesDialog';
import { MapBuilderNav } from './MapBuilderNav';
import {
  cloneGeoRing,
  ringsEqual,
  type GeometryEditSession,
  type UnsavedChoice,
} from './mapBuilderUtils';
import { MAP_ENGINE } from '../../lib/mapEngine';

type BuilderTool = 'select' | 'building' | 'walkway' | 'node' | 'entrance' | 'poi' | 'area';

type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error';

type Selection =
  | { kind: 'building'; id: string }
  | { kind: 'node'; id: string }
  | { kind: 'edge'; id: string }
  | { kind: 'area'; id: string }
  | { kind: 'draft-building'; footprint: GeoPoint[] }
  | { kind: 'draft-area'; footprint: GeoPoint[] }
  | null;

const TOOLS: { id: BuilderTool; label: string; icon: typeof MousePointer2 }[] = [
  { id: 'select', label: 'Select', icon: MousePointer2 },
  { id: 'building', label: 'Building', icon: Building2 },
  { id: 'walkway', label: 'Walkway', icon: Route },
  { id: 'node', label: 'Node', icon: CircleDot },
  { id: 'entrance', label: 'Entrance', icon: DoorOpen },
  { id: 'poi', label: 'POI', icon: MapPin },
  { id: 'area', label: 'Area', icon: Shapes },
];

function ringToLatLngsLocal(ring: GeoPoint[]): [number, number][] {
  return ring.map((p) => [p.latitude, p.longitude]);
}

function GeomanDrawLayer({
  tool,
  onPolygon,
}: {
  tool: BuilderTool;
  onPolygon: (ring: GeoPoint[]) => void;
}) {
  const map = useMap();
  useEffect(() => {
    map.pm.setGlobalOptions({ snappable: true, snapDistance: 15 });
    return () => {
      map.pm.disableDraw();
    };
  }, [map]);

  useEffect(() => {
    map.pm.disableDraw();
    if (tool === 'building' || tool === 'area') {
      map.pm.enableDraw('Polygon', { continueDrawing: false });
    }
  }, [map, tool]);

  useEffect(() => {
    const onCreate = (e: { layer: L.Layer }) => {
      const layer = e.layer as L.Polygon;
      const latlngs = layer.getLatLngs();
      const ringRaw = (Array.isArray(latlngs[0]) ? latlngs[0] : latlngs) as L.LatLng[];
      const ring: GeoPoint[] = ringRaw.map((ll) => ({ latitude: ll.lat, longitude: ll.lng }));
      if (ring.length >= 3) onPolygon(ring);
      map.removeLayer(layer);
      map.pm.disableDraw();
    };
    map.on('pm:create', onCreate);
    return () => {
      map.off('pm:create', onCreate);
    };
  }, [map, onPolygon]);

  return null;
}

function FitSiteData({
  center,
  points,
}: {
  center: [number, number];
  points: [number, number][];
}) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) {
      map.fitBounds(points, { padding: [40, 40] });
    } else {
      map.setView(center, CAMPUS_DEFAULT_ZOOM);
    }
  }, [map, center, points]);
  return null;
}

function MapClickLayer({
  enabled,
  onClick,
}: {
  enabled: boolean;
  onClick: (lat: number, lon: number) => void;
}) {
  useMapEvents({
    click(e) {
      if (!enabled) return;
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export function MapBuilderPage() {
  const token = useAuthStore((s) => s.accessToken);
  const { canEdit, loading: accessLoading } = useMapEditorAccess();
  const { site, label, activeSiteId } = useActiveSite();
  const sites = useSiteStore((s) => s.sites);
  const setActiveSiteId = useSiteStore((s) => s.setActiveSiteId);
  const navigate = useNavigate();
  const enterPreview = usePreviewStore((s) => s.enterPreview);
  const exitPreview = usePreviewStore((s) => s.exitPreview);
  const resetNavForSiteChange = useNavStore((s) => s.resetForSiteChange);

  const [tool, setTool] = useState<BuilderTool>('select');
  const [basemap, setBasemap] = useState<BasemapMode>('streets');
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [areas, setAreas] = useState<SiteArea[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [walkFrom, setWalkFrom] = useState<string | null>(null);
  const [entranceBuildingId, setEntranceBuildingId] = useState<string>('');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<UnifiedMapValidationResult | null>(null);
  const [draftVersion, setDraftVersion] = useState<MapBuilderSnapshot['version'] | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewNote, setPreviewNote] = useState<string | null>(null);
  const [validateBusy, setValidateBusy] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const dirtyRef = useRef(false);
  const [geometryEdit, setGeometryEdit] = useState<GeometryEditSession | null>(null);
  const [attachFootprintBuildingId, setAttachFootprintBuildingId] = useState<string | null>(null);
  const [unsavedDialog, setUnsavedDialog] = useState<{
    title: string;
    message: string;
    onResolve: (choice: UnsavedChoice) => void;
  } | null>(null);

  const hasUnsavedGeometry =
    geometryEdit !== null && !ringsEqual(geometryEdit.originalFootprint, geometryEdit.draftFootprint);
  const hasUnsaved = dirtyRef.current || hasUnsavedGeometry;

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

  const center = useMemo(() => siteMapCenter(site), [site]);

  const fitPoints = useMemo((): [number, number][] => {
    const pts: [number, number][] = [];
    for (const b of buildings) {
      if (geometryEdit?.buildingId === b.id) {
        pts.push(...ringToLatLngsLocal(geometryEdit.draftFootprint));
      } else if (b.footprint?.length) pts.push(...ringToLatLngsLocal(b.footprint));
      else pts.push([b.latitude, b.longitude]);
    }
    for (const n of nodes) pts.push([n.latitude, n.longitude]);
    for (const a of areas) pts.push(...ringToLatLngsLocal(a.footprint));
    return pts;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fit when site data loads, not on every geometry drag
  }, [buildings, nodes, areas]);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    setSaveStatus('unsaved');
  }, []);

  const refreshValidation = useCallback(async () => {
    if (!token || !draftVersion?.id) return;
    try {
      const val = await api.mapBuilder.validateVersion(draftVersion.id, token);
      setValidation(val);
    } catch {
      /* keep prior validation snapshot */
    }
  }, [token, draftVersion?.id]);

  const handleValidationIssue = useCallback((issue: MapValidationIssue) => {
    if (!issue.resourceId || !issue.resourceType) return;
    switch (issue.resourceType) {
      case 'building':
        setSelection({ kind: 'building', id: issue.resourceId });
        break;
      case 'node':
      case 'entrance':
        setSelection({ kind: 'node', id: issue.resourceId });
        break;
      case 'edge':
        setSelection({ kind: 'edge', id: issue.resourceId });
        break;
      case 'area':
        setSelection({ kind: 'area', id: issue.resourceId });
        break;
      default:
        break;
    }
  }, []);

  const handleValidateDraft = useCallback(async () => {
    if (!token || !draftVersion) return;
    setValidateBusy(true);
    setPublishSuccess(null);
    try {
      const val = await api.mapBuilder.validateVersion(draftVersion.id, token);
      setValidation(val);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Validation failed');
    } finally {
      setValidateBusy(false);
    }
  }, [token, draftVersion]);

  const reload = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setLoadError(null);
    try {
      const snap = await api.mapBuilder.snapshot(token);
      setBuildings(snap.buildings);
      setNodes(snap.nodes);
      setEdges(snap.edges);
      setAreas(snap.areas);
      setDraftVersion(snap.version);
      dirtyRef.current = false;
      setSaveStatus('idle');
      const val = await api.mapBuilder.validateVersion(snap.version.id, token);
      setValidation(val);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load site map data');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const handlePublishDraft = useCallback(async () => {
    if (!token || !draftVersion) return;
    setPublishBusy(true);
    setPublishDialogOpen(false);
    setError(null);
    setPublishSuccess(null);
    try {
      const result = await api.mapBuilder.publishVersion(draftVersion.id, token);
      if (!result.published) {
        setValidation(result.validation);
        setError(
          `Publish blocked: ${result.validation.summary.errors} validation error(s). Fix issues before publishing.`,
        );
        return;
      }
      setPublishSuccess(`Version ${result.version.versionNumber} is now published.`);
      clearBuildingContextCache();
      resetNavForSiteChange();
      exitPreview();
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Publish failed');
    } finally {
      setPublishBusy(false);
    }
  }, [token, draftVersion, reload, exitPreview, resetNavForSiteChange]);

  useEffect(() => {
    setSelection(null);
    setWalkFrom(null);
    setGeometryEdit(null);
    setAttachFootprintBuildingId(null);
    void reload();
  }, [site?.id, reload]);

  const saveGeometryEdit = useCallback(async () => {
    if (!token || !geometryEdit) return false;
    setSaveStatus('saving');
    setError(null);
    try {
      const updated = await api.mapBuilder.updateBuilding(
        geometryEdit.buildingId,
        {
          footprint: geometryEdit.draftFootprint,
          expectedUpdatedAt: geometryEdit.expectedUpdatedAt,
        },
        token,
      );
      setBuildings((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
      setGeometryEdit(null);
      dirtyRef.current = false;
      setSaveStatus('saved');
      void refreshValidation();
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save footprint');
      setSaveStatus('error');
      return false;
    }
  }, [geometryEdit, token, refreshValidation]);

  const cancelGeometryEdit = useCallback(() => {
    setGeometryEdit(null);
    if (!dirtyRef.current) setSaveStatus('idle');
  }, []);

  const handleSiteChange = async (siteId: string) => {
    const choice = await requestUnsavedChoice(
      'Unsaved map changes',
      'You have unsaved geometry edits. Save, discard, or stay on this site.',
    );
    if (choice === 'stay') return;
    if (choice === 'save') {
      const ok = await saveGeometryEdit();
      if (!ok) return;
    } else {
      cancelGeometryEdit();
      dirtyRef.current = false;
    }
    setActiveSiteId(siteId);
  };

  const selectResource = async (next: Selection) => {
    if (hasUnsavedGeometry) {
      const choice = await requestUnsavedChoice(
        'Unsaved geometry',
        'Save footprint changes before selecting another feature?',
      );
      if (choice === 'stay') return;
      if (choice === 'save') {
        const ok = await saveGeometryEdit();
        if (!ok) return;
      } else {
        cancelGeometryEdit();
      }
    }
    setSelection(next);
  };

  const startGeometryEdit = (building: Building) => {
    if (!building.footprint?.length) return;
    setGeometryEdit({
      buildingId: building.id,
      originalFootprint: cloneGeoRing(building.footprint),
      draftFootprint: cloneGeoRing(building.footprint),
      expectedUpdatedAt: building.updatedAt,
    });
    setSelection({ kind: 'building', id: building.id });
    markDirty();
  };

  const onPolygonDrawn = useCallback(
    async (ring: GeoPoint[]) => {
      if (attachFootprintBuildingId && token) {
        setSaveStatus('saving');
        try {
          const building = buildings.find((b) => b.id === attachFootprintBuildingId);
          const updated = await api.mapBuilder.updateBuilding(
            attachFootprintBuildingId,
            { footprint: ring, expectedUpdatedAt: building?.updatedAt },
            token,
          );
          setBuildings((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
          setAttachFootprintBuildingId(null);
          setSelection({ kind: 'building', id: updated.id });
          setSaveStatus('saved');
          void refreshValidation();
        } catch (err) {
          setError(err instanceof ApiError ? err.message : 'Could not save footprint');
          setSaveStatus('error');
        }
        setTool('select');
        return;
      }
      if (tool === 'building') {
        setSelection({ kind: 'draft-building', footprint: ring });
        markDirty();
      } else if (tool === 'area') {
        setSelection({ kind: 'draft-area', footprint: ring });
        markDirty();
      }
      setTool('select');
    },
    [tool, markDirty, attachFootprintBuildingId, token, buildings, refreshValidation],
  );

  const handleMapClick = async (lat: number, lon: number) => {
    if (!token || tool === 'select' || tool === 'building' || tool === 'area') return;
    setError(null);
    try {
      if (tool === 'node') {
        const created = await api.mapBuilder.createNode(
          { latitude: lat, longitude: lon, kind: 'outdoor', name: null },
          token,
        );
        setNodes((prev) => [...prev, created]);
        setSelection({ kind: 'node', id: created.id });
        setSaveStatus('saved');
        dirtyRef.current = false;
      } else if (tool === 'poi') {
        const name = window.prompt('POI name');
        if (!name?.trim()) return;
        const created = await api.mapBuilder.createNode(
          { latitude: lat, longitude: lon, kind: 'outdoor', name: name.trim() },
          token,
        );
        setNodes((prev) => [...prev, created]);
        setSelection({ kind: 'node', id: created.id });
        setSaveStatus('saved');
      } else if (tool === 'entrance') {
        if (!entranceBuildingId) {
          setError('Select a building before placing an entrance.');
          return;
        }
        const name = window.prompt('Entrance name', 'Main entrance') ?? 'Main entrance';
        const created = await api.mapBuilder.createNode(
          {
            latitude: lat,
            longitude: lon,
            kind: 'entrance',
            name,
            buildingId: entranceBuildingId,
          },
          token,
        );
        setNodes((prev) => [...prev, created]);
        setSelection({ kind: 'node', id: created.id });
        setSaveStatus('saved');
      }
      void refreshValidation();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
      setSaveStatus('error');
    }
  };

  const handleWalkwayClick = (nodeId: string) => {
    if (tool !== 'walkway') return;
    if (!walkFrom) {
      setWalkFrom(nodeId);
      return;
    }
    if (walkFrom === nodeId) {
      setWalkFrom(null);
      return;
    }
    void connectWalkway(walkFrom, nodeId);
    setWalkFrom(null);
  };

  const connectWalkway = async (fromId: string, toId: string) => {
    if (!token) return;
    const from = nodes.find((n) => n.id === fromId);
    const to = nodes.find((n) => n.id === toId);
    if (!from || !to) return;
    setSaveStatus('saving');
    try {
      const distanceM = haversineMeters(from.latitude, from.longitude, to.latitude, to.longitude);
      const edge = await api.mapBuilder.createEdge(
        {
          fromNodeId: fromId,
          toNodeId: toId,
          distanceM,
          kind: 'walkway',
          bidirectional: true,
          blocked: false,
          safetyScore: 0.9,
          crowdScore: 0.2,
          accessibilityScore: 0.9,
        },
        token,
      );
      setEdges((prev) => [...prev, edge]);
      setSelection({ kind: 'edge', id: edge.id });
      setSaveStatus('saved');
      void refreshValidation();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create walkway');
      setSaveStatus('error');
    }
  };

  const saveDraftBuilding = async (meta: {
    name: string;
    code: string;
    floorsCount: number;
    description?: string | null;
  }) => {
    if (!token || selection?.kind !== 'draft-building') return;
    setSaveStatus('saving');
    setError(null);
    try {
      const created = await api.mapBuilder.createBuilding(
        {
          name: meta.name,
          code: meta.code,
          description: meta.description ?? null,
          latitude: selection.footprint[0]?.latitude ?? site?.latitude ?? 0,
          longitude: selection.footprint[0]?.longitude ?? site?.longitude ?? 0,
          floorsCount: meta.floorsCount,
          footprint: selection.footprint,
        },
        token,
      );
      setBuildings((prev) => [...prev, created]);
      setSelection({ kind: 'building', id: created.id });
      setSaveStatus('saved');
      dirtyRef.current = false;
      void refreshValidation();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save building');
      setSaveStatus('error');
    }
  };

  const saveDraftArea = async (meta: { name: string; type: SiteArea['type'] }) => {
    if (!token || selection?.kind !== 'draft-area') return;
    setSaveStatus('saving');
    try {
      const created = await api.mapBuilder.createArea(
        { name: meta.name, type: meta.type, footprint: selection.footprint },
        token,
      );
      setAreas((prev) => [...prev, created]);
      setSelection({ kind: 'area', id: created.id });
      setSaveStatus('saved');
      dirtyRef.current = false;
      void refreshValidation();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save area');
      setSaveStatus('error');
    }
  };

  const deleteSelected = async () => {
    if (!token || !selection) return;
    if (!window.confirm('Delete this map feature?')) return;
    setSaveStatus('saving');
    try {
      if (selection.kind === 'building') {
        await api.mapBuilder.deleteBuilding(selection.id, token);
        setBuildings((prev) => prev.filter((b) => b.id !== selection.id));
      } else if (selection.kind === 'node') {
        try {
          await api.mapBuilder.deleteNode(selection.id, false, token);
        } catch (err) {
          if (err instanceof ApiError && err.status === 409) {
            if (window.confirm(`${err.message}\n\nDelete connected walkways too?`)) {
              await api.mapBuilder.deleteNode(selection.id, true, token);
              setEdges((prev) =>
                prev.filter((e) => e.fromNodeId !== selection.id && e.toNodeId !== selection.id),
              );
            } else return;
          } else throw err;
        }
        setNodes((prev) => prev.filter((n) => n.id !== selection.id));
      } else if (selection.kind === 'edge') {
        await api.mapBuilder.deleteEdge(selection.id, token);
        setEdges((prev) => prev.filter((e) => e.id !== selection.id));
      } else if (selection.kind === 'area') {
        await api.mapBuilder.deleteArea(selection.id, token);
        setAreas((prev) => prev.filter((a) => a.id !== selection.id));
      }
      setSelection(null);
      setSaveStatus('saved');
      void refreshValidation();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Delete failed');
      setSaveStatus('error');
    }
  };

  if (accessLoading) {
    return <div className="p-6 text-sm text-muted">Checking map editor access…</div>;
  }
  if (!canEdit) {
    return <Navigate to="/map" replace />;
  }

  const emptySite = buildings.length === 0 && nodes.length === 0 && edges.length === 0;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-paper-raised px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold text-ink">Map Builder</h1>
          <p className="text-xs text-muted">{label}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded border border-line bg-paper px-2 py-1 text-[11px] font-semibold uppercase text-ink-mute">
            Engine: {MAP_ENGINE}
          </span>
          <MapBuilderNav mode="outdoor" />
          {sites.length > 1 ? (
            <select
              className="rounded-md border border-line bg-paper px-2 py-1.5 text-sm"
              value={site?.id ?? ''}
              onChange={(e) => handleSiteChange(e.target.value)}
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.organizationName} · {s.name}
                </option>
              ))}
            </select>
          ) : null}
          <span className="text-xs text-muted">
            {saveStatus === 'unsaved'
              ? 'Unsaved changes'
              : saveStatus === 'saving'
                ? 'Saving…'
                : saveStatus === 'saved'
                  ? 'Saved'
                  : saveStatus === 'error'
                    ? 'Error'
                    : 'Ready'}
          </span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-52 shrink-0 overflow-y-auto border-r border-line bg-paper p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Tools</p>
          <div className="space-y-1">
            {TOOLS.map(({ id, label: toolLabel, icon: Icon }) => (
              <button
                key={id}
                type="button"
                className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm ${
                  tool === id ? 'bg-accent/15 text-accent font-semibold' : 'hover:bg-paper-raised'
                }`}
                onClick={() => {
                  setTool(id);
                  setWalkFrom(null);
                }}
              >
                <Icon className="h-4 w-4" />
                {toolLabel}
              </button>
            ))}
          </div>
          {tool === 'entrance' ? (
            <div className="mt-4">
              <label className="text-xs font-semibold text-muted">Building</label>
              <select
                className="mt-1 w-full rounded-md border border-line bg-paper px-2 py-1 text-sm"
                value={entranceBuildingId}
                onChange={(e) => setEntranceBuildingId(e.target.value)}
              >
                <option value="">Select building…</option>
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <p className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-muted">Layers</p>
          <div className="space-y-1 text-xs text-muted">
            <div className="flex items-center gap-2">
              <Layers className="h-3.5 w-3.5" /> Buildings ({buildings.length})
            </div>
            <div>Nodes ({nodes.length})</div>
            <div>Walkways ({edges.length})</div>
            <div>Areas ({areas.length})</div>
          </div>
        </aside>

        <div className="relative min-w-0 flex-1">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted">Loading map…</div>
          ) : loadError ? (
            <div className="flex h-full items-center justify-center p-6 text-sm text-danger">{loadError}</div>
          ) : (
            <MapContainer center={center} zoom={CAMPUS_DEFAULT_ZOOM} maxZoom={CAMPUS_MAX_ZOOM} className="h-full w-full">
              <RealBasemapTiles mode={basemap} />
              <BasemapModeSwitcher mode={basemap} onChange={setBasemap} />
              <RecenterOnSite center={center} />
              <FitSiteData center={center} points={fitPoints} />
              <GeomanDrawLayer tool={tool} onPolygon={onPolygonDrawn} />
              {geometryEdit ? (
                <EditableFootprintLayer
                  key={geometryEdit.buildingId}
                  footprint={geometryEdit.originalFootprint}
                  onChange={(ring) => {
                    setGeometryEdit((g) => (g ? { ...g, draftFootprint: ring } : g));
                    setSaveStatus('unsaved');
                    dirtyRef.current = true;
                  }}
                />
              ) : null}
              <MapClickLayer
                enabled={tool === 'node' || tool === 'poi' || tool === 'entrance'}
                onClick={handleMapClick}
              />

              {areas.map((a) => (
                <Polygon
                  key={a.id}
                  positions={ringToLatLngsLocal(a.footprint)}
                  pathOptions={{
                    color: a.type === 'restricted' ? '#dc2626' : '#2563eb',
                    fillOpacity: 0.15,
                    weight: selection?.kind === 'area' && selection.id === a.id ? 3 : 1,
                  }}
                  eventHandlers={{ click: () => setSelection({ kind: 'area', id: a.id }) }}
                />
              ))}

              {buildings.map((b) => {
                if (geometryEdit?.buildingId === b.id) return null;
                return b.footprint && b.footprint.length >= 3 ? (
                  <Polygon
                    key={b.id}
                    positions={ringToLatLngsLocal(b.footprint)}
                    pathOptions={{
                      color: '#0F6B63',
                      fillOpacity: 0.25,
                      weight: selection?.kind === 'building' && selection.id === b.id ? 3 : 1,
                    }}
                    eventHandlers={{
                      click: () => void selectResource({ kind: 'building', id: b.id }),
                    }}
                  >
                    <Tooltip permanent direction="center" className="building-label">
                      {b.code}
                    </Tooltip>
                  </Polygon>
                ) : (
                  <CircleMarker
                    key={b.id}
                    center={[b.latitude, b.longitude]}
                    radius={8}
                    pathOptions={{ color: '#0F6B63', fillColor: '#0F6B63', fillOpacity: 0.8 }}
                    eventHandlers={{
                      click: () => void selectResource({ kind: 'building', id: b.id }),
                    }}
                  >
                    <Tooltip>{b.name}</Tooltip>
                  </CircleMarker>
                );
              })}

              {selection?.kind === 'draft-building' ? (
                <Polygon
                  positions={ringToLatLngsLocal(selection.footprint)}
                  pathOptions={{ color: '#f97316', dashArray: '4' }}
                />
              ) : null}
              {selection?.kind === 'draft-area' ? (
                <Polygon
                  positions={ringToLatLngsLocal(selection.footprint)}
                  pathOptions={{ color: '#7c3aed', dashArray: '4' }}
                />
              ) : null}

              {edges.map((e) => {
                const from = nodes.find((n) => n.id === e.fromNodeId);
                const to = nodes.find((n) => n.id === e.toNodeId);
                if (!from || !to) return null;
                return (
                  <Polyline
                    key={e.id}
                    positions={[
                      [from.latitude, from.longitude],
                      [to.latitude, to.longitude],
                    ]}
                    pathOptions={{
                      color: e.blocked ? '#dc2626' : '#64748b',
                      weight: selection?.kind === 'edge' && selection.id === e.id ? 5 : 3,
                    }}
                    eventHandlers={{ click: () => void selectResource({ kind: 'edge', id: e.id }) }}
                  />
                );
              })}

              {nodes.map((n) => (
                <Marker
                  key={n.id}
                  position={[n.latitude, n.longitude]}
                  draggable={tool === 'select' && selection?.kind === 'node' && selection.id === n.id}
                  eventHandlers={{
                    click: () => {
                      if (tool === 'walkway') handleWalkwayClick(n.id);
                      else void selectResource({ kind: 'node', id: n.id });
                    },
                    dragend: async (e) => {
                      if (!token || tool !== 'select') return;
                      const ll = e.target.getLatLng();
                      setSaveStatus('saving');
                      try {
                        const updated = await api.mapBuilder.updateNode(
                          n.id,
                          { latitude: ll.lat, longitude: ll.lng },
                          token,
                        );
                        setNodes((prev) => prev.map((node) => (node.id === n.id ? updated : node)));
                        const snap = await api.mapBuilder.snapshot(token);
                        setEdges(snap.edges);
                        setSaveStatus('saved');
                        void refreshValidation();
                      } catch (err) {
                        setError(err instanceof ApiError ? err.message : 'Could not move node');
                        setSaveStatus('error');
                      }
                    },
                  }}
                >
                  <Tooltip>{n.name ?? n.kind}</Tooltip>
                </Marker>
              ))}
            </MapContainer>
          )}
          {emptySite && !loading ? (
            <div className="pointer-events-none absolute inset-x-0 top-4 z-[1000] mx-auto max-w-lg px-4">
              <EmptySiteNotice
                title="Start building your site map"
                message="This site does not have map data yet. Start by adding a building, navigation point, or POI."
              />
            </div>
          ) : null}
        </div>

        <aside className="w-80 shrink-0 overflow-y-auto border-l border-line bg-paper p-4">
          <PropertiesPanel
            selection={selection}
            buildings={buildings}
            nodes={nodes}
            geometryEdit={geometryEdit}
            onStartGeometryEdit={startGeometryEdit}
            onSaveGeometry={() => void saveGeometryEdit()}
            onCancelGeometry={cancelGeometryEdit}
            onAttachFootprint={(buildingId) => {
              setAttachFootprintBuildingId(buildingId);
              setTool('building');
            }}
            onSaveBuilding={saveDraftBuilding}
            onSaveArea={saveDraftArea}
            onUpdate={async (kind, id, patch) => {
              if (!token) return;
              setSaveStatus('saving');
              try {
                if (kind === 'building') {
                  const updated = await api.mapBuilder.updateBuilding(id, patch as Partial<Building>, token);
                  setBuildings((prev) => prev.map((b) => (b.id === id ? updated : b)));
                } else if (kind === 'node') {
                  const updated = await api.mapBuilder.updateNode(id, patch, token);
                  setNodes((prev) => prev.map((n) => (n.id === id ? updated : n)));
                }
                setSaveStatus('saved');
                void refreshValidation();
              } catch (err) {
                setError(err instanceof ApiError ? err.message : 'Update failed');
                setSaveStatus('error');
              }
            }}
            onDelete={deleteSelected}
          />
          {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
          {publishSuccess ? <p className="mt-3 text-sm font-semibold text-accent">{publishSuccess}</p> : null}
          <div className="mt-6 space-y-3 border-t border-line pt-4">
            <button
              type="button"
              className="btn-secondary inline-flex w-full items-center justify-center gap-2"
              disabled={!draftVersion || validateBusy}
              onClick={() => void handleValidateDraft()}
            >
              {validateBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
              {validateBusy ? 'Validating…' : 'Validate Draft'}
            </button>
            <button
              type="button"
              className="btn-primary inline-flex w-full items-center justify-center gap-2"
              disabled={!draftVersion || previewBusy}
              onClick={() => {
                if (!token || !draftVersion || !activeSiteId) return;
                setPreviewBusy(true);
                setPreviewNote(null);
                void (async () => {
                  try {
                    const val = await api.mapBuilder.validateVersion(draftVersion.id, token);
                    setValidation(val);
                    if (val.summary.errors > 0) {
                      setPreviewNote(
                        `Draft has ${val.summary.errors} validation error(s). Preview shows incomplete data — fix before publishing.`,
                      );
                    } else if (val.summary.warnings > 0) {
                      setPreviewNote(
                        `Draft has ${val.summary.warnings} warning(s). Preview is available.`,
                      );
                    }
                    enterPreview({
                      versionId: draftVersion.id,
                      versionNumber: draftVersion.versionNumber,
                      siteId: activeSiteId,
                      validation: val,
                    });
                    navigate('/map');
                  } catch (err) {
                    setPreviewNote(
                      err instanceof ApiError ? err.message : 'Could not start preview',
                    );
                  } finally {
                    setPreviewBusy(false);
                  }
                })();
              }}
            >
              <Eye className="h-4 w-4" />
              {previewBusy ? 'Starting preview…' : 'Preview Draft'}
            </button>
            {previewNote ? <p className="text-xs text-muted">{previewNote}</p> : null}
            <button
              type="button"
              className="btn-primary inline-flex w-full items-center justify-center gap-2 bg-accent-success hover:opacity-90"
              disabled={!draftVersion || publishBusy || publishBlockedByValidation(validation)}
              onClick={() => setPublishDialogOpen(true)}
            >
              {publishBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {publishBusy ? 'Publishing…' : 'Publish Map'}
            </button>
          </div>
          <ValidationPanel validation={validation} onSelectIssue={handleValidationIssue} />
        </aside>
      </div>
      {unsavedDialog ? (
        <UnsavedChangesDialog
          open
          title={unsavedDialog.title}
          message={unsavedDialog.message}
          onStay={() => unsavedDialog.onResolve('stay')}
          onDiscard={() => unsavedDialog.onResolve('discard')}
          onSave={() => unsavedDialog.onResolve('save')}
        />
      ) : null}
      {publishDialogOpen && draftVersion ? (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-lg border border-line bg-paper-raised p-5 shadow-lg"
          >
            <h2 className="text-lg font-semibold text-ink">Publish this map version?</h2>
            <p className="mt-2 whitespace-pre-line text-sm text-muted">
              {publishConfirmMessage(
                draftVersion.versionNumber,
                validation?.summary.warnings ?? 0,
              )}
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setPublishDialogOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={publishBusy}
                onClick={() => void handlePublishDraft()}
              >
                Publish Version {draftVersion.versionNumber}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PropertiesPanel({
  selection,
  buildings,
  nodes,
  geometryEdit,
  onStartGeometryEdit,
  onSaveGeometry,
  onCancelGeometry,
  onAttachFootprint,
  onSaveBuilding,
  onSaveArea,
  onUpdate,
  onDelete,
}: {
  selection: Selection;
  buildings: Building[];
  nodes: GraphNode[];
  geometryEdit: GeometryEditSession | null;
  onStartGeometryEdit: (building: Building) => void;
  onSaveGeometry: () => void;
  onCancelGeometry: () => void;
  onAttachFootprint: (buildingId: string) => void;
  onSaveBuilding: (meta: {
    name: string;
    code: string;
    floorsCount: number;
    description?: string | null;
  }) => void;
  onSaveArea: (meta: { name: string; type: SiteArea['type'] }) => void;
  onUpdate: (
    kind: 'building' | 'node',
    id: string,
    patch: Record<string, unknown>,
  ) => void;
  onDelete: () => void;
}) {
  if (!selection) {
    return <p className="text-sm text-muted">Select a feature or use a drawing tool.</p>;
  }

  if (selection.kind === 'draft-building') {
    return (
      <DraftBuildingForm
        onSave={onSaveBuilding}
        onCancel={() => window.location.reload()}
      />
    );
  }
  if (selection.kind === 'draft-area') {
    return <DraftAreaForm onSave={onSaveArea} />;
  }

  if (selection.kind === 'building') {
    const b = buildings.find((x) => x.id === selection.id);
    if (!b) return null;
    const editingThis = geometryEdit?.buildingId === b.id;
    return (
      <div className="space-y-3">
        <EntityForm
          title={`Building · ${b.name}`}
          fields={[
            { key: 'name', label: 'Name', value: b.name },
            { key: 'code', label: 'Code', value: b.code },
            { key: 'floorsCount', label: 'Floors', value: String(b.floorsCount), type: 'number' },
          ]}
          onSave={(values) =>
            onUpdate('building', b.id, {
              name: values.name,
              code: values.code,
              floorsCount: Number(values.floorsCount),
              expectedUpdatedAt: b.updatedAt,
            })
          }
          onDelete={onDelete}
          extra={
            b.footprint?.length
              ? `${b.footprint.length} footprint vertices · center derived from polygon`
              : 'Legacy point building — draw a footprint to enable polygon rendering'
          }
        />
        {b.footprint?.length ? (
          editingThis ? (
            <div className="space-y-2 border-t border-line pt-3">
              <p className="text-sm font-semibold text-ink">Editing footprint</p>
              <p className="text-xs text-muted">Drag vertices on the map, then save or cancel.</p>
              <button type="button" className="btn-primary inline-flex w-full items-center justify-center gap-2" onClick={onSaveGeometry}>
                <Save className="h-4 w-4" /> Save geometry
              </button>
              <button type="button" className="btn-secondary inline-flex w-full items-center justify-center gap-2" onClick={onCancelGeometry}>
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" className="btn-secondary inline-flex w-full items-center justify-center gap-2" onClick={() => onStartGeometryEdit(b)}>
              Edit geometry
            </button>
          )
        ) : (
          <button type="button" className="btn-secondary inline-flex w-full items-center justify-center gap-2" onClick={() => onAttachFootprint(b.id)}>
            Draw footprint
          </button>
        )}
      </div>
    );
  }

  if (selection.kind === 'node') {
    const n = nodes.find((x) => x.id === selection.id);
    if (!n) return null;
    return (
      <EntityForm
        title={`Node · ${n.name ?? n.kind}`}
        fields={[
          { key: 'name', label: 'Name', value: n.name ?? '' },
          { key: 'kind', label: 'Kind', value: n.kind },
        ]}
        onSave={(values) =>
          onUpdate('node', n.id, {
            name: values.name || null,
            kind: values.kind as GraphNode['kind'],
          })
        }
        onDelete={onDelete}
        extra="Drag the marker on the map to move this point. Connected walkway distances update automatically."
      />
    );
  }

  if (selection.kind === 'edge') {
    return (
      <div>
        <p className="font-semibold text-ink">Walkway</p>
        <p className="mt-1 text-sm text-muted">Select endpoints on the map. Use delete to remove.</p>
        <button type="button" className="btn-danger mt-4 inline-flex items-center gap-2" onClick={onDelete}>
          <Trash2 className="h-4 w-4" /> Delete walkway
        </button>
      </div>
    );
  }

  if (selection.kind === 'area') {
    return (
      <div>
        <p className="font-semibold text-ink">Area polygon</p>
        <button type="button" className="btn-danger mt-4 inline-flex items-center gap-2" onClick={onDelete}>
          <Trash2 className="h-4 w-4" /> Delete area
        </button>
      </div>
    );
  }

  return null;
}

function DraftBuildingForm({
  onSave,
}: {
  onSave: (meta: { name: string; code: string; floorsCount: number }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [floorsCount, setFloorsCount] = useState(1);
  return (
    <div className="space-y-3">
      <p className="font-semibold text-ink">New building footprint</p>
      <input className="input w-full" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <input className="input w-full" placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} />
      <input
        className="input w-full"
        type="number"
        min={1}
        value={floorsCount}
        onChange={(e) => setFloorsCount(Number(e.target.value))}
      />
      <button
        type="button"
        className="btn-primary inline-flex w-full items-center justify-center gap-2"
        disabled={!name.trim() || !code.trim()}
        onClick={() => onSave({ name: name.trim(), code: code.trim().toUpperCase(), floorsCount })}
      >
        <Save className="h-4 w-4" /> Save building
      </button>
    </div>
  );
}

function DraftAreaForm({
  onSave,
}: {
  onSave: (meta: { name: string; type: SiteArea['type'] }) => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<SiteArea['type']>('open_area');
  return (
    <div className="space-y-3">
      <p className="font-semibold text-ink">New area</p>
      <input className="input w-full" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <select className="input w-full" value={type} onChange={(e) => setType(e.target.value as SiteArea['type'])}>
        <option value="parking">Parking</option>
        <option value="open_area">Open area</option>
        <option value="restricted">Restricted</option>
        <option value="assembly">Emergency assembly</option>
      </select>
      <button
        type="button"
        className="btn-primary inline-flex w-full items-center justify-center gap-2"
        disabled={!name.trim()}
        onClick={() => onSave({ name: name.trim(), type })}
      >
        <Save className="h-4 w-4" /> Save area
      </button>
    </div>
  );
}

function EntityForm({
  title,
  fields,
  onSave,
  onDelete,
  extra,
}: {
  title: string;
  fields: { key: string; label: string; value: string; type?: string }[];
  onSave: (values: Record<string, string>) => void;
  onDelete: () => void;
  extra?: string;
}) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(fields.map((f) => [f.key, f.value])),
  );
  return (
    <div className="space-y-3">
      <p className="font-semibold text-ink">{title}</p>
      {extra ? <p className="text-xs text-muted">{extra}</p> : null}
      {fields.map((f) => (
        <label key={f.key} className="block text-xs text-muted">
          {f.label}
          <input
            className="input mt-1 w-full"
            type={f.type ?? 'text'}
            value={values[f.key] ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
          />
        </label>
      ))}
      <button
        type="button"
        className="btn-primary inline-flex w-full items-center justify-center gap-2"
        onClick={() => onSave(values)}
      >
        <Save className="h-4 w-4" /> Save changes
      </button>
      <button type="button" className="btn-danger inline-flex w-full items-center justify-center gap-2" onClick={onDelete}>
        <Trash2 className="h-4 w-4" /> Delete
      </button>
    </div>
  );
}

function ValidationPanel({
  validation,
  onSelectIssue,
}: {
  validation: UnifiedMapValidationResult | null;
  onSelectIssue?: (issue: MapValidationIssue) => void;
}) {
  if (!validation) return null;
  const errors = validation.summary.errors;
  const warnings = validation.summary.warnings;
  return (
    <div className="mt-6 border-t border-line pt-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-ink">
        <AlertTriangle className="h-4 w-4" />
        Validation
      </p>
      <p className="mt-1 text-xs text-muted">
        {validation.valid ? 'Valid' : 'Invalid'} · {errors} errors · {warnings} warnings
      </p>
      <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto text-xs">
        {validation.issues.map((issue, i) => (
          <li key={`${issue.code}-${issue.resourceId ?? i}`}>
            <button
              type="button"
              className={`w-full text-left ${issue.level === 'error' ? 'text-danger' : 'text-amber-700 dark:text-amber-400'} ${issue.resourceId ? 'hover:underline' : ''}`}
              disabled={!issue.resourceId || !onSelectIssue}
              onClick={() => onSelectIssue?.(issue)}
            >
              <span className="font-semibold uppercase">{issue.level}</span>{' '}
              <span className="font-mono text-[10px]">{issue.code}</span> {issue.message}
              {issue.resourceType && issue.resourceId ? (
                <span className="mt-0.5 block text-ink-faint">
                  {issue.resourceType} · {issue.resourceId.slice(0, 8)}…
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
