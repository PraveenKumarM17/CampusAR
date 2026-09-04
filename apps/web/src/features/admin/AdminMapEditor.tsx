/**
 * @deprecated Legacy outdoor map editor (Phase 2.5A). Use /admin/map-builder instead.
 * Retained temporarily for reference; no longer mounted from AdminPage.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  MapContainer,
  CircleMarker,
  Circle,
  Marker,
  Polyline,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import type { LeafletEvent } from 'leaflet';
import { GitCommitHorizontal, LocateFixed, MapPin, Route, Scissors, Trash2, Waypoints } from 'lucide-react';
import type { GraphEdge, GraphNode } from '@campusar/shared';
import { api, ApiError } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { useGeolocation } from '../../hooks/useGeolocation';
import { CAMPUS_DEFAULT_ZOOM, CAMPUS_MAX_ZOOM } from '../../lib/campus';
import { haversineMeters } from '../../lib/geo';
import { cycleClosedByNewEdge, findRoutePath } from '../../lib/pathCircuit';
import {
  BasemapModeSwitcher,
  RealBasemapTiles,
  type BasemapMode,
} from '../../components/maps/RealBasemap';
import { RecenterOnSite } from '../../components/maps/GpsTracker';
import { useActiveSite } from '../../hooks/useActiveSite';

type Tool = 'pin-live' | 'pin-click' | 'draw' | 'add-bend' | 'break-segment' | 'break-route';

type PinDetails = {
  name: string;
  kind: GraphNode['kind'];
  notes: string;
};

/** In-progress route: start (place or bend) → optional new bends → end (place or bend) */
type RouteSketch = {
  startId: string;
  bends: { lat: number; lon: number }[];
  cursor: { lat: number; lon: number } | null;
};

type ConfirmState =
  | { type: 'remove-one'; id: string; label: string }
  | { type: 'remove-all'; count: number }
  | { type: 'break-edge'; id: string; label: string }
  | { type: 'remove-bend'; id: string; label: string }
  | {
      type: 'break-route';
      fromId: string;
      toId: string;
      label: string;
      edgeIds: string[];
      bendIds: string[];
    }
  | null;

/** During Draw, treat a map click within this distance as selecting that pin/bend. */
const DRAW_SNAP_M = 16;
/** Max distance from a click to snap onto an existing path when adding a bend. */
const ADD_BEND_SNAP_M = 28;
const PIN_AUTOSAVE_MS = 700;

const KIND_OPTIONS: { value: GraphNode['kind']; label: string }[] = [
  { value: 'outdoor', label: 'Outdoor place' },
  { value: 'entrance', label: 'Entrance / gate' },
  { value: 'indoor', label: 'Indoor' },
  { value: 'exit', label: 'Emergency exit' },
  { value: 'elevator', label: 'Elevator' },
  { value: 'stairs', label: 'Stairs' },
  { value: 'ramp', label: 'Ramp' },
];

