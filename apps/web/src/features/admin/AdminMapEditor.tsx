import { FormEvent, useEffect, useMemo, useState } from 'react';
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
import { LocateFixed, MapPin, Plus, Route, Scissors, Trash2, Waypoints } from 'lucide-react';
import type { GraphEdge, GraphNode } from '@campusar/shared';
import { api } from '../../lib/api';
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

type Tool = 'pin-live' | 'pin-click' | 'draw' | 'break-segment' | 'break-route';

type PinDetails = {
  name: string;
  kind: GraphNode['kind'];
  notes: string;
};

/** In-progress route: start place → optional bend clicks → end place */
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
  if ('originalEvent' in e && e.originalEvent instanceof Event) {
    L.DomEvent.stopPropagation(e.originalEvent);
  }
}

function haltMapPointerEvent(e: LeafletEvent) {
  if ('originalEvent' in e && e.originalEvent instanceof Event) {
    L.DomEvent.stopPropagation(e.originalEvent);
    L.DomEvent.preventDefault(e.originalEvent);
  }
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
          stopMapPropagation(e);
          onSelect();
        },
        dragend: (e) => {
          const { lat, lng } = e.target.getLatLng();
          onMoved(lat, lng);
        },
      }}
    >
      <Tooltip direction="top" offset={[0, -18]} opacity={1}>
        {node.name ?? 'pin'}
      </Tooltip>
    </Marker>
  );
}

