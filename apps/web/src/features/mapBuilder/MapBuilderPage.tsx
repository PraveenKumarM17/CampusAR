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
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  TerraDraw,
  TerraDrawPointMode,
  TerraDrawPolygonMode,
  TerraDrawSelectMode,
} from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
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
import { MapBuilderNav } from './MapBuilderNav';
import { MAP_ENGINE } from '../../lib/mapEngine';
import { ensureMapLibreWorker } from '../../lib/maplibreWorker';
import { applyMapLibreBasemap, emptyMapLibreStyle } from '../../lib/maplibreBasemap';
import {
  DEFAULT_LAYER_VISIBILITY,
  MapBuilderLayersPanel,
  type FeatureSelection,
  type LayerVisibility,
} from './MapBuilderLayersPanel';
import { MapBuilderInspectorPanel, type InspectorSaveConflict } from './MapBuilderInspectorPanel';
import { MapBuilderIssuesPanel } from './MapBuilderIssuesPanel';
import { MapBuilderStatusBar, type StatusAutosave } from './MapBuilderStatusBar';
import { MapBuilderConflictDialog } from './MapBuilderConflictDialog';
import {
  computeClientValidationIssues,
  issueBadgePoints,
  type IssueBadgePoint,
} from './mapBuilderClientValidation';

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

function toPolygonCoords(ring: GeoPoint[]): number[][][] {
  return [ring.map((p) => [p.longitude, p.latitude])];
}

function emptyIssueBadges(): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

type GeometryCommit =
  | { kind: 'building'; id: string; footprint: GeoPoint[] }
  | { kind: 'area'; id: string; footprint: GeoPoint[] }
  | { kind: 'node'; id: string; latitude: number; longitude: number };