const BEND_ICON = L.divIcon({
  className: 'admin-map-pin admin-bend-pin',
  html: '<div class="admin-bend-dot"></div>',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const BEND_ICON_SELECTED = L.divIcon({
  className: 'admin-map-pin admin-bend-pin',
  html: '<div class="admin-bend-dot admin-bend-dot-selected"></div>',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

function stopMapPropagation(e: LeafletEvent) {
  // Stop Leaflet + DOM bubbling so map click handlers do not also fire.
  L.DomEvent.stopPropagation(e as unknown as Event);
  if ('originalEvent' in e && e.originalEvent instanceof Event) {
    L.DomEvent.stopPropagation(e.originalEvent);
  }
}

function haltMapPointerEvent(e: LeafletEvent) {
  L.DomEvent.stopPropagation(e as unknown as Event);
  L.DomEvent.preventDefault(e as unknown as Event);
  if ('originalEvent' in e && e.originalEvent instanceof Event) {
    L.DomEvent.stopPropagation(e.originalEvent);
    L.DomEvent.preventDefault(e.originalEvent);
  }
}

/** Project a lat/lon onto segment A→B (local equirectangular). */
function projectOntoSegment(
  lat: number,
  lon: number,
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): { lat: number; lon: number; t: number; distM: number } {
  const cos = Math.cos((aLat * Math.PI) / 180);
  const bx = (bLon - aLon) * cos * 111320;
  const by = (bLat - aLat) * 110540;
  const px = (lon - aLon) * cos * 111320;
  const py = (lat - aLat) * 110540;
  const len2 = bx * bx + by * by;
  let t = len2 === 0 ? 0 : (px * bx + py * by) / len2;
  t = Math.max(0, Math.min(1, t));
  const projLat = aLat + t * (bLat - aLat);
  const projLon = aLon + t * (bLon - aLon);
  return {
    lat: projLat,
    lon: projLon,
    t,
    distM: haversineMeters(lat, lon, projLat, projLon),
  };
}

function pinIcon(selected: boolean, pathEndpoint: boolean) {
  const color = pathEndpoint ? '#2563eb' : selected ? '#c2410c' : '#0F6B63';
  return L.divIcon({
    className: 'admin-map-pin',
    html: `<div class="admin-pin-dot" style="background:${color}"></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  });
}

function FollowLiveLocation({
  lat,
  lon,
  enabled,
}: {
  lat: number;
  lon: number;
  enabled: boolean;
}) {
  const map = useMap();
  useEffect(() => {
    if (!enabled) return;
    map.setView([lat, lon], Math.max(map.getZoom(), 18));
  }, [map, lat, lon, enabled]);
  return null;
}

function MapClickCapture({
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

function MapCursorTracker({
  enabled,
  onMove,
}: {
  enabled: boolean;
  onMove: (lat: number, lon: number) => void;
}) {
  useMapEvents({
    mousemove(e) {
      if (!enabled) return;
      onMove(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function RecenterOnMe({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  return (
    <button
      type="button"
      className="absolute bottom-4 right-4 z-[1000] inline-flex items-center gap-2 rounded-md border border-line bg-paper-raised px-3 py-2 text-sm font-semibold shadow-sm"
      onClick={() => map.setView([lat, lon], Math.max(map.getZoom(), 18))}
    >
      <LocateFixed size={16} className="text-accent" /> My location
    </button>
  );
}

function DraggablePin({
  node,
  selected,
  pathEndpoint,
  draggable,
  onSelect,
  onMoved,
}: {
  node: GraphNode;
  selected: boolean;
  pathEndpoint: boolean;
  draggable: boolean;
  onSelect: () => void;
  onMoved: (lat: number, lon: number) => void;
}) {
  const icon = useMemo(() => pinIcon(selected, pathEndpoint), [selected, pathEndpoint]);
  return (
    <Marker
      position={[node.latitude, node.longitude]}
      draggable={draggable}
      zIndexOffset={600}
      icon={icon}
      eventHandlers={{
        click: (e) => {
          haltMapPointerEvent(e);
          onSelect();
        },
        mousedown: (e) => {
          if (!draggable) haltMapPointerEvent(e);
          else stopMapPropagation(e);
        },
        dragend: (e) => {
          const { lat, lng } = e.target.getLatLng();
          onMoved(lat, lng);
        },
      }}
    >
    <Tooltip
  direction="top"
  offset={[0, -18]}
  opacity={0.95}
  className="admin-map-tooltip"
>
  {node.name ?? 'pin'}
</Tooltip>
    </Marker>
  );
}

function BendMarker({
  node,
  selected,
  drawMode,
  onSelect,
  onMoved,
}: {
  node: GraphNode;
  selected: boolean;
  drawMode?: boolean;
  onSelect: () => void;
  onMoved: (lat: number, lon: number) => void;
}) {
  return (
    <Marker
      position={[node.latitude, node.longitude]}
      draggable={!drawMode}
      autoPan={false}
      zIndexOffset={drawMode ? 2500 : 1200}
      icon={selected ? BEND_ICON_SELECTED : BEND_ICON}
      eventHandlers={{
        click: (e) => {
          haltMapPointerEvent(e);
          onSelect();
        },
        mousedown: (e) => {
          haltMapPointerEvent(e);
        },
        dragstart: (e) => {
          stopMapPropagation(e);
        },
        dragend: (e) => {
          const { lat, lng } = e.target.getLatLng();
          onMoved(lat, lng);
        },
      }}
    >
      <Tooltip direction="top" opacity={1}>
        {drawMode
          ? 'Click to start or finish a connection here'
          : 'Bend · drag to move · switch to Draw to connect'}
      </Tooltip>
    </Marker>
  );
}

const emptyDetails = (): PinDetails => ({
  name: '',
  kind: 'outdoor',
  notes: '',
});

export function AdminMapEditor() {
  const token = useAuthStore((s) => s.accessToken);
  const { pose, error: gpsError } = useGeolocation(true);
  const { activeSiteId, mapCenter: siteCenter } = useActiveSite();
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [tool, setTool] = useState<Tool>('pin-click');
  const [basemapMode, setBasemapMode] = useState<BasemapMode>('hybrid');
  const [followLive, setFollowLive] = useState(false);
  const [draftPos, setDraftPos] = useState<{ lat: number; lon: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [details, setDetails] = useState<PinDetails>(emptyDetails());
  const [drawFromId, setDrawFromId] = useState<string | null>(null);
  const [sketch, setSketch] = useState<RouteSketch | null>(null);
  const [cleanEdgeIds, setCleanEdgeIds] = useState<Set<string>>(new Set());
  const [removeRouteFromId, setRemoveRouteFromId] = useState<string | null>(null);
  const [selectedBendId, setSelectedBendId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<'ok' | 'err'>('ok');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [pinAutosave, setPinAutosave] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>(
    'idle',
  );
  const pinSaveGenRef = useRef(0);
  const skipNextPinAutosaveRef = useRef(false);

  const showDetails =
    Boolean(draftPos) ||
    (Boolean(editingId) &&
      tool !== 'draw' &&
      tool !== 'add-bend' &&
      tool !== 'break-segment' &&
      tool !== 'break-route');

  async function refresh() {
    if (!token) return;
    const [n, e] = await Promise.all([api.adminNodes.list(token), api.adminEdges.list(token)]);
    // Defense in depth: never render soft-deleted nodes even if an older API returns them.
    setNodes(n.filter((node) => node.active !== false));
    setEdges(e);
  }

  useEffect(() => {
    if (!token) {
      setMessageTone('err');
      setMessage('Session expired — sign in again as organization admin.');
      return;
    }
    refresh().catch((err) => {
      setMessageTone('err');
      setMessage(err instanceof Error ? err.message : 'Load failed');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, activeSiteId]);

  const mapCenter: [number, number] = pose
    ? [pose.latitude, pose.longitude]
    : siteCenter;

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const placePins = useMemo(
    () =>
      nodes.filter(
        (n) =>
          n.active !== false &&
          (Boolean(n.name?.trim()) || n.kind === 'entrance' || n.kind === 'exit'),
      ),
    [nodes],
  );

  const placeIdSet = useMemo(() => new Set(placePins.map((p) => p.id)), [placePins]);

  /** All non-place waypoints (unnamed outdoor bends) — not only those already on a place route. */
  const waypointNodes = useMemo(
    () => nodes.filter((n) => n.active !== false && !placeIdSet.has(n.id)),
    [nodes, placeIdSet],
  );

  const edgeLines = useMemo(() => {
    return edges
      .map((edge) => {
        const from = nodeById.get(edge.fromNodeId);
        const to = nodeById.get(edge.toNodeId);
        if (!from || !to) return null;
        const bothPlaces = placeIdSet.has(edge.fromNodeId) && placeIdSet.has(edge.toNodeId);
        return {
          id: edge.id,
          bothPlaces,
          clean: cleanEdgeIds.has(edge.id),
          positions: [
            [from.latitude, from.longitude] as [number, number],
            [to.latitude, to.longitude] as [number, number],
          ],
          label: `${from.name ?? 'bend'} → ${to.name ?? 'bend'}`,
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      bothPlaces: boolean;
      clean: boolean;
      positions: [number, number][];
      label: string;
    }>;
  }, [edges, nodeById, placeIdSet, cleanEdgeIds]);

  function flash(text: string, tone: 'ok' | 'err' = 'ok') {
    setMessageTone(tone);
    setMessage(text);
  }

  function setToolMode(next: Tool) {
    setTool(next);
    setDrawFromId(null);
    setSketch(null);
    setRemoveRouteFromId(null);
    if (next === 'draw' || next === 'add-bend' || next === 'break-segment' || next === 'break-route') {
      setDraftPos(null);
      setEditingId(null);
      setSelectedBendId(null);
    }
    if (next === 'pin-live') setFollowLive(true);
  }

  async function createPinAt(lat: number, lon: number, preferredName?: string) {
    if (!token) return;
    setBusy(true);
    try {
      const autoName =
        preferredName?.trim() ||
        `Pin ${placePins.length + 1}`;
      const created = await api.adminNodes.create(
        {
          name: autoName,
          latitude: lat,
          longitude: lon,
          kind: 'outdoor',
          floorId: null,
          buildingId: null,
        },
        token,
      );
      skipNextPinAutosaveRef.current = true;
      setDraftPos(null);
      setEditingId(created.id);
      setDetails({ name: created.name ?? autoName, kind: created.kind, notes: '' });
      setPinAutosave('saved');
      await refresh();
      flash(`“${created.name ?? autoName}” saved — rename anytime (autosaves).`);
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not save pin', 'err');
    } finally {
      setBusy(false);
    }
  }

  function openDraftAtLive() {
    if (!pose) {
      flash('No live GPS yet — allow location, or use “Click to pin”.', 'err');
      return;
    }
    setFollowLive(false);
    void createPinAt(pose.latitude, pose.longitude);
  }

  function openDraftAtClick(lat: number, lon: number) {
    void createPinAt(lat, lon);
  }

  function selectPinForEdit(node: GraphNode) {
    skipNextPinAutosaveRef.current = true;
    setDraftPos(null);
    setEditingId(node.id);
    const raw = node.name ?? '';
    const parts = raw.split(' — ');
    setDetails({
      name: parts[0] ?? '',
      kind: node.kind,
      notes: parts.length > 1 ? parts.slice(1).join(' — ') : '',
    });
    setPinAutosave('idle');
    setFollowLive(false);
    setMessage(null);
  }

  function cancelDetails() {
    setDraftPos(null);
    setEditingId(null);
    setDetails(emptyDetails());
    setPinAutosave('idle');
  }

  // Autosave pin name/kind/notes while editing (skip the first tick after open/create).
  useEffect(() => {
    if (!editingId || !token) return;
    if (skipNextPinAutosaveRef.current) {
      skipNextPinAutosaveRef.current = false;
      return;
    }
    if (!details.name.trim()) {
      setPinAutosave('idle');
      return;
    }
    setPinAutosave('pending');
    const gen = ++pinSaveGenRef.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        setPinAutosave('saving');
        try {
          const displayName = details.notes.trim()
            ? `${details.name.trim()} — ${details.notes.trim()}`
            : details.name.trim();
          await api.adminNodes.update(
            editingId,
            { name: displayName, kind: details.kind },
            token,
          );
          if (pinSaveGenRef.current !== gen) return;
          setPinAutosave('saved');
        } catch (err) {
          if (pinSaveGenRef.current !== gen) return;
          setPinAutosave('error');
          flash(err instanceof Error ? err.message : 'Autosave failed', 'err');
        }
      })();
    }, PIN_AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [details.name, details.kind, details.notes, editingId, token]);

  const sketchPreview = useMemo(() => {
    if (!sketch) return null;
    const start = nodeById.get(sketch.startId);
    if (!start) return null;
    const pts: [number, number][] = [
      [start.latitude, start.longitude],
      ...sketch.bends.map((b) => [b.lat, b.lon] as [number, number]),
    ];
    if (sketch.cursor) pts.push([sketch.cursor.lat, sketch.cursor.lon]);
    return pts;
  }, [sketch, nodeById]);

  function nodeLabel(node: GraphNode): string {
    if (node.name?.trim()) return `“${node.name.trim()}”`;
    return placeIdSet.has(node.id) ? 'pin' : 'bend';
  }

  async function onPinClick(node: GraphNode) {
    if (tool === 'draw') {
      await handleDrawEndpointClick(node);
      return;
    }
    if (tool === 'add-bend') return;
    if (tool === 'break-route') {
      handleRemoveRoutePinClick(node);
      return;
    }
    if (tool === 'break-segment') return;
    selectPinForEdit(node);
  }

  function handleBendClick(node: GraphNode) {
    if (tool === 'draw') {
      void handleDrawEndpointClick(node);
      return;
    }
    if (tool === 'add-bend') return;
    setSelectedBendId(node.id);
    setEditingId(null);
    setDraftPos(null);
    flash('Bend selected — drag to move, or delete it from the panel.');
  }

  function handleRemoveRoutePinClick(node: GraphNode) {
    if (!removeRouteFromId) {
      setRemoveRouteFromId(node.id);
      flash(
        `Route start: “${node.name ?? 'pin'}”. Click the other end place pin to remove the full route between them.`,
      );
      return;
    }
    if (removeRouteFromId === node.id) {
      setRemoveRouteFromId(null);
      flash('Route remove cancelled.');
      return;
    }

    const path = findRoutePath(removeRouteFromId, node.id, edges);
    if (!path || path.edgeIds.length === 0) {
      flash('No drawn route found between those two places.', 'err');
      setRemoveRouteFromId(null);
      return;
    }

    const from = nodeById.get(removeRouteFromId);
    const bendIds = path.nodeIds.filter((id) => !placeIdSet.has(id));
    setConfirm({
      type: 'break-route',
      fromId: removeRouteFromId,
      toId: node.id,
      label: `“${from?.name ?? 'A'}” → “${node.name ?? 'B'}” (${path.edgeIds.length} segment${path.edgeIds.length === 1 ? '' : 's'})`,
      edgeIds: path.edgeIds,
      bendIds,
    });
    setRemoveRouteFromId(null);
  }

  function findNearestDrawEndpoint(lat: number, lon: number): GraphNode | null {
    let best: GraphNode | null = null;
    let bestD = DRAW_SNAP_M;
    for (const n of nodes) {
      if (n.active === false) continue;
      const d = haversineMeters(lat, lon, n.latitude, n.longitude);
      if (d <= bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  }

  function onDrawMapClick(lat: number, lon: number) {
    // Prefer linking an existing pin/bend over dropping a duplicate bend on top of it.
    const snap = findNearestDrawEndpoint(lat, lon);
    if (snap) {
      void handleDrawEndpointClick(snap);
      return;
    }
    if (!sketch) {
      flash('First click a start pin or bend, then click the map to add turns.', 'err');
      return;
    }
    setSketch((s) => (s ? { ...s, bends: [...s.bends, { lat, lon }] } : s));
  }

  function undoLastBend() {
    setSketch((s) => {
      if (!s || s.bends.length === 0) return s;
      return { ...s, bends: s.bends.slice(0, -1) };
    });
  }

  function cancelSketch() {
    setSketch(null);
    setDrawFromId(null);
    flash('Route sketch cancelled.');
  }

  async function createEdgeBetween(
    fromId: string,
    toId: string,
    fromPos: { latitude: number; longitude: number },
    toPos: { latitude: number; longitude: number },
  ) {
    if (!token) return null;
    const distanceM = Math.max(
      1,
      Math.round(
        haversineMeters(fromPos.latitude, fromPos.longitude, toPos.latitude, toPos.longitude) *
          10,
      ) / 10,
    );
    return api.adminEdges.create(
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
  }

  async function handleDrawEndpointClick(node: GraphNode) {
    if (!token) return;
    if (!sketch) {
      setSketch({ startId: node.id, bends: [], cursor: null });
      setDrawFromId(node.id);
      setSelectedBendId(null);
      flash(
        `Start: ${nodeLabel(node)}. Click the map for new turns, or click another pin/bend to connect directly.`,
      );
      return;
    }

    if (node.id === sketch.startId) {
      cancelSketch();
      return;
    }

    // Avoid finishing on a node already used as a new bend in this sketch (impossible for existing ids)
    const start = nodeById.get(sketch.startId);
    if (!start) return;
    const bendsSnapshot = [...sketch.bends];
    const startId = sketch.startId;
    const endIsPlace = placeIdSet.has(node.id);
    const startIsPlace = placeIdSet.has(startId);

    setBusy(true);
    try {
      const chainIds: string[] = [startId];
      const chainPos: { latitude: number; longitude: number }[] = [
        { latitude: start.latitude, longitude: start.longitude },
      ];

      for (const bend of bendsSnapshot) {
        const bendNode = await api.adminNodes.create(
          {
            name: null,
            latitude: bend.lat,
            longitude: bend.lon,
            kind: 'outdoor',
            floorId: null,
            buildingId: null,
          },
          token,
        );
        chainIds.push(bendNode.id);
        chainPos.push({ latitude: bendNode.latitude, longitude: bendNode.longitude });
      }

      chainIds.push(node.id);
      chainPos.push({ latitude: node.latitude, longitude: node.longitude });

      for (let i = 0; i < chainIds.length - 1; i++) {
        const a = chainIds[i];
        const b = chainIds[i + 1];
        const already = edges.some(
          (e) =>
            (e.fromNodeId === a && e.toNodeId === b) || (e.fromNodeId === b && e.toNodeId === a),
        );
        if (already) continue;
        const edge = await createEdgeBetween(a, b, chainPos[i], chainPos[i + 1]);
        if (!edge) return;
      }

      // Optional circuit highlight when closing a place loop with a direct (0-bend) link
      if (bendsSnapshot.length === 0 && startIsPlace && endIsPlace) {
        const cycle = cycleClosedByNewEdge(
          placeIdSet,
          edges.filter((e) => placeIdSet.has(e.fromNodeId) && placeIdSet.has(e.toNodeId)),
          startId,
          node.id,
          'pending',
        );
        if (cycle) {
          setCleanEdgeIds(new Set(cycle.edgeIds.filter((id) => id !== 'pending')));
        }
      }

      setSketch(null);
      setDrawFromId(null);
      setSelectedBendId(null);
      await refresh();
      flash(
        bendsSnapshot.length > 0
          ? `Route saved: ${nodeLabel(start)} → ${bendsSnapshot.length} turn${bendsSnapshot.length === 1 ? '' : 's'} → ${nodeLabel(node)}. Drag orange bends to adjust, or Draw again to link more bends.`
          : `Connected ${nodeLabel(start)} → ${nodeLabel(node)}. Click another pin or bend to keep linking.`,
      );
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not save route', 'err');
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function relinkDistancesForNode(nodeId: string, lat: number, lon: number, all: GraphNode[]) {
    if (!token) return;
    const related = edges.filter((e) => e.fromNodeId === nodeId || e.toNodeId === nodeId);
    await Promise.all(
      related.map(async (edge) => {
        const otherId = edge.fromNodeId === nodeId ? edge.toNodeId : edge.fromNodeId;
        const other = all.find((n) => n.id === otherId);
        if (!other) return;
        const distanceM = Math.max(
          1,
          Math.round(haversineMeters(lat, lon, other.latitude, other.longitude) * 10) / 10,
        );
        await api.adminEdges.update(edge.id, { distanceM }, token);
      }),
    );
  }

  function findNearestEdgeProjection(
    lat: number,
    lon: number,
  ): { edge: GraphEdge; lat: number; lon: number; distM: number } | null {
    let best: { edge: GraphEdge; lat: number; lon: number; distM: number } | null = null;
    for (const edge of edges) {
      const from = nodeById.get(edge.fromNodeId);
      const to = nodeById.get(edge.toNodeId);
      if (!from || !to) continue;
      const proj = projectOntoSegment(
        lat,
        lon,
        from.latitude,
        from.longitude,
        to.latitude,
        to.longitude,
      );
      // Avoid placing a bend almost on top of an endpoint.
      if (proj.t < 0.02 || proj.t > 0.98) continue;
      if (proj.distM > ADD_BEND_SNAP_M) continue;
      if (!best || proj.distM < best.distM) {
        best = { edge, lat: proj.lat, lon: proj.lon, distM: proj.distM };
      }
    }
    return best;
  }

  /** Insert a bend on an existing segment: A—B → A—bend—B. */
  async function insertBendOnPath(lat: number, lon: number, preferredEdgeId?: string) {
    if (!token || busy) return;

    let target: { edge: GraphEdge; lat: number; lon: number } | null = null;

    if (preferredEdgeId) {
      const edge = edges.find((e) => e.id === preferredEdgeId);
      const from = edge ? nodeById.get(edge.fromNodeId) : undefined;
      const to = edge ? nodeById.get(edge.toNodeId) : undefined;
      if (edge && from && to) {
        const proj = projectOntoSegment(
          lat,
          lon,
          from.latitude,
          from.longitude,
          to.latitude,
          to.longitude,
        );
        if (proj.t > 0.02 && proj.t < 0.98) {
          target = { edge, lat: proj.lat, lon: proj.lon };
        }
      }
    }

    if (!target) {
      const nearest = findNearestEdgeProjection(lat, lon);
      if (nearest) target = { edge: nearest.edge, lat: nearest.lat, lon: nearest.lon };
    }

    if (!target) {
      flash('Click on or near a path line to add a bend.', 'err');
      return;
    }

    const fromId = target.edge.fromNodeId;
    const toId = target.edge.toNodeId;
    const from = nodeById.get(fromId);
    const to = nodeById.get(toId);
    if (!from || !to) {
      flash('Path endpoints missing — refresh and try again.', 'err');
      return;
    }

    setBusy(true);
    try {
      const bendNode = await api.adminNodes.create(
        {
          name: null,
          latitude: target.lat,
          longitude: target.lon,
          kind: 'outdoor',
          floorId: null,
          buildingId: null,
        },
        token,
      );

      await api.adminEdges.remove(target.edge.id, token);

      const left = await createEdgeBetween(
        fromId,
        bendNode.id,
        { latitude: from.latitude, longitude: from.longitude },
        { latitude: bendNode.latitude, longitude: bendNode.longitude },
      );
      const right = await createEdgeBetween(
        bendNode.id,
        toId,
        { latitude: bendNode.latitude, longitude: bendNode.longitude },
        { latitude: to.latitude, longitude: to.longitude },
      );
      if (!left || !right) {
        flash('Bend created but path split failed — try Draw route to reconnect.', 'err');
        await refresh();
        return;
      }

      setCleanEdgeIds((prev) => {
        const next = new Set(prev);
        next.delete(target.edge.id);
        return next;
      });
      setSelectedBendId(bendNode.id);
      setEditingId(null);
      await refresh();
      flash('Bend added on path — drag it to reshape, or delete to stitch the path back.');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not add bend', 'err');
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  function onAddBendMapClick(lat: number, lon: number) {
    void insertBendOnPath(lat, lon);
  }

  async function onPinMoved(node: GraphNode, lat: number, lon: number) {
    if (!token) return;
    // Optimistic update so the marker does not snap back while saving
    setNodes((prev) =>
      prev.map((n) => (n.id === node.id ? { ...n, latitude: lat, longitude: lon } : n)),
    );
    try {
      const updated = await api.adminNodes.update(node.id, { latitude: lat, longitude: lon }, token);
      const nextNodes = nodes.map((n) => (n.id === node.id ? updated : n));
      await relinkDistancesForNode(node.id, lat, lon, [
        ...nextNodes.filter((n) => n.id !== node.id),
        updated,
      ]);
      await refresh();
      flash(node.name ? `Moved “${node.name}”.` : 'Bend moved — path updated.');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not move pin', 'err');
      await refresh();
    }
  }

  async function executeRemoveBend(bendId: string) {
    if (!token) return;
    setBusy(true);
    setConfirm(null);
    try {
      const connected = edges.filter((e) => e.fromNodeId === bendId || e.toNodeId === bendId);
      const neighbors = connected.map((e) =>
        e.fromNodeId === bendId ? e.toNodeId : e.fromNodeId,
      );
      const uniqueNeighbors = [...new Set(neighbors)];

      // Stitch path if this bend sat between exactly two nodes
      if (uniqueNeighbors.length === 2) {
        const [a, b] = uniqueNeighbors;
        const aNode = nodeById.get(a);
        const bNode = nodeById.get(b);
        if (aNode && bNode) {
          const already = edges.some(
            (e) =>
              (e.fromNodeId === a && e.toNodeId === b) ||
              (e.fromNodeId === b && e.toNodeId === a),
          );
          if (!already) {
            const stitched = await createEdgeBetween(
              a,
              b,
              { latitude: aNode.latitude, longitude: aNode.longitude },
              { latitude: bNode.latitude, longitude: bNode.longitude },
            );
            if (!stitched) return;
          }
        }
      }

      await api.mapBuilder.deleteNode(bendId,true, token);
      setSelectedBendId(null);
      await refresh();
      flash(
        uniqueNeighbors.length === 2
          ? 'Bend removed — path stitched between its two neighbors.'
          : uniqueNeighbors.length === 0
            ? 'Bend removed.'
            : `Bend removed. It had ${uniqueNeighbors.length} connections, so neighbors were not auto-joined (only 2-way bends stitch).`,
      );
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not remove bend', 'err');
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function executeRemoveOne(id: string) {
    if (!token) return;
    setBusy(true);
    setConfirm(null);
    try {
      try {
        await api.mapBuilder.deleteNode(id, false, token);
      } catch (err) {
        if (err instanceof ApiError && (err.code === 'NODE_HAS_EDGES' || err.status === 409)) {
          if (
            !window.confirm(
              `${err.message}\n\nDelete this pin and its connected walkways/bends links?`,
            )
          ) {
            return;
          }
          await api.mapBuilder.deleteNode(id, true, token);
        } else {
          throw err;
        }
      }
      if (editingId === id) cancelDetails();
      // Optimistic local clear so the marker disappears immediately.
      setNodes((prev) => prev.filter((n) => n.id !== id));
      setEdges((prev) => prev.filter((e) => e.fromNodeId !== id && e.toNodeId !== id));
      await refresh();
      flash('Pin removed.');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Delete failed', 'err');
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function executeRemoveAll() {
    if (!token) return;
    setBusy(true);
    setConfirm(null);
    const toRemove = [...placePins];
    try {
      for (const n of toRemove) {
        try {
          await api.mapBuilder.deleteNode(n.id, false, token);
        } catch (err) {
          if (err instanceof ApiError && (err.code === 'NODE_HAS_EDGES' || err.status === 409)) {
            await api.mapBuilder.deleteNode(n.id, true, token);
          } else {
            throw err;
          }
        }
      }
      cancelDetails();
      setCleanEdgeIds(new Set());
      setNodes((prev) => prev.filter((n) => !toRemove.some((p) => p.id === n.id)));
      await refresh();
      flash(`Removed ${toRemove.length} pin${toRemove.length === 1 ? '' : 's'}.`);
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not remove all pins', 'err');
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function executeBreakEdge(id: string) {
    if (!token) return;
    setBusy(true);
    setConfirm(null);
    try {
      await api.adminEdges.remove(id, token);
      setCleanEdgeIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await refresh();
      flash('Segment removed. Place pins are unchanged.');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not remove segment', 'err');
    } finally {
      setBusy(false);
    }
  }

  async function executeBreakRoute(edgeIds: string[], bendIds: string[]) {
    if (!token) return;
    setBusy(true);
    setConfirm(null);
    try {
      for (const id of edgeIds) {
        await api.adminEdges.remove(id, token);
      }
      // Remove bend waypoints that are no longer connected
      const { edges: remainingEdges } = await (async () => {
        const e = await api.adminEdges.list(token);
        return { edges: e };
      })();
      const stillUsed = new Set<string>();
      for (const e of remainingEdges) {
        stillUsed.add(e.fromNodeId);
        stillUsed.add(e.toNodeId);
      }
      for (const bendId of bendIds) {
        if (!stillUsed.has(bendId) && !placeIdSet.has(bendId)) {
          await api.adminNodes.remove(bendId, token);
        }
      }
      setCleanEdgeIds((prev) => {
        const next = new Set(prev);
        for (const id of edgeIds) next.delete(id);
        return next;
      });
      await refresh();
      flash(
        `Full route removed (${edgeIds.length} segment${edgeIds.length === 1 ? '' : 's'}). End place pins kept.`,
      );
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not remove route', 'err');
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const tools: { id: Tool; label: string; icon: typeof MapPin }[] = [
    { id: 'pin-live', label: 'Pin at GPS', icon: LocateFixed },
    { id: 'pin-click', label: 'Click to pin', icon: MapPin },
    { id: 'draw', label: 'Draw route', icon: Route },
    { id: 'add-bend', label: 'Add bend', icon: GitCommitHorizontal },
    { id: 'break-segment', label: 'Remove segment', icon: Scissors },
    { id: 'break-route', label: 'Remove A→B route', icon: Waypoints },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">Map pins</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-mute">
            Pins autosave on place and rename. Draw routes between pins/bends, or use{' '}
            <strong>Add bend</strong> to insert a turn on an existing path. Deleting a bend
            stitches the path back together when it has two neighbors.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-accent-danger/40 bg-accent-danger/5 px-3 py-1.5 text-sm font-semibold text-accent-danger disabled:opacity-50"
          disabled={busy || placePins.length === 0}
          onClick={() => setConfirm({ type: 'remove-all', count: placePins.length })}
        >
          <Trash2 size={14} /> Remove all pins
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {tools.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold ${
              tool === t.id ? 'bg-accent text-white' : 'border border-line bg-paper-raised'
            }`}
            onClick={() => setToolMode(t.id)}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {confirm && (
        <div
          className="rounded-md border border-accent-danger/35 bg-paper-raised p-4 shadow-sm"
          role="alertdialog"
        >
          <p className="font-semibold text-ink">
            {confirm.type === 'remove-all'
              ? `Remove all ${confirm.count} pins?`
              : confirm.type === 'break-edge'
                ? `Remove this segment “${confirm.label}”?`
                : confirm.type === 'break-route'
                  ? `Remove full route ${confirm.label}?`
                  : confirm.type === 'remove-bend'
                    ? `Remove bend ${confirm.label}?`
                    : `Remove “${confirm.label}”?`}
          </p>
          <p className="mt-1 text-sm text-ink-mute">
            {confirm.type === 'break-edge'
              ? 'Only this line between two points is deleted. Place pins stay.'
              : confirm.type === 'break-route'
                ? 'Deletes every segment and bend between those two end places. The place pins themselves stay.'
                : confirm.type === 'remove-bend'
                  ? 'Removes this turn point and reconnects the path around it when possible.'
                  : 'This cannot be undone.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md bg-accent-danger px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              disabled={busy}
              onClick={() => {
                if (confirm.type === 'remove-all') void executeRemoveAll();
                else if (confirm.type === 'break-edge') void executeBreakEdge(confirm.id);
                else if (confirm.type === 'break-route')
                  void executeBreakRoute(confirm.edgeIds, confirm.bendIds);
                else if (confirm.type === 'remove-bend') void executeRemoveBend(confirm.id);
                else void executeRemoveOne(confirm.id);
              }}
            >
              Confirm
            </button>
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => setConfirm(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {gpsError && tool === 'pin-live' && (
        <p className="rounded-md border border-accent-warn/40 bg-accent-warn/10 px-3 py-2 text-sm text-ink">
          {gpsError} You can still use <strong>Click to pin</strong>.
        </p>
      )}
      {pose && tool === 'pin-live' && (
        <p className="text-xs text-ink-faint">
          Live GPS · {pose.latitude.toFixed(5)}, {pose.longitude.toFixed(5)}
          {pose.accuracy != null ? ` · ±${Math.round(pose.accuracy)} m` : ''}
        </p>
      )}
      {tool === 'draw' && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-accent/25 bg-accent/5 px-3 py-2 text-sm text-ink">
          <span className="flex-1">
            {!sketch
              ? '1) Click a start pin or bend. 2) Optional: click empty map for new turns. 3) Click any other pin or bend to connect (clicks near a bend snap to it).'
              : `Drawing from start · ${sketch.bends.length} new bend${sketch.bends.length === 1 ? '' : 's'} — click empty map for turns, or click/snap to a pin or bend to finish.`}
          </span>
          {sketch && (
            <>
              <button
                type="button"
                className="btn-ghost !px-2 !py-1 text-xs"
                disabled={busy || sketch.bends.length === 0}
                onClick={undoLastBend}
              >
                Undo bend
              </button>
              <button
                type="button"
                className="btn-ghost !px-2 !py-1 text-xs"
                disabled={busy}
                onClick={cancelSketch}
              >
                Cancel
              </button>
            </>
          )}
        </div>
      )}
      {tool === 'add-bend' && (
        <p className="rounded-md border border-accent/25 bg-accent/5 px-3 py-2 text-sm text-ink">
          Click anywhere on a path line (or near it) to insert a bend. The path splits around the new
          turn — drag to reshape; delete the bend to reconnect the two sides.
        </p>
      )}
      {tool === 'break-segment' && (
        <p className="rounded-md border border-accent/25 bg-accent/5 px-3 py-2 text-sm text-ink">
          Click a path <strong>line</strong> to remove only that segment (between its two ends).
        </p>
      )}
      {tool === 'break-route' && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-accent/25 bg-accent/5 px-3 py-2 text-sm text-ink">
          <span className="flex-1">
            {removeRouteFromId
              ? 'Start place selected. Click the other end place pin to remove the complete route between them.'
              : 'Click place pin A, then place pin B to remove the full route (all bends included).'}
          </span>
          {removeRouteFromId && (
            <button
              type="button"
              className="btn-ghost !px-2 !py-1 text-xs"
              onClick={() => {
                setRemoveRouteFromId(null);
                flash('Route remove cancelled.');
              }}
            >
              Cancel
            </button>
          )}
        </div>
      )}
      {message && (
        <p
          className={`rounded-md px-3 py-2 text-sm ${
            messageTone === 'err'
              ? 'border border-accent-danger/30 bg-accent-danger/5 text-accent-danger'
              : 'border border-accent/25 bg-accent/5 text-ink'
          }`}
        >
          {message}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="relative h-[min(70vh,560px)] overflow-hidden rounded-md border border-line">
          <MapContainer
            center={mapCenter}
            zoom={CAMPUS_DEFAULT_ZOOM}
            className="h-full w-full"
            scrollWheelZoom
            maxZoom={CAMPUS_MAX_ZOOM}
          >
            <RealBasemapTiles mode={basemapMode} />
            <RecenterOnSite
              center={siteCenter}
              enabled={!(followLive && tool === 'pin-live' && !showDetails)}
            />
            <BasemapModeSwitcher mode={basemapMode} onChange={setBasemapMode} />
            {pose && (
              <FollowLiveLocation
                lat={pose.latitude}
                lon={pose.longitude}
                enabled={followLive && tool === 'pin-live' && !showDetails}
              />
            )}
            <MapClickCapture
              enabled={tool === 'pin-click'}
              onClick={openDraftAtClick}
            />
            <MapClickCapture
              enabled={tool === 'draw'}
              onClick={onDrawMapClick}
            />
            <MapClickCapture
              enabled={tool === 'add-bend' && !busy}
              onClick={onAddBendMapClick}
            />
            <MapCursorTracker
              enabled={tool === 'draw' && Boolean(sketch)}
              onMove={(lat, lon) =>
                setSketch((s) => (s ? { ...s, cursor: { lat, lon } } : s))
              }
            />

            {sketchPreview && sketchPreview.length > 1 && (
              <Polyline
                positions={sketchPreview}
                pathOptions={{
                  color: '#f59e0b',
                  weight: 5,
                  opacity: 0.95,
                  dashArray: '8 10',
                }}
              />
            )}
            {sketch?.bends.map((b, i) => (
              <CircleMarker
                key={`bend-draft-${i}`}
                center={[b.lat, b.lon]}
                radius={6}
                pathOptions={{ color: '#fff', weight: 2, fillColor: '#f59e0b', fillOpacity: 1 }}
              >
                <Tooltip direction="top">Bend {i + 1}</Tooltip>
              </CircleMarker>
            ))}

            {edgeLines.map((line) => (
              <Polyline
                key={line.id}
                positions={line.positions}
                eventHandlers={
                  tool === 'break-segment'
                    ? {
                        click: (e) => {
                          stopMapPropagation(e);
                          setConfirm({
                            type: 'break-edge',
                            id: line.id,
                            label: line.label,
                          });
                        },
                      }
                    : tool === 'add-bend'
                      ? {
                          click: (e) => {
                            stopMapPropagation(e);
                            const { lat, lng } = e.latlng;
                            void insertBendOnPath(lat, lng, line.id);
                          },
                        }
                      : undefined
                }
                pathOptions={{
                  color: line.clean ? '#1d4ed8' : line.bothPlaces ? '#0F6B63' : '#8a97a1',
                  weight:
                    line.clean
                      ? 6
                      : tool === 'break-segment' || tool === 'add-bend'
                        ? 8
                        : 4,
                  opacity: tool === 'break-segment' || tool === 'add-bend' ? 0.95 : 0.8,
                  dashArray: line.bothPlaces ? undefined : '6 8',
                  interactive: tool === 'break-segment' || tool === 'add-bend',
                }}
              >
                {tool === 'break-segment' && (
                  <Tooltip sticky>Click to remove this segment only</Tooltip>
                )}
                {tool === 'add-bend' && (
                  <Tooltip sticky>Click to add a bend on this path</Tooltip>
                )}
              </Polyline>
            ))}

            {placePins.map((node) => (
              <DraggablePin
                key={node.id}
                node={node}
                selected={editingId === node.id}
                pathEndpoint={
                  sketch?.startId === node.id ||
                  drawFromId === node.id ||
                  removeRouteFromId === node.id
                }
                draggable={tool === 'pin-live' || tool === 'pin-click'}
                onSelect={() => void onPinClick(node)}
                onMoved={(lat, lon) => void onPinMoved(node, lat, lon)}
              />
            ))}

            {waypointNodes.map((node) => (
              <BendMarker
                key={node.id}
                node={node}
                drawMode={tool === 'draw'}
                selected={
                  selectedBendId === node.id ||
                  sketch?.startId === node.id ||
                  drawFromId === node.id
                }
                onSelect={() => handleBendClick(node)}
                onMoved={(lat, lon) => void onPinMoved(node, lat, lon)}
              />
            ))}

            {pose && tool === 'pin-live' && (
              <>
                <Circle
                  center={[pose.latitude, pose.longitude]}
                  radius={pose.accuracy ?? 12}
                  pathOptions={{
                    color: '#2563eb',
                    fillColor: '#2563eb',
                    fillOpacity: 0.12,
                    weight: 1,
                  }}
                />
                <CircleMarker
                  center={[pose.latitude, pose.longitude]}
                  radius={9}
                  pathOptions={{ color: '#fff', weight: 2, fillColor: '#2563eb', fillOpacity: 1 }}
                >
                  <Tooltip direction="right" offset={[8, 0]} permanent>
                    You (live)
                  </Tooltip>
                </CircleMarker>
                <RecenterOnMe lat={pose.latitude} lon={pose.longitude} />
              </>
            )}

            {draftPos && (
              <Marker
                position={[draftPos.lat, draftPos.lon]}
                draggable
                icon={pinIcon(true, false)}
                eventHandlers={{
                  dragend: (e) => {
                    const { lat, lng } = e.target.getLatLng();
                    setDraftPos({ lat, lon: lng });
                  },
                }}
              >
                <Tooltip direction="top" offset={[0, -18]} permanent>
                  New pin · drag to adjust
                </Tooltip>
              </Marker>
            )}
          </MapContainer>

          {tool === 'pin-live' && (
            <div className="absolute left-3 bottom-4 z-[1000]">
              <button
                type="button"
                className="btn-primary shadow-sm"
                disabled={busy || !pose}
                onClick={openDraftAtLive}
              >
                <MapPin size={16} /> Drop pin at my live location
              </button>
            </div>
          )}
          {tool === 'pin-click' && (
            <p className="pointer-events-none absolute bottom-4 left-3 z-[1000] rounded-md border border-line bg-paper-raised/95 px-3 py-2 text-xs font-medium shadow-sm">
              Click the map to place a pin — saved automatically
            </p>
          )}
          {tool === 'add-bend' && (
            <p className="pointer-events-none absolute bottom-4 left-3 z-[1000] rounded-md border border-line bg-paper-raised/95 px-3 py-2 text-xs font-medium shadow-sm">
              Click a path to insert a bend
            </p>
          )}
        </div>

        <aside className="panel h-fit space-y-4 rounded-md p-4">
          {showDetails ? (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-ink">Place details</p>
                <p className="mt-1 text-xs text-ink-faint">
                  {editingId && nodeById.get(editingId)
                    ? `${nodeById.get(editingId)!.latitude.toFixed(5)}, ${nodeById.get(editingId)!.longitude.toFixed(5)}`
                    : ''}
                  {' · '}
                  {pinAutosave === 'pending'
                    ? 'Saving soon…'
                    : pinAutosave === 'saving'
                      ? 'Saving…'
                      : pinAutosave === 'saved'
                        ? 'Saved'
                        : pinAutosave === 'error'
                          ? 'Save failed'
                          : 'Autosaves as you type'}
                </p>
              </div>
              <div>
                <label className="label" htmlFor="pin-name">
                  Place name
                </label>
                <input
                  id="pin-name"
                  className="input"
                  value={details.name}
                  onChange={(e) => setDetails((d) => ({ ...d, name: e.target.value }))}
                  placeholder="e.g. Library, Block A"
                  autoFocus
                />
              </div>
              <div>
                <label className="label" htmlFor="pin-kind">
                  Category
                </label>
                <select
                  id="pin-kind"
                  className="input"
                  value={details.kind}
                  onChange={(e) =>
                    setDetails((d) => ({ ...d, kind: e.target.value as GraphNode['kind'] }))
                  }
                >
                  {KIND_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="pin-notes">
                  Notes / aliases
                </label>
                <textarea
                  id="pin-notes"
                  className="input min-h-[72px] resize-y"
                  value={details.notes}
                  onChange={(e) => setDetails((d) => ({ ...d, notes: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn-ghost" type="button" disabled={busy} onClick={cancelDetails}>
                  Done
                </button>
              </div>
              {editingId && (
                <button
                  type="button"
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-accent-danger/40 px-3 py-2 text-sm font-semibold text-accent-danger disabled:opacity-50"
                  disabled={busy}
                  onClick={() =>
                    setConfirm({
                      type: 'remove-one',
                      id: editingId,
                      label: details.name || 'this pin',
                    })
                  }
                >
                  <Trash2 size={14} /> Remove this pin
                </button>
              )}
            </div>
          ) : selectedBendId ? (
            <div className="space-y-3 text-sm">
              <p className="font-semibold text-ink">Bend selected</p>
              <p className="text-ink-mute">
                Drag the orange point on the map to move it. Delete it to reconnect the path between
                its two neighbors automatically.
              </p>
              <button
                type="button"
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-accent-danger/40 px-3 py-2 text-sm font-semibold text-accent-danger disabled:opacity-50"
                disabled={busy}
                onClick={() =>
                  setConfirm({
                    type: 'remove-bend',
                    id: selectedBendId,
                    label: 'turn point',
                  })
                }
              >
                <Trash2 size={14} /> Delete this bend
              </button>
              <button
                type="button"
                className="btn-ghost w-full"
                onClick={() => setSelectedBendId(null)}
              >
                Deselect
              </button>
            </div>
          ) : (
            <div className="space-y-2 text-sm text-ink-mute">
              <p className="font-semibold text-ink">Workflow</p>
              <ol className="list-decimal space-y-1 pl-4">
                <li>Pin places (autosaved)</li>
                <li>Draw routes between pins/bends</li>
                <li>Add bend on a path, or drag orange bends</li>
                <li>Delete a bend to stitch the path back</li>
              </ol>
            </div>
          )}

          <div className="border-t border-line pt-4">
            <p className="mb-2 text-sm font-semibold text-ink">Bends ({waypointNodes.length})</p>
            <ul className="mb-4 max-h-36 space-y-1 overflow-auto text-sm">
              {waypointNodes.length === 0 && (
                <li className="text-ink-faint">No bends yet.</li>
              )}
              {waypointNodes.map((n, i) => (
                <li
                  key={n.id}
                  className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 ${
                    selectedBendId === n.id ? 'border-accent-warn bg-accent-warn/10' : 'border-line'
                  }`}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left font-medium hover:text-accent"
                    onClick={() => {
                      setSelectedBendId(n.id);
                      setEditingId(null);
                    }}
                  >
                    Bend {i + 1}
                  </button>
                  <button
                    type="button"
                    className="shrink-0 text-accent-danger disabled:opacity-50"
                    disabled={busy}
                    aria-label={`Delete bend ${i + 1}`}
                    onClick={() =>
                      setConfirm({
                        type: 'remove-bend',
                        id: n.id,
                        label: `Bend ${i + 1}`,
                      })
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
            <p className="mb-2 text-sm font-semibold text-ink">Pins ({placePins.length})</p>
            <ul className="max-h-56 space-y-1 overflow-auto text-sm">
              {placePins.length === 0 && <li className="text-ink-faint">No pins yet.</li>}
              {placePins.map((n) => (
                <li
                  key={n.id}
                  className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 ${
                    editingId === n.id ||
                    drawFromId === n.id ||
                    removeRouteFromId === n.id
                      ? 'border-accent bg-accent/5'
                      : 'border-line'
                  }`}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left font-medium hover:text-accent"
                    onClick={() => void onPinClick(n)}
                  >
                    {n.name ?? 'Unnamed'}
                  </button>
                  <button
                    type="button"
                    className="shrink-0 text-accent-danger disabled:opacity-50"
                    disabled={busy}
                    aria-label={`Remove ${n.name ?? 'pin'}`}
                    onClick={() =>
                      setConfirm({
                        type: 'remove-one',
                        id: n.id,
                        label: n.name ?? 'this pin',
                      })
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