function BendMarker({
  node,
  selected,
  onSelect,
  onMoved,
}: {
  node: GraphNode;
  selected: boolean;
  onSelect: () => void;
  onMoved: (lat: number, lon: number) => void;
}) {
  return (
    <Marker
      position={[node.latitude, node.longitude]}
      draggable
      autoPan={false}
      zIndexOffset={1200}
      icon={selected ? BEND_ICON_SELECTED : BEND_ICON}
      eventHandlers={{
        click: (e) => {
          haltMapPointerEvent(e);
          onSelect();
        },
        mousedown: (e) => {
          stopMapPropagation(e);
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
        Bend · drag to move · click to select/delete
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

  const showDetails =
    Boolean(draftPos) ||
    (Boolean(editingId) &&
      tool !== 'draw' &&
      tool !== 'break-segment' &&
      tool !== 'break-route');

  async function refresh() {
    if (!token) return;
    const [n, e] = await Promise.all([api.adminNodes.list(token), api.adminEdges.list(token)]);
    setNodes(n);
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
    () => nodes.filter((n) => Boolean(n.name?.trim()) || n.kind === 'entrance' || n.kind === 'exit'),
    [nodes],
  );

  const placeIdSet = useMemo(() => new Set(placePins.map((p) => p.id)), [placePins]);

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
          label: `${from.name ?? 'A'} → ${to.name ?? 'B'}`,
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
    if (next === 'draw' || next === 'break-segment' || next === 'break-route') {
      setDraftPos(null);
      setEditingId(null);
    }
    if (next === 'pin-live') setFollowLive(true);
  }

  function openDraftAtLive() {
    if (!pose) {
      flash('No live GPS yet — allow location, or use “Click map to pin”.', 'err');
      return;
    }
    setEditingId(null);
    setDraftPos({ lat: pose.latitude, lon: pose.longitude });
    setDetails(emptyDetails());
    setFollowLive(false);
    setMessage(null);
  }

  function openDraftAtClick(lat: number, lon: number) {
    if (showDetails) return;
    setEditingId(null);
    setDraftPos({ lat, lon });
    setDetails(emptyDetails());
    setFollowLive(false);
    setMessage(null);
  }

  function selectPinForEdit(node: GraphNode) {
    setDraftPos(null);
    setEditingId(node.id);
    setDetails({
      name: node.name ?? '',
      kind: node.kind,
      notes: '',
    });
    setFollowLive(false);
    setMessage(null);
  }

  function cancelDetails() {
    setDraftPos(null);
    setEditingId(null);
    setDetails(emptyDetails());
  }

  const waypointNodes = useMemo(() => {
    const adj = new Map<string, string[]>();
    for (const e of edges) {
      if (!adj.has(e.fromNodeId)) adj.set(e.fromNodeId, []);
      if (!adj.has(e.toNodeId)) adj.set(e.toNodeId, []);
      adj.get(e.fromNodeId)!.push(e.toNodeId);
      adj.get(e.toNodeId)!.push(e.fromNodeId);
    }
    const bends = new Set<string>();
    const queue = [...placeIdSet];
    const seen = new Set(placeIdSet);
    while (queue.length) {
      const cur = queue.shift()!;
      for (const next of adj.get(cur) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        if (placeIdSet.has(next)) continue;
        bends.add(next);
        queue.push(next);
      }
    }
    return nodes.filter((n) => bends.has(n.id));
  }, [nodes, edges, placeIdSet]);

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

  async function onPinClick(node: GraphNode) {
    if (tool === 'draw') {
      await handleDrawPinClick(node);
      return;
    }
    if (tool === 'break-route') {
      handleRemoveRoutePinClick(node);
      return;
    }
    if (tool === 'break-segment') return;
    selectPinForEdit(node);
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

  function onDrawMapClick(lat: number, lon: number) {
    if (!sketch) {
      flash('First click a start place pin, then click along the road to add turns.', 'err');
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

  async function handleDrawPinClick(node: GraphNode) {
    if (!token) return;
    if (!sketch) {
      setSketch({ startId: node.id, bends: [], cursor: null });
      setDrawFromId(node.id);
      flash(
        `Start: “${node.name ?? 'pin'}”. Click the map to add turns/bends, then click the end place pin.`,
      );
      return;
    }

    if (node.id === sketch.startId) {
      cancelSketch();
      return;
    }

    const start = nodeById.get(sketch.startId);
    if (!start) return;
    const bendsSnapshot = [...sketch.bends];
    const startId = sketch.startId;

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
        const edge = await createEdgeBetween(chainIds[i], chainIds[i + 1], chainPos[i], chainPos[i + 1]);
        if (!edge) return;
      }

      // Optional circuit highlight when closing a place loop with a direct (0-bend) link
      if (bendsSnapshot.length === 0) {
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
      await refresh();
      flash(
        bendsSnapshot.length > 0
          ? `Route saved: “${start.name}” → ${bendsSnapshot.length} turn${bendsSnapshot.length === 1 ? '' : 's'} → “${node.name}”. Drag orange bend points to adjust.`
          : `Straight path saved: “${start.name}” → “${node.name}”. For turns, add map clicks between start and end next time.`,
      );
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not save route', 'err');
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

  async function saveDetails(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (!details.name.trim()) {
      flash('Place name is required.', 'err');
      return;
    }
    setBusy(true);
    try {
      const displayName = details.notes.trim()
        ? `${details.name.trim()} — ${details.notes.trim()}`
        : details.name.trim();
      if (draftPos) {
        await api.adminNodes.create(
          {
            name: displayName,
            latitude: draftPos.lat,
            longitude: draftPos.lon,
            kind: details.kind,
            floorId: null,
            buildingId: null,
          },
          token,
        );
        flash(
          `Saved “${details.name.trim()}”. Switch to Draw path and click two pins to connect them.`,
        );
        cancelDetails();
        await refresh();
      } else if (editingId) {
        await api.adminNodes.update(editingId, { name: displayName, kind: details.kind }, token);
        flash(`Updated “${details.name.trim()}”.`);
        cancelDetails();
        await refresh();
      }
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not save pin', 'err');
    } finally {
      setBusy(false);
    }
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

      await api.adminNodes.remove(bendId, token);
      setSelectedBendId(null);
      await refresh();
      flash(
        uniqueNeighbors.length === 2
          ? 'Bend removed — path stitched between its neighbors.'
          : 'Bend removed.',
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
      await api.adminNodes.remove(id, token);
      if (editingId === id) cancelDetails();
      await refresh();
      flash('Pin removed.');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Delete failed', 'err');
    } finally {
      setBusy(false);
    }
  }

  async function executeRemoveAll() {
    if (!token) return;
    setBusy(true);
    setConfirm(null);
    try {
      for (const n of placePins) {
        await api.adminNodes.remove(n.id, token);
      }
      cancelDetails();
      setCleanEdgeIds(new Set());
      await refresh();
      flash(`Removed ${placePins.length} pin${placePins.length === 1 ? '' : 's'}.`);
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
    { id: 'break-segment', label: 'Remove segment', icon: Scissors },
    { id: 'break-route', label: 'Remove A→B route', icon: Waypoints },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">Map pins</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-mute">
            Pin places, then <strong>Draw route</strong> with turns. Remove a wrong path with{' '}
            <strong>Remove segment</strong> (one line) or <strong>Remove A→B route</strong> (full
            path between two places).
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
              ? '1) Click a start place pin. 2) Click the map along the walkway for turns. 3) Click the end place pin.'
              : `Drawing from start · ${sketch.bends.length} bend${sketch.bends.length === 1 ? '' : 's'} — click map to add turns, then click end pin.`}
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
              enabled={tool === 'pin-click' && !showDetails}
              onClick={openDraftAtClick}
            />
            <MapClickCapture
              enabled={tool === 'draw' && !selectedBendId}
              onClick={onDrawMapClick}
            />
            <MapCursorTracker
              enabled={tool === 'draw' && Boolean(sketch) && !selectedBendId}
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
                    : undefined
                }
                pathOptions={{
                  color: line.clean ? '#1d4ed8' : line.bothPlaces ? '#0F6B63' : '#8a97a1',
                  weight: line.clean ? 6 : tool === 'break-segment' ? 8 : 4,
                  opacity: tool === 'break-segment' ? 0.95 : 0.8,
                  dashArray: line.bothPlaces ? undefined : '6 8',
                  interactive: tool === 'break-segment',
                }}
              >
                {tool === 'break-segment' && (
                  <Tooltip sticky>Click to remove this segment only</Tooltip>
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
                selected={selectedBendId === node.id}
                onSelect={() => {
                  setSelectedBendId(node.id);
                  setEditingId(null);
                  setDraftPos(null);
                  flash('Bend selected — drag to move, or delete it from the panel.');
                }}
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

          {tool === 'pin-live' && !showDetails && (
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
          {tool === 'pin-click' && !showDetails && (
            <p className="pointer-events-none absolute bottom-4 left-3 z-[1000] rounded-md border border-line bg-paper-raised/95 px-3 py-2 text-xs font-medium shadow-sm">
              Click the map to place a pin
            </p>
          )}
        </div>

        <aside className="panel h-fit space-y-4 rounded-md p-4">
          {showDetails ? (
            <form className="space-y-3" onSubmit={(e) => void saveDetails(e)}>
              <div>
                <p className="text-sm font-semibold text-ink">
                  {draftPos ? 'Add place details' : 'Edit place details'}
                </p>
                <p className="mt-1 text-xs text-ink-faint">
                  {draftPos
                    ? `${draftPos.lat.toFixed(5)}, ${draftPos.lon.toFixed(5)}`
                    : editingId && nodeById.get(editingId)
                      ? `${nodeById.get(editingId)!.latitude.toFixed(5)}, ${nodeById.get(editingId)!.longitude.toFixed(5)}`
                      : ''}
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
                  required
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
                <button className="btn-primary" type="submit" disabled={busy || !details.name.trim()}>
                  <Plus size={16} /> {draftPos ? 'Save pin' : 'Save changes'}
                </button>
                <button className="btn-ghost" type="button" disabled={busy} onClick={cancelDetails}>
                  Cancel
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
            </form>
          ) : selectedBendId ? (
            <div className="space-y-3 text-sm">
              <p className="font-semibold text-ink">Bend selected</p>
              <p className="text-ink-mute">
                Drag the orange point on the map to move it. Or delete it below — the path reconnects
                around it when possible.
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
                <li>Pin places</li>
                <li>Draw route with turns</li>
                <li>Click/drag orange bends to edit</li>
                <li>Remove segment or full A→B route</li>
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