function MapLibreCanvas({
  center,
  buildings,
  nodes,
  edges,
  areas,
  tool,
  walkFromId,
  selection,
  layerVisibility,
  issueBadges = [],
  conflictFeatureId = null,
  geometryEditLocked = false,
  basemapMode = 'streets',
  onSelect,
  onNodeWalkwayClick,
  onPointDrawn,
  onPolygonDrawn,
  onGeometryCommit,
}: {
  center: [number, number];
  buildings: Building[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  areas: SiteArea[];
  tool: BuilderTool;
  walkFromId: string | null;
  selection: Selection;
  layerVisibility: LayerVisibility;
  issueBadges?: IssueBadgePoint[];
  conflictFeatureId?: string | null;
  geometryEditLocked?: boolean;
  basemapMode?: BasemapMode;
  onSelect: (s: Selection) => void;
  onNodeWalkwayClick: (nodeId: string) => void;
  onPointDrawn: (lat: number, lon: number) => void;
  onPolygonDrawn: (ring: GeoPoint[]) => void;
  onGeometryCommit: (commit: GeometryCommit) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const drawRef = useRef<TerraDraw | null>(null);
  const toolRef = useRef<BuilderTool>('select');
  const editFeatureIdsRef = useRef<Array<string | number>>([]);
  const basemapModeRef = useRef(basemapMode);
  const onPolygonDrawnRef = useRef(onPolygonDrawn);
  const onPointDrawnRef = useRef(onPointDrawn);
  const onSelectRef = useRef(onSelect);
  const onNodeWalkwayClickRef = useRef(onNodeWalkwayClick);
  const onGeometryCommitRef = useRef(onGeometryCommit);
  const buildingsRef = useRef(buildings);
  const nodesRef = useRef(nodes);
  const areasRef = useRef(areas);
  const geometryEditLockedRef = useRef(geometryEditLocked);

  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);
  useEffect(() => {
    basemapModeRef.current = basemapMode;
  }, [basemapMode]);
  useEffect(() => {
    buildingsRef.current = buildings;
    nodesRef.current = nodes;
    areasRef.current = areas;
  }, [areas, buildings, nodes]);
  useEffect(() => {
    geometryEditLockedRef.current = geometryEditLocked;
  }, [geometryEditLocked]);
  useEffect(() => {
    onPolygonDrawnRef.current = onPolygonDrawn;
    onPointDrawnRef.current = onPointDrawn;
    onSelectRef.current = onSelect;
    onNodeWalkwayClickRef.current = onNodeWalkwayClick;
    onGeometryCommitRef.current = onGeometryCommit;
  }, [onGeometryCommit, onNodeWalkwayClick, onPointDrawn, onPolygonDrawn, onSelect]);

  const buildingsGeo = useMemo<GeoJSON.FeatureCollection>(() => {
    const features: GeoJSON.Feature[] = [];
    const editingId =
      selection?.kind === 'building' && tool === 'select' ? selection.id : null;
    for (const b of buildings) {
      // Hide static footprint while Terra Draw owns the editable overlay
      if (editingId && b.id === editingId && b.footprint && b.footprint.length >= 3) continue;
      if (b.footprint && b.footprint.length >= 3) {
        features.push({
          type: 'Feature',
          properties: {
            id: b.id,
            code: b.code,
            name: b.name,
            point: 0,
            conflict: conflictFeatureId === b.id ? 1 : 0,
          },
          geometry: {
            type: 'Polygon',
            coordinates: toPolygonCoords(b.footprint),
          },
        });
      } else {
        features.push({
          type: 'Feature',
          properties: {
            id: b.id,
            code: b.code,
            name: b.name,
            point: 1,
            conflict: conflictFeatureId === b.id ? 1 : 0,
          },
          geometry: {
            type: 'Point',
            coordinates: [b.longitude, b.latitude],
          },
        });
      }
    }
    return { type: 'FeatureCollection', features };
  }, [buildings, conflictFeatureId, selection, tool]);

  const nodesGeo = useMemo<GeoJSON.FeatureCollection>(() => {
    const editingId = selection?.kind === 'node' && tool === 'select' ? selection.id : null;
    const features: GeoJSON.Feature[] = nodes
      .filter((n) => !(editingId && n.id === editingId))
      .map((n) => ({
        type: 'Feature',
        properties: {
          id: n.id,
          name: n.name,
          kind: n.kind,
          conflict: conflictFeatureId === n.id ? 1 : 0,
        },
        geometry: { type: 'Point', coordinates: [n.longitude, n.latitude] },
      }));
    return { type: 'FeatureCollection', features };
  }, [conflictFeatureId, nodes, selection, tool]);

  const edgesGeo = useMemo<GeoJSON.FeatureCollection>(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const features: GeoJSON.Feature[] = [];
    for (const e of edges) {
      const from = byId.get(e.fromNodeId);
      const to = byId.get(e.toNodeId);
      if (!from || !to) continue;
      features.push({
        type: 'Feature',
        properties: {
          id: e.id,
          blocked: e.blocked ? 1 : 0,
          kind: e.kind,
          conflict: conflictFeatureId === e.id ? 1 : 0,
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            [from.longitude, from.latitude],
            [to.longitude, to.latitude],
          ],
        },
      });
    }
    return { type: 'FeatureCollection', features };
  }, [conflictFeatureId, edges, nodes]);

  const areasGeo = useMemo<GeoJSON.FeatureCollection>(() => {
    const editingId = selection?.kind === 'area' && tool === 'select' ? selection.id : null;
    const features: GeoJSON.Feature[] = areas
      .filter((a) => a.footprint.length >= 3)
      .filter((a) => !(editingId && a.id === editingId))
      .map((a) => ({
        type: 'Feature',
        properties: {
          id: a.id,
          name: a.name,
          type: a.type,
          conflict: conflictFeatureId === a.id ? 1 : 0,
        },
        geometry: {
          type: 'Polygon',
          coordinates: toPolygonCoords(a.footprint),
        },
      }));
    return { type: 'FeatureCollection', features };
  }, [areas, conflictFeatureId, selection, tool]);

  const issueBadgesGeo = useMemo<GeoJSON.FeatureCollection>(() => {
    return {
      type: 'FeatureCollection',
      features: issueBadges.map((b) => ({
        type: 'Feature',
        properties: {
          id: b.id,
          resourceId: b.resourceId,
          resourceType: b.resourceType,
          level: b.level,
          code: b.code,
        },
        geometry: { type: 'Point', coordinates: [b.longitude, b.latitude] },
      })),
    };
  }, [issueBadges]);

  const ringFromFeature = (feature: GeoJSON.Feature): GeoPoint[] | null => {
    if (feature.geometry.type !== 'Polygon') return null;
    const raw = feature.geometry.coordinates[0];
    if (!Array.isArray(raw) || raw.length < 3) return null;
    return raw.map((p) => ({ latitude: Number(p[1]), longitude: Number(p[0]) }));
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    ensureMapLibreWorker();
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: emptyMapLibreStyle(),
      center: [center[1], center[0]],
      zoom: CAMPUS_DEFAULT_ZOOM,
      maxZoom: CAMPUS_MAX_ZOOM,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
    mapRef.current = map;
    if (import.meta.env.DEV) {
      (window as unknown as { __mapBuilderMap?: maplibregl.Map }).__mapBuilderMap = map;
    }

    const onLoad = () => {
      applyMapLibreBasemap(map, basemapModeRef.current);

      map.addSource('mapbuilder-buildings', { type: 'geojson', data: buildingsGeo });
      map.addSource('mapbuilder-edges', { type: 'geojson', data: edgesGeo });
      map.addSource('mapbuilder-nodes', { type: 'geojson', data: nodesGeo });
      map.addSource('mapbuilder-areas', { type: 'geojson', data: areasGeo });
      map.addSource('mapbuilder-issue-badges', { type: 'geojson', data: emptyIssueBadges() });

      map.addLayer({
        id: 'mapbuilder-areas-fill',
        type: 'fill',
        source: 'mapbuilder-areas',
        paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.12 },
      });
      map.addLayer({
        id: 'mapbuilder-buildings-fill',
        type: 'fill',
        source: 'mapbuilder-buildings',
        filter: ['==', ['get', 'point'], 0],
        paint: { 'fill-color': '#0F6B63', 'fill-opacity': 0.22 },
      });
      map.addLayer({
        id: 'mapbuilder-buildings-line',
        type: 'line',
        source: 'mapbuilder-buildings',
        filter: ['==', ['get', 'point'], 0],
        paint: {
          'line-color': [
            'case',
            ['==', ['get', 'conflict'], 1],
            '#dc2626',
            '#0F6B63',
          ],
          'line-width': [
            'case',
            ['==', ['get', 'conflict'], 1],
            4,
            2,
          ],
        },
      });
      map.addLayer({
        id: 'mapbuilder-buildings-point',
        type: 'circle',
        source: 'mapbuilder-buildings',
        filter: ['==', ['get', 'point'], 1],
        paint: {
          'circle-color': '#0F6B63',
          'circle-radius': 6,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
        },
      });
      map.addLayer({
        id: 'mapbuilder-edges-line',
        type: 'line',
        source: 'mapbuilder-edges',
        paint: {
          'line-color': [
            'case',
            ['==', ['get', 'blocked'], 1],
            '#dc2626',
            '#64748b',
          ],
          'line-width': 3,
        },
      });
      map.addLayer({
        id: 'mapbuilder-nodes-circle',
        type: 'circle',
        source: 'mapbuilder-nodes',
        paint: {
          'circle-color': [
            'match',
            ['get', 'kind'],
            'entrance',
            '#dc2626',
            'outdoor',
            '#f59e0b',
            '#2563eb',
          ],
          'circle-radius': 4,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
        },
      });
      map.addLayer({
        id: 'mapbuilder-walkway-start',
        type: 'circle',
        source: 'mapbuilder-nodes',
        paint: {
          'circle-color': '#22c55e',
          'circle-radius': 8,
          'circle-opacity': 0.2,
          'circle-stroke-color': '#16a34a',
          'circle-stroke-width': 2,
        },
        filter: ['==', ['get', 'id'], '__none__'],
      });
      // Selection highlight layers (filter keyed on selected feature id)
      map.addLayer({
        id: 'mapbuilder-sel-building-fill',
        type: 'fill',
        source: 'mapbuilder-buildings',
        filter: ['==', ['get', 'id'], '__none__'],
        paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.35 },
      });
      map.addLayer({
        id: 'mapbuilder-sel-building-line',
        type: 'line',
        source: 'mapbuilder-buildings',
        filter: ['==', ['get', 'id'], '__none__'],
        paint: { 'line-color': '#f59e0b', 'line-width': 4 },
      });
      map.addLayer({
        id: 'mapbuilder-sel-building-point',
        type: 'circle',
        source: 'mapbuilder-buildings',
        filter: ['==', ['get', 'id'], '__none__'],
        paint: {
          'circle-color': '#f59e0b',
          'circle-radius': 9,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });
      map.addLayer({
        id: 'mapbuilder-sel-edge',
        type: 'line',
        source: 'mapbuilder-edges',
        filter: ['==', ['get', 'id'], '__none__'],
        paint: { 'line-color': '#f59e0b', 'line-width': 6 },
      });
      map.addLayer({
        id: 'mapbuilder-sel-node',
        type: 'circle',
        source: 'mapbuilder-nodes',
        filter: ['==', ['get', 'id'], '__none__'],
        paint: {
          'circle-color': '#f59e0b',
          'circle-radius': 8,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });
      map.addLayer({
        id: 'mapbuilder-sel-area-fill',
        type: 'fill',
        source: 'mapbuilder-areas',
        filter: ['==', ['get', 'id'], '__none__'],
        paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.3 },
      });
      map.addLayer({
        id: 'mapbuilder-sel-area-line',
        type: 'line',
        source: 'mapbuilder-areas',
        filter: ['==', ['get', 'id'], '__none__'],
        paint: { 'line-color': '#f59e0b', 'line-width': 3 },
      });
      map.addLayer({
        id: 'mapbuilder-issue-badges',
        type: 'circle',
        source: 'mapbuilder-issue-badges',
        paint: {
          'circle-radius': 7,
          'circle-color': [
            'match',
            ['get', 'level'],
            'error',
            '#dc2626',
            '#f59e0b',
          ],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
          'circle-opacity': 0.95,
        },
      });

      map.on('click', 'mapbuilder-buildings-fill', (e: maplibregl.MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id;
        if (typeof id === 'string') onSelectRef.current({ kind: 'building', id });
      });
      map.on('click', 'mapbuilder-buildings-point', (e: maplibregl.MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id;
        if (typeof id === 'string') onSelectRef.current({ kind: 'building', id });
      });
      map.on('click', 'mapbuilder-edges-line', (e: maplibregl.MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id;
        if (typeof id === 'string') onSelectRef.current({ kind: 'edge', id });
      });
      map.on('click', 'mapbuilder-nodes-circle', (e: maplibregl.MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id;
        if (typeof id !== 'string') return;
        if (toolRef.current === 'walkway') {
          onNodeWalkwayClickRef.current(id);
          return;
        }
        onSelectRef.current({ kind: 'node', id });
      });
      map.on('click', 'mapbuilder-areas-fill', (e: maplibregl.MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id;
        if (typeof id === 'string') onSelectRef.current({ kind: 'area', id });
      });

      const draw = new TerraDraw({
        adapter: new TerraDrawMapLibreGLAdapter({ map }),
        modes: [
          new TerraDrawSelectMode({
            flags: {
              polygon: {
                feature: {
                  draggable: true,
                  coordinates: {
                    midpoints: true,
                    draggable: true,
                    deletable: true,
                  },
                },
              },
              point: {
                feature: {
                  draggable: true,
                },
              },
            },
          }),
          new TerraDrawPolygonMode({ editable: false }),
          new TerraDrawPointMode({ editable: false }),
        ],
      });
      drawRef.current = draw;
      draw.start();
      draw.setMode('select');
      const onFinish = (id: string | number, context: { mode: string; action?: string }) => {
        const feature = draw.getSnapshotFeature(id);
        if (!feature) return;
        const props = (feature.properties ?? {}) as Record<string, unknown>;
        const campusarKind = props.campusarKind;
        const campusarId = props.campusarId;
        const isCampusFeature =
          typeof campusarKind === 'string' && typeof campusarId === 'string';

        if (!isCampusFeature && context.mode === 'polygon') {
          const ring = ringFromFeature(feature as GeoJSON.Feature);
          if (ring && ring.length >= 3) onPolygonDrawnRef.current(ring);
          draw.removeFeatures([id]);
          draw.setMode('select');
          return;
        }
        if (!isCampusFeature && context.mode === 'point' && feature.geometry.type === 'Point') {
          const [lon, lat] = feature.geometry.coordinates as [number, number];
          onPointDrawnRef.current(lat, lon);
          draw.removeFeatures([id]);
          draw.setMode('select');
          return;
        }

        if (!isCampusFeature) return;
        if (geometryEditLockedRef.current) return;

        if (
          (campusarKind === 'building' || campusarKind === 'area') &&
          feature.geometry.type === 'Polygon'
        ) {
          const ring = ringFromFeature(feature as GeoJSON.Feature);
          if (ring && ring.length >= 3) {
            onGeometryCommitRef.current({
              kind: campusarKind,
              id: campusarId,
              footprint: ring,
            });
          }
        } else if (campusarKind === 'node' && feature.geometry.type === 'Point') {
          const [lon, lat] = feature.geometry.coordinates as [number, number];
          onGeometryCommitRef.current({
            kind: 'node',
            id: campusarId,
            latitude: lat,
            longitude: lon,
          });
        }
      };
      draw.on('finish', onFinish);
    };
    map.on('load', onLoad);

    return () => {
      drawRef.current?.stop();
      drawRef.current = null;
      map.off('load', onLoad);
      if (import.meta.env.DEV) {
        const w = window as unknown as { __mapBuilderMap?: maplibregl.Map };
        if (w.__mapBuilderMap === map) delete w.__mapBuilderMap;
      }
      map.remove();
      mapRef.current = null;
    };
  }, [center]);

  useEffect(() => {
    const draw = drawRef.current;
    if (!draw) return;
    if (tool === 'building' || tool === 'area') draw.setMode('polygon');
    else if (tool === 'node' || tool === 'poi' || tool === 'entrance') draw.setMode('point');
    else draw.setMode('select');
  }, [tool]);

  // Load selected feature into Terra Draw for direct vertex/point manipulation
  useEffect(() => {
    const draw = drawRef.current;
    if (!draw) return;

    const clearEdit = () => {
      if (editFeatureIdsRef.current.length) {
        try {
          draw.removeFeatures(editFeatureIdsRef.current);
        } catch {
          /* feature may already be gone */
        }
        editFeatureIdsRef.current = [];
      }
    };

    clearEdit();
    if (tool !== 'select' || !selection || !('id' in selection)) return;
    if (geometryEditLocked) return;

    try {
      if (selection.kind === 'building') {
        const b = buildingsRef.current.find((x) => x.id === selection.id);
        if (!b?.footprint || b.footprint.length < 3) return;
        const results = draw.addFeatures([
          {
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: toPolygonCoords(b.footprint),
            },
            properties: {
              mode: 'polygon',
              campusarKind: 'building',
              campusarId: b.id,
            },
          },
        ]);
        const ids = results
          .map((r) => r.id)
          .filter((id): id is string | number => id !== undefined);
        editFeatureIdsRef.current = ids;
        if (ids[0] !== undefined) draw.selectFeature(ids[0]);
      } else if (selection.kind === 'area') {
        const a = areasRef.current.find((x) => x.id === selection.id);
        if (!a || a.footprint.length < 3) return;
        const results = draw.addFeatures([
          {
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: toPolygonCoords(a.footprint),
            },
            properties: {
              mode: 'polygon',
              campusarKind: 'area',
              campusarId: a.id,
            },
          },
        ]);
        const ids = results
          .map((r) => r.id)
          .filter((id): id is string | number => id !== undefined);
        editFeatureIdsRef.current = ids;
        if (ids[0] !== undefined) draw.selectFeature(ids[0]);
      } else if (selection.kind === 'node') {
        const n = nodesRef.current.find((x) => x.id === selection.id);
        if (!n) return;
        const results = draw.addFeatures([
          {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [n.longitude, n.latitude],
            },
            properties: {
              mode: 'point',
              campusarKind: 'node',
              campusarId: n.id,
            },
          },
        ]);
        const ids = results
          .map((r) => r.id)
          .filter((id): id is string | number => id !== undefined);
        editFeatureIdsRef.current = ids;
        if (ids[0] !== undefined) draw.selectFeature(ids[0]);
      }
    } catch {
      /* draw not ready */
    }

    return () => {
      clearEdit();
    };
  }, [geometryEditLocked, selection, tool]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    map.setFilter(
      'mapbuilder-walkway-start',
      walkFromId
        ? (['==', ['get', 'id'], walkFromId] as maplibregl.FilterSpecification)
        : (['==', ['get', 'id'], '__none__'] as maplibregl.FilterSpecification),
    );
  }, [walkFromId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const none = ['==', ['get', 'id'], '__none__'] as maplibregl.FilterSpecification;
    const idFilter = (id: string) => ['==', ['get', 'id'], id] as maplibregl.FilterSpecification;
    const kind = selection && 'id' in selection ? selection.kind : null;
    const id = selection && 'id' in selection ? selection.id : null;

    map.setFilter(
      'mapbuilder-sel-building-fill',
      kind === 'building' && id ? idFilter(id) : none,
    );
    map.setFilter(
      'mapbuilder-sel-building-line',
      kind === 'building' && id ? idFilter(id) : none,
    );
    map.setFilter(
      'mapbuilder-sel-building-point',
      kind === 'building' && id ? idFilter(id) : none,
    );
    map.setFilter('mapbuilder-sel-node', kind === 'node' && id ? idFilter(id) : none);
    map.setFilter('mapbuilder-sel-edge', kind === 'edge' && id ? idFilter(id) : none);
    map.setFilter('mapbuilder-sel-area-fill', kind === 'area' && id ? idFilter(id) : none);
    map.setFilter('mapbuilder-sel-area-line', kind === 'area' && id ? idFilter(id) : none);
  }, [selection]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const setVis = (layerId: string, visible: boolean) => {
      if (!map.getLayer(layerId)) return;
      map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
    };
    setVis('mapbuilder-buildings-fill', layerVisibility.buildings);
    setVis('mapbuilder-buildings-line', layerVisibility.buildings);
    setVis('mapbuilder-buildings-point', layerVisibility.buildings);
    setVis('mapbuilder-sel-building-fill', layerVisibility.buildings);
    setVis('mapbuilder-sel-building-line', layerVisibility.buildings);
    setVis('mapbuilder-sel-building-point', layerVisibility.buildings);
    setVis('mapbuilder-nodes-circle', layerVisibility.nodes);
    setVis('mapbuilder-walkway-start', layerVisibility.nodes);
    setVis('mapbuilder-sel-node', layerVisibility.nodes);
    setVis('mapbuilder-edges-line', layerVisibility.edges);
    setVis('mapbuilder-sel-edge', layerVisibility.edges);
    setVis('mapbuilder-areas-fill', layerVisibility.areas);
    setVis('mapbuilder-sel-area-fill', layerVisibility.areas);
    setVis('mapbuilder-sel-area-line', layerVisibility.areas);
  }, [layerVisibility]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (!selection || !('id' in selection)) return;

    const pad = 56;
    if (selection.kind === 'node') {
      const n = nodes.find((x) => x.id === selection.id);
      if (!n) return;
      map.flyTo({ center: [n.longitude, n.latitude], zoom: Math.max(map.getZoom(), 18), duration: 500 });
      return;
    }
    if (selection.kind === 'building') {
      const b = buildings.find((x) => x.id === selection.id);
      if (!b) return;
      if (b.footprint && b.footprint.length >= 3) {
        const bounds = new maplibregl.LngLatBounds();
        for (const p of b.footprint) bounds.extend([p.longitude, p.latitude]);
        map.fitBounds(bounds, { padding: pad, maxZoom: 19, duration: 500 });
      } else {
        map.flyTo({
          center: [b.longitude, b.latitude],
          zoom: Math.max(map.getZoom(), 18),
          duration: 500,
        });
      }
      return;
    }
    if (selection.kind === 'edge') {
      const e = edges.find((x) => x.id === selection.id);
      if (!e) return;
      const from = nodes.find((n) => n.id === e.fromNodeId);
      const to = nodes.find((n) => n.id === e.toNodeId);
      if (!from || !to) return;
      const bounds = new maplibregl.LngLatBounds(
        [from.longitude, from.latitude],
        [to.longitude, to.latitude],
      );
      map.fitBounds(bounds, { padding: pad, maxZoom: 19, duration: 500 });
      return;
    }
    if (selection.kind === 'area') {
      const a = areas.find((x) => x.id === selection.id);
      if (!a?.footprint?.length) return;
      const bounds = new maplibregl.LngLatBounds();
      for (const p of a.footprint) bounds.extend([p.longitude, p.latitude]);
      map.fitBounds(bounds, { padding: pad, maxZoom: 19, duration: 500 });
    }
  }, [selection, buildings, nodes, edges, areas]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const setSource = (id: string, data: GeoJSON.FeatureCollection) => {
      const source = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
      source?.setData(data);
    };
    setSource('mapbuilder-buildings', buildingsGeo);
    setSource('mapbuilder-edges', edgesGeo);
    setSource('mapbuilder-nodes', nodesGeo);
    setSource('mapbuilder-areas', areasGeo);
    setSource('mapbuilder-issue-badges', issueBadgesGeo);
  }, [areasGeo, buildingsGeo, edgesGeo, nodesGeo, issueBadgesGeo]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    applyMapLibreBasemap(map, basemapMode);
  }, [basemapMode]);

  return <div ref={containerRef} className="h-full w-full" />;
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
  const [layerVisibility, setLayerVisibility] = useState<LayerVisibility>(DEFAULT_LAYER_VISIBILITY);
  const [rightPanelMode, setRightPanelMode] = useState<'inspector' | 'issues'>('inspector');
  const [clientIssues, setClientIssues] = useState<MapValidationIssue[]>([]);
  const [validationPending, setValidationPending] = useState(false);
  const [inspectorAutosave, setInspectorAutosave] = useState<StatusAutosave>('idle');
  const validationTimerRef = useRef<number | null>(null);
  const skipNextValidationDebounceRef = useRef(true);
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
  const reloadGenerationRef = useRef(0);
  const geometrySaveTimerRef = useRef<number | null>(null);
  const [attachFootprintBuildingId, setAttachFootprintBuildingId] = useState<string | null>(null);
  const [conflict, setConflict] = useState<InspectorSaveConflict | null>(null);
  const [conflictBusy, setConflictBusy] = useState(false);

  const center = useMemo(() => siteMapCenter(site), [site]);

  const fitPoints = useMemo((): [number, number][] => {
    const pts: [number, number][] = [];
    for (const b of buildings) {
      if (b.footprint?.length) pts.push(...ringToLatLngsLocal(b.footprint));
      else pts.push([b.latitude, b.longitude]);
    }
    for (const n of nodes) pts.push([n.latitude, n.longitude]);
    for (const a of areas) pts.push(...ringToLatLngsLocal(a.footprint));
    return pts;
  }, [buildings, nodes, areas]);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    setSaveStatus('unsaved');
  }, []);

  const refreshValidation = useCallback(async () => {
    if (!token || !draftVersion?.id) return;
    setValidateBusy(true);
    try {
      const val = await api.mapBuilder.validateVersion(draftVersion.id, token);
      setValidation(val);
      setValidationPending(false);
    } catch {
      /* keep prior validation snapshot */
    } finally {
      setValidateBusy(false);
    }
  }, [token, draftVersion?.id]);

  const scheduleServerValidation = useCallback(() => {
    if (validationTimerRef.current) window.clearTimeout(validationTimerRef.current);
    setValidationPending(true);
    validationTimerRef.current = window.setTimeout(() => {
      void refreshValidation();
    }, 1500);
  }, [refreshValidation]);

  useEffect(() => {
    setClientIssues(computeClientValidationIssues(buildings, nodes, edges));
  }, [buildings, nodes, edges]);

  useEffect(() => {
    if (loading || !draftVersion?.id) return;
    if (skipNextValidationDebounceRef.current) {
      skipNextValidationDebounceRef.current = false;
      return;
    }
    scheduleServerValidation();
    return () => {
      if (validationTimerRef.current) window.clearTimeout(validationTimerRef.current);
    };
  }, [buildings, nodes, edges, areas, draftVersion?.id, loading, scheduleServerValidation]);

  const mapIssueBadges = useMemo(() => {
    const source = validationPending
      ? clientIssues
      : (validation?.issues ?? clientIssues);
    return issueBadgePoints(source, buildings, nodes, edges);
  }, [validationPending, clientIssues, validation, buildings, nodes, edges]);

  const displayIssueCounts = useMemo(() => {
    if (!validationPending && validation) {
      return {
        errors: validation.summary.errors,
        warnings: validation.summary.warnings,
        blockers: validation.issues.filter((i) => i.level === 'error'),
      };
    }
    const key = (i: MapValidationIssue) =>
      `${i.resourceType ?? ''}:${i.resourceId ?? ''}:${i.code.replace(/^CLIENT_/, '')}`;
    const map = new Map<string, MapValidationIssue>();
    for (const i of validation?.issues ?? []) map.set(key(i), i);
    for (const i of clientIssues) {
      const k = key(i);
      if (!map.has(k)) map.set(k, i);
    }
    const list = [...map.values()];
    return {
      errors: list.filter((i) => i.level === 'error').length,
      warnings: list.filter((i) => i.level === 'warning').length,
      blockers: list.filter((i) => i.level === 'error'),
    };
  }, [validationPending, clientIssues, validation]);

  const handleValidationIssue = useCallback((issue: MapValidationIssue, opts?: { openInspector?: boolean }) => {
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
    if (opts?.openInspector) setRightPanelMode('inspector');
  }, []);

  const handleValidateDraft = useCallback(async () => {
    if (!token || !draftVersion) return;
    setPublishSuccess(null);
    setValidationPending(true);
    await refreshValidation();
  }, [token, draftVersion, refreshValidation]);

  const reload = useCallback(async () => {
    if (!token) return;
    const siteId = useSiteStore.getState().activeSiteId;
    if (!siteId) return;
    const generation = ++reloadGenerationRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const snap = await api.mapBuilder.snapshot(token);
      if (generation !== reloadGenerationRef.current) return;
      setBuildings(snap.buildings);
      setNodes(snap.nodes);
      setEdges(snap.edges);
      setAreas(snap.areas);
      setDraftVersion(snap.version);
      dirtyRef.current = false;
      setSaveStatus('idle');
      skipNextValidationDebounceRef.current = true;
      const val = await api.mapBuilder.validateVersion(snap.version.id, token);
      if (generation !== reloadGenerationRef.current) return;
      setValidation(val);
      setValidationPending(false);
      setLoadError(null);
    } catch (err) {
      if (generation !== reloadGenerationRef.current) return;
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load site map data');
    } finally {
      if (generation === reloadGenerationRef.current) setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as {
      __mapBuilderDebug?: {
        simulateDanglingEdge: () => string | null;
        restoreSimulatedNode: () => void;
        forceCleanValidation: () => void;
        getIssueDebug: () => {
          clientCodes: string[];
          serverCodes: string[];
          pending: boolean;
          badgeCount: number;
          errorCount: number;
          warningCount: number;
          rightPanelMode: string;
          autosave: string;
        };
      };
    };
    let removed: GraphNode | null = null;
    w.__mapBuilderDebug = {
      simulateDanglingEdge: () => {
        const connected = edges.find((e) => nodes.some((n) => n.id === e.fromNodeId || n.id === e.toNodeId));
        if (!connected) return null;
        const dropId = nodes.some((n) => n.id === connected.fromNodeId)
          ? connected.fromNodeId
          : connected.toNodeId;
        const victim = nodes.find((n) => n.id === dropId);
        if (!victim) return null;
        removed = victim;
        setNodes((prev) => prev.filter((n) => n.id !== dropId));
        return dropId;
      },
      restoreSimulatedNode: () => {
        if (!removed) return;
        const node = removed;
        removed = null;
        setNodes((prev) => (prev.some((n) => n.id === node.id) ? prev : [...prev, node]));
      },
      forceCleanValidation: () => {
        if (!draftVersion) return;
        if (validationTimerRef.current) window.clearTimeout(validationTimerRef.current);
        setValidationPending(false);
        setValidation({
          version: {
            id: draftVersion.id,
            versionNumber: draftVersion.versionNumber,
            status: draftVersion.status,
            label: draftVersion.label,
          },
          valid: true,
          summary: { errors: 0, warnings: 0 },
          issues: [],
        });
      },
      getIssueDebug: () => ({
        clientCodes: clientIssues.map((i) => i.code),
        serverCodes: (validation?.issues ?? []).map((i) => i.code),
        pending: validationPending,
        badgeCount: mapIssueBadges.length,
        errorCount: displayIssueCounts.errors,
        warningCount: displayIssueCounts.warnings,
        rightPanelMode,
        autosave: inspectorAutosave,
        conflict: conflict
          ? { kind: conflict.kind, id: conflict.id, message: conflict.message }
          : null,
      }),
    };
    return () => {
      delete w.__mapBuilderDebug;
    };
  }, [
    edges,
    nodes,
    clientIssues,
    validation,
    validationPending,
    mapIssueBadges,
    displayIssueCounts,
    rightPanelMode,
    inspectorAutosave,
    draftVersion,
    conflict,
  ]);

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
    setConflict(null);
    setAttachFootprintBuildingId(null);
    void reload();
  }, [activeSiteId, reload]);

  const applyConflictLeaveDefault = useCallback(
    async (leaving: InspectorSaveConflict) => {
      // Unresolved conflict when navigating away → treat as Reload remote
      if (!token) {
        setConflict(null);
        return;
      }
      try {
        const snap = await api.mapBuilder.snapshot(token);
        if (leaving.kind === 'building') {
          const remote = snap.buildings.find((b) => b.id === leaving.id);
          if (remote) setBuildings((prev) => prev.map((b) => (b.id === remote.id ? remote : b)));
        } else if (leaving.kind === 'node') {
          const remote = snap.nodes.find((n) => n.id === leaving.id);
          if (remote) setNodes((prev) => prev.map((n) => (n.id === remote.id ? remote : n)));
        } else if (leaving.kind === 'edge') {
          const remote = snap.edges.find((e) => e.id === leaving.id);
          if (remote) setEdges((prev) => prev.map((e) => (e.id === remote.id ? remote : e)));
        } else if (leaving.kind === 'area') {
          const remote = snap.areas.find((a) => a.id === leaving.id);
          if (remote) setAreas((prev) => prev.map((a) => (a.id === remote.id ? remote : a)));
        }
      } catch {
        /* keep local until next reload */
      }
      setConflict(null);
    },
    [token],
  );

  const handleSiteChange = (siteId: string) => {
    if (conflict) void applyConflictLeaveDefault(conflict);
    setActiveSiteId(siteId);
  };

  const selectResource = (next: Selection) => {
    if (
      conflict &&
      next &&
      'id' in next &&
      (next.kind !== conflict.kind || next.id !== conflict.id)
    ) {
      void applyConflictLeaveDefault(conflict);
    } else if (conflict && next === null) {
      void applyConflictLeaveDefault(conflict);
    }
    setSelection(next);
  };

  const scheduleGeometrySave = useCallback(
    (commit: GeometryCommit) => {
      if (conflict) return;
      if (geometrySaveTimerRef.current) window.clearTimeout(geometrySaveTimerRef.current);
      setSaveStatus('unsaved');
      setInspectorAutosave('pending');
      geometrySaveTimerRef.current = window.setTimeout(() => {
        void (async () => {
          if (!token) return;
          setSaveStatus('saving');
          setInspectorAutosave('saving');
          try {
            if (commit.kind === 'building') {
              const building = buildings.find((b) => b.id === commit.id);
              const updated = await api.mapBuilder.updateBuilding(
                commit.id,
                {
                  footprint: commit.footprint,
                  expectedUpdatedAt: building?.updatedAt,
                },
                token,
              );
              setBuildings((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
            } else if (commit.kind === 'area') {
              const updated = await api.mapBuilder.updateArea(
                commit.id,
                { footprint: commit.footprint },
                token,
              );
              setAreas((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
            } else {
              const updated = await api.mapBuilder.updateNode(
                commit.id,
                { latitude: commit.latitude, longitude: commit.longitude },
                token,
              );
              setNodes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
            }
            setSaveStatus('saved');
            setInspectorAutosave('saved');
            dirtyRef.current = false;
          } catch (err) {
            setSaveStatus('error');
            setInspectorAutosave('error');
            if (err instanceof ApiError && err.status === 409) {
              const patch =
                commit.kind === 'building'
                  ? { footprint: commit.footprint }
                  : commit.kind === 'area'
                    ? { footprint: commit.footprint }
                    : { latitude: commit.latitude, longitude: commit.longitude };
              setConflict({
                kind: commit.kind,
                id: commit.id,
                localPatch: patch,
                message: err.message,
              });
              setSelection({ kind: commit.kind, id: commit.id });
              setRightPanelMode('inspector');
              return;
            }
            setError(err instanceof ApiError ? err.message : 'Could not save geometry');
          }
        })();
      }, 800);
    },
    [buildings, conflict, token],
  );

  const handleConflictReloadRemote = useCallback(async () => {
    if (!token || !conflict) return;
    setConflictBusy(true);
    try {
      const snap = await api.mapBuilder.snapshot(token);
      if (conflict.kind === 'building') {
        const remote = snap.buildings.find((b) => b.id === conflict.id);
        if (remote) setBuildings((prev) => prev.map((b) => (b.id === remote.id ? remote : b)));
      } else if (conflict.kind === 'node') {
        const remote = snap.nodes.find((n) => n.id === conflict.id);
        if (remote) setNodes((prev) => prev.map((n) => (n.id === remote.id ? remote : n)));
      } else if (conflict.kind === 'edge') {
        const remote = snap.edges.find((e) => e.id === conflict.id);
        if (remote) setEdges((prev) => prev.map((e) => (e.id === remote.id ? remote : e)));
      } else if (conflict.kind === 'area') {
        const remote = snap.areas.find((a) => a.id === conflict.id);
        if (remote) setAreas((prev) => prev.map((a) => (a.id === remote.id ? remote : a)));
      }
      setConflict(null);
      setSaveStatus('saved');
      setInspectorAutosave('saved');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reload feature');
    } finally {
      setConflictBusy(false);
    }
  }, [conflict, token]);

  const handleConflictRetryLocal = useCallback(async () => {
    if (!token || !conflict) return;
    setConflictBusy(true);
    try {
      const snap = await api.mapBuilder.snapshot(token);
      const patch = { ...conflict.localPatch };
      if (conflict.kind === 'building') {
        const remote = snap.buildings.find((b) => b.id === conflict.id);
        if (!remote) throw new Error('Building no longer exists');
        patch.expectedUpdatedAt = remote.updatedAt;
        const updated = await api.mapBuilder.updateBuilding(
          conflict.id,
          patch as Partial<Building> & { expectedUpdatedAt?: string },
          token,
        );
        setBuildings((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
      } else if (conflict.kind === 'node') {
        const updated = await api.mapBuilder.updateNode(conflict.id, patch, token);
        setNodes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      } else if (conflict.kind === 'edge') {
        const updated = await api.mapBuilder.updateEdge(
          conflict.id,
          patch as Partial<GraphEdge>,
          token,
        );
        setEdges((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
      } else {
        const updated = await api.mapBuilder.updateArea(
          conflict.id,
          patch as Partial<SiteArea>,
          token,
        );
        setAreas((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      }
      setConflict(null);
      setSaveStatus('saved');
      setInspectorAutosave('saved');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setConflict((c) => (c ? { ...c, message: err.message } : c));
      } else {
        setError(err instanceof ApiError ? err.message : 'Retry failed');
      }
    } finally {
      setConflictBusy(false);
    }
  }, [conflict, token]);

  const handleConflictDuplicate = useCallback(async () => {
    if (!token || !conflict) return;
    setConflictBusy(true);
    try {
      const snap = await api.mapBuilder.snapshot(token);
      if (conflict.kind === 'building') {
        const remote = snap.buildings.find((b) => b.id === conflict.id);
        if (!remote) throw new Error('Building no longer exists');
        const name =
          typeof conflict.localPatch.name === 'string' ? conflict.localPatch.name : remote.name;
        const code =
          typeof conflict.localPatch.code === 'string' ? conflict.localPatch.code : remote.code;
        const footprint = Array.isArray(conflict.localPatch.footprint)
          ? (conflict.localPatch.footprint as GeoPoint[])
          : remote.footprint;
        const created = await api.mapBuilder.createBuilding(
          {
            name: `${name} (copy)`,
            code: `${code}-COPY`,
            description: remote.description,
            latitude: remote.latitude,
            longitude: remote.longitude,
            floorsCount: remote.floorsCount,
            footprint: footprint?.length ? footprint : undefined,
          },
          token,
        );
        setBuildings((prev) => [...prev, created]);
        // Keep original at remote state
        setBuildings((prev) => prev.map((b) => (b.id === remote.id ? remote : b)));
        setSelection({ kind: 'building', id: created.id });
      } else if (conflict.kind === 'node') {
        const remote = snap.nodes.find((n) => n.id === conflict.id);
        if (!remote) throw new Error('Node no longer exists');
        const created = await api.mapBuilder.createNode(
          {
            name:
              conflict.localPatch.name !== undefined
                ? (conflict.localPatch.name as string | null)
                : remote.name,
            latitude:
              typeof conflict.localPatch.latitude === 'number'
                ? conflict.localPatch.latitude
                : remote.latitude,
            longitude:
              typeof conflict.localPatch.longitude === 'number'
                ? conflict.localPatch.longitude
                : remote.longitude,
            floorId: remote.floorId,
            buildingId:
              conflict.localPatch.buildingId !== undefined
                ? (conflict.localPatch.buildingId as string | null)
                : remote.buildingId,
            kind:
              typeof conflict.localPatch.kind === 'string'
                ? (conflict.localPatch.kind as GraphNode['kind'])
                : remote.kind,
          },
          token,
        );
        setNodes((prev) => [...prev, created]);
        setNodes((prev) => prev.map((n) => (n.id === remote.id ? remote : n)));
        setSelection({ kind: 'node', id: created.id });
      } else if (conflict.kind === 'area') {
        const remote = snap.areas.find((a) => a.id === conflict.id);
        if (!remote) throw new Error('Area no longer exists');
        const created = await api.mapBuilder.createArea(
          {
            name:
              typeof conflict.localPatch.name === 'string'
                ? `${conflict.localPatch.name} (copy)`
                : `${remote.name} (copy)`,
            type:
              typeof conflict.localPatch.type === 'string'
                ? (conflict.localPatch.type as SiteArea['type'])
                : remote.type,
            footprint: Array.isArray(conflict.localPatch.footprint)
              ? (conflict.localPatch.footprint as GeoPoint[])
              : remote.footprint,
          },
          token,
        );
        setAreas((prev) => [...prev, created]);
        setAreas((prev) => prev.map((a) => (a.id === remote.id ? remote : a)));
        setSelection({ kind: 'area', id: created.id });
      } else {
        // Edges: duplicate by creating a new edge with same endpoints + local attrs
        const remote = snap.edges.find((e) => e.id === conflict.id);
        if (!remote) throw new Error('Edge no longer exists');
        const created = await api.mapBuilder.createEdge(
          {
            fromNodeId: remote.fromNodeId,
            toNodeId: remote.toNodeId,
            distanceM:
              typeof conflict.localPatch.distanceM === 'number'
                ? conflict.localPatch.distanceM
                : remote.distanceM,
            kind: remote.kind,
            bidirectional: remote.bidirectional,
            blocked:
              typeof conflict.localPatch.blocked === 'boolean'
                ? conflict.localPatch.blocked
                : remote.blocked,
            safetyScore: remote.safetyScore,
            crowdScore: remote.crowdScore,
            accessibilityScore:
              typeof conflict.localPatch.accessibilityScore === 'number'
                ? conflict.localPatch.accessibilityScore
                : remote.accessibilityScore,
            siteId: remote.siteId,
          },
          token,
        );
        setEdges((prev) => [...prev, created]);
        setEdges((prev) => prev.map((e) => (e.id === remote.id ? remote : e)));
        setSelection({ kind: 'edge', id: created.id });
      }
      setConflict(null);
      setSaveStatus('saved');
      setInspectorAutosave('saved');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not duplicate feature');
    } finally {
      setConflictBusy(false);
    }
  }, [conflict, token]);

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
          if (err instanceof ApiError && err.status === 409) {
            setConflict({
              kind: 'building',
              id: attachFootprintBuildingId,
              localPatch: { footprint: ring },
              message: err.message,
            });
            setSaveStatus('error');
            setRightPanelMode('inspector');
          } else {
            setError(err instanceof ApiError ? err.message : 'Could not save footprint');
            setSaveStatus('error');
          }
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (!selection) return;
      event.preventDefault();
      void deleteSelected();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selection, deleteSelected]);

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
        <aside
          className={`shrink-0 overflow-y-auto border-r border-line bg-paper p-3 ${
            MAP_ENGINE === 'maplibre' ? 'w-72' : 'w-52'
          }`}
        >
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
          {MAP_ENGINE === 'maplibre' ? (
            <MapBuilderLayersPanel
              buildings={buildings}
              nodes={nodes}
              edges={edges}
              areas={areas}
              visibility={layerVisibility}
              onVisibilityChange={setLayerVisibility}
              selection={
                selection &&
                (selection.kind === 'building' ||
                  selection.kind === 'node' ||
                  selection.kind === 'edge' ||
                  selection.kind === 'area')
                  ? (selection as FeatureSelection)
                  : null
              }
              onSelect={(next) => {
                if (!next) {
                  setSelection(null);
                  return;
                }
                void selectResource(next);
              }}
            />
          ) : (
            <>
              <p className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-muted">
                Layers
              </p>
              <div className="space-y-1 text-xs text-muted">
                <div className="flex items-center gap-2">
                  <Layers className="h-3.5 w-3.5" /> Buildings ({buildings.length})
                </div>
                <div>Nodes ({nodes.length})</div>
                <div>Walkways ({edges.length})</div>
                <div>Areas ({areas.length})</div>
              </div>
            </>
          )}
        </aside>

        <div className="relative min-w-0 flex-1">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted">Loading map…</div>
          ) : loadError ? (
            <div className="flex h-full items-center justify-center p-6 text-sm text-danger">{loadError}</div>
          ) : (
            MAP_ENGINE === 'maplibre' ? (
              <>
                <BasemapModeSwitcher mode={basemap} onChange={setBasemap} />
                <MapLibreCanvas
                  center={center}
                  buildings={buildings}
                  nodes={nodes}
                  edges={edges}
                  areas={areas}
                  tool={tool}
                  walkFromId={walkFrom}
                  selection={selection}
                  layerVisibility={layerVisibility}
                  issueBadges={mapIssueBadges}
                  conflictFeatureId={conflict?.id ?? null}
                  geometryEditLocked={Boolean(conflict)}
                  basemapMode={basemap}
                  onSelect={(s) => selectResource(s)}
                  onNodeWalkwayClick={handleWalkwayClick}
                  onPointDrawn={(lat, lon) => void handleMapClick(lat, lon)}
                  onPolygonDrawn={(ring) => void onPolygonDrawn(ring)}
                  onGeometryCommit={scheduleGeometrySave}
                />
              </>
            ) : (
              <MapContainer center={center} zoom={CAMPUS_DEFAULT_ZOOM} maxZoom={CAMPUS_MAX_ZOOM} className="h-full w-full">
                <RealBasemapTiles mode={basemap} />
                <BasemapModeSwitcher mode={basemap} onChange={setBasemap} />
                <RecenterOnSite center={center} />
                <FitSiteData center={center} points={fitPoints} />
                <GeomanDrawLayer tool={tool} onPolygon={onPolygonDrawn} />
                {selection?.kind === 'building' && !conflict ? (
                  (() => {
                    const b = buildings.find((x) => x.id === selection.id);
                    if (!b?.footprint?.length) return null;
                    return (
                      <EditableFootprintLayer
                        key={`${b.id}:${b.updatedAt ?? '0'}`}
                        footprint={b.footprint}
                        onCommit={(ring) =>
                          scheduleGeometrySave({ kind: 'building', id: b.id, footprint: ring })
                        }
                      />
                    );
                  })()
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
                      color:
                        conflict?.id === a.id
                          ? '#dc2626'
                          : a.type === 'restricted'
                            ? '#dc2626'
                            : '#2563eb',
                      fillOpacity: 0.15,
                      weight:
                        conflict?.id === a.id || (selection?.kind === 'area' && selection.id === a.id)
                          ? 3
                          : 1,
                    }}
                    eventHandlers={{ click: () => selectResource({ kind: 'area', id: a.id }) }}
                  />
                ))}

                {buildings.map((b) => {
                  if (selection?.kind === 'building' && selection.id === b.id && b.footprint?.length)
                    return null;
                  return b.footprint && b.footprint.length >= 3 ? (
                    <Polygon
                      key={b.id}
                      positions={ringToLatLngsLocal(b.footprint)}
                      pathOptions={{
                        color: conflict?.id === b.id ? '#dc2626' : '#0F6B63',
                        fillOpacity: 0.25,
                        weight:
                          conflict?.id === b.id ||
                          (selection?.kind === 'building' && selection.id === b.id)
                            ? 3
                            : 1,
                      }}
                      eventHandlers={{
                        click: () => selectResource({ kind: 'building', id: b.id }),
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
                      pathOptions={{
                        color: conflict?.id === b.id ? '#dc2626' : '#0F6B63',
                        fillColor: conflict?.id === b.id ? '#dc2626' : '#0F6B63',
                        fillOpacity: 0.8,
                      }}
                      eventHandlers={{
                        click: () => selectResource({ kind: 'building', id: b.id }),
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
            )
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

        <aside className="flex w-80 shrink-0 flex-col overflow-hidden border-l border-line bg-paper">
          {MAP_ENGINE === 'maplibre' ? (
            <div className="flex gap-1 border-b border-line p-2">
              <button
                type="button"
                className={`flex-1 rounded px-2 py-1.5 text-xs font-semibold ${
                  rightPanelMode === 'inspector'
                    ? 'bg-accent/15 text-accent'
                    : 'text-ink-mute hover:bg-paper-raised'
                }`}
                onClick={() => setRightPanelMode('inspector')}
              >
                Inspector
              </button>
              <button
                type="button"
                className={`flex-1 rounded px-2 py-1.5 text-xs font-semibold ${
                  rightPanelMode === 'issues'
                    ? 'bg-accent/15 text-accent'
                    : 'text-ink-mute hover:bg-paper-raised'
                }`}
                data-tab="issues"
                onClick={() => setRightPanelMode('issues')}
              >
                Issues
                {displayIssueCounts.errors + displayIssueCounts.warnings > 0
                  ? ` (${displayIssueCounts.errors + displayIssueCounts.warnings})`
                  : ''}
              </button>
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {conflict ? (
            <div className="mb-4">
              <MapBuilderConflictDialog
                open
                featureLabel={`${conflict.kind} · ${conflict.id.slice(0, 8)}…`}
                message={conflict.message}
                busy={conflictBusy}
                onReloadRemote={() => void handleConflictReloadRemote()}
                onRetryLocal={() => void handleConflictRetryLocal()}
                onDuplicate={() => void handleConflictDuplicate()}
              />
            </div>
          ) : null}
          {MAP_ENGINE === 'maplibre' && rightPanelMode === 'issues' ? (
            <MapBuilderIssuesPanel
              validation={validation}
              clientIssues={clientIssues}
              pending={validationPending}
              validateBusy={validateBusy}
              onReCheck={() => void handleValidateDraft()}
              onSelectIssue={handleValidationIssue}
            />
          ) : MAP_ENGINE === 'maplibre' &&
          (!selection ||
            selection.kind === 'building' ||
            selection.kind === 'node' ||
            selection.kind === 'edge' ||
            selection.kind === 'area') ? (
            <div className="space-y-4">
              <MapBuilderInspectorPanel
                selection={
                  selection &&
                  (selection.kind === 'building' ||
                    selection.kind === 'node' ||
                    selection.kind === 'edge' ||
                    selection.kind === 'area')
                    ? selection
                    : null
                }
                buildings={buildings}
                nodes={nodes}
                edges={edges}
                areas={areas}
                conflictFeatureId={conflict?.id ?? null}
                onAutosaveStatusChange={setInspectorAutosave}
                onConflict={(c) => {
                  setConflict(c);
                  setRightPanelMode('inspector');
                }}
                onSavedBuilding={(b) =>
                  setBuildings((prev) => prev.map((x) => (x.id === b.id ? b : x)))
                }
                onSavedNode={(n) => setNodes((prev) => prev.map((x) => (x.id === n.id ? n : x)))}
                onSavedEdge={(e) => setEdges((prev) => prev.map((x) => (x.id === e.id ? e : x)))}
                onSavedArea={(a) => setAreas((prev) => prev.map((x) => (x.id === a.id ? a : x)))}
                onDelete={deleteSelected}
                save={async ({ kind, id, patch }) => {
                  if (!token) throw new Error('Not signed in');
                  setSaveStatus('saving');
                  try {
                    if (kind === 'building') {
                      const updated = await api.mapBuilder.updateBuilding(
                        id,
                        patch as Partial<Building> & { expectedUpdatedAt?: string },
                        token,
                      );
                      setSaveStatus('saved');
                      return updated;
                    }
                    if (kind === 'node') {
                      const updated = await api.mapBuilder.updateNode(id, patch, token);
                      setSaveStatus('saved');
                      return updated;
                    }
                    if (kind === 'edge') {
                      const updated = await api.mapBuilder.updateEdge(
                        id,
                        patch as Partial<GraphEdge>,
                        token,
                      );
                      setSaveStatus('saved');
                      return updated;
                    }
                    const updated = await api.mapBuilder.updateArea(
                      id,
                      patch as Partial<SiteArea>,
                      token,
                    );
                    setSaveStatus('saved');
                    return updated;
                  } catch (err) {
                    setSaveStatus('error');
                    throw err;
                  }
                }}
              />
              {selection?.kind === 'building' ? (
                <BuildingGeometryControls
                  building={buildings.find((b) => b.id === selection.id)}
                  onAttachFootprint={(buildingId) => {
                    setAttachFootprintBuildingId(buildingId);
                    setTool('building');
                  }}
                />
              ) : null}
            </div>
          ) : (
            <PropertiesPanel
              selection={selection}
              buildings={buildings}
              nodes={nodes}
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
                    const updated = await api.mapBuilder.updateBuilding(
                      id,
                      patch as Partial<Building> & { expectedUpdatedAt?: string },
                      token,
                    );
                    setBuildings((prev) => prev.map((b) => (b.id === id ? updated : b)));
                  } else if (kind === 'node') {
                    const updated = await api.mapBuilder.updateNode(id, patch, token);
                    setNodes((prev) => prev.map((n) => (n.id === id ? updated : n)));
                  }
                  setSaveStatus('saved');
                  void refreshValidation();
                } catch (err) {
                  if (err instanceof ApiError && err.status === 409) {
                    setConflict({
                      kind,
                      id,
                      localPatch: patch,
                      message: err.message,
                    });
                  } else {
                    setError(err instanceof ApiError ? err.message : 'Update failed');
                  }
                  setSaveStatus('error');
                }
              }}
              onDelete={deleteSelected}
            />
          )}
          {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
          {publishSuccess ? <p className="mt-3 text-sm font-semibold text-accent">{publishSuccess}</p> : null}
          {MAP_ENGINE !== 'maplibre' ? (
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
          ) : null}
          {MAP_ENGINE !== 'maplibre' ? (
            <ValidationPanel validation={validation} onSelectIssue={handleValidationIssue} />
          ) : null}
          </div>
        </aside>
      </div>
      {MAP_ENGINE === 'maplibre' ? (
        <MapBuilderStatusBar
          autosave={
            inspectorAutosave === 'pending' || inspectorAutosave === 'saving'
              ? inspectorAutosave
              : saveStatus === 'saving'
                ? 'saving'
                : saveStatus === 'error'
                  ? 'error'
                  : saveStatus === 'saved' || inspectorAutosave === 'saved'
                    ? 'saved'
                    : saveStatus === 'unsaved'
                      ? 'unsaved'
                      : 'idle'
          }
          errorCount={displayIssueCounts.errors}
          warningCount={displayIssueCounts.warnings}
          onOpenIssues={() => setRightPanelMode('issues')}
          publishDisabled={
            !draftVersion || publishBusy || displayIssueCounts.errors > 0
          }
          publishBusy={publishBusy}
          publishBlockers={displayIssueCounts.blockers}
          onPublish={() => setPublishDialogOpen(true)}
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

function BuildingGeometryControls({
  building,
  onAttachFootprint,
}: {
  building: Building | undefined;
  onAttachFootprint: (buildingId: string) => void;
}) {
  if (!building) return null;
  return (
    <div className="space-y-2 border-t border-line pt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Geometry</p>
      {building.footprint?.length ? (
        <p className="text-xs text-muted">
          Drag footprint vertices on the map — changes autosave after you release.
        </p>
      ) : (
        <button
          type="button"
          className="btn-secondary inline-flex w-full items-center justify-center gap-2"
          onClick={() => onAttachFootprint(building.id)}
        >
          Draw footprint
        </button>
      )}
    </div>
  );
}

function PropertiesPanel({
  selection,
  buildings,
  nodes,
  onAttachFootprint,
  onSaveBuilding,
  onSaveArea,
  onUpdate,
  onDelete,
}: {
  selection: Selection;
  buildings: Building[];
  nodes: GraphNode[];
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
              ? `${b.footprint.length} footprint vertices · drag on map to edit (autosaves)`
              : 'Legacy point building — draw a footprint to enable polygon rendering'
          }
        />
        {b.footprint?.length ? (
          <p className="text-xs text-muted">Drag footprint vertices on the map — changes autosave after you release.</p>
        ) : (
          <button
            type="button"
            className="btn-secondary inline-flex w-full items-center justify-center gap-2"
            onClick={() => onAttachFootprint(b.id)}
          >
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
