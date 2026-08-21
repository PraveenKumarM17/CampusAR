import {
  point,
  lineString,
  nearestPointOnLine,
  distance as turfDistance,
} from '@turf/turf';
import type { Building, GeoPoint, GraphEdge, GraphNode } from '@campusar/shared';
import { haversineMeters } from '../../lib/geo';

export const ENTRANCE_SNAP_M = 3;
export const NODE_SNAP_M = 2;
export const EDGE_SNAP_M = 2;
export const BUILDING_SEARCH_M = 80;

export type SnapTarget =
  | { kind: 'building-boundary'; buildingId: string; latitude: number; longitude: number }
  | { kind: 'node'; nodeId: string; latitude: number; longitude: number }
  | { kind: 'edge'; edgeId: string; latitude: number; longitude: number };

function ringToLineCoords(ring: GeoPoint[]): [number, number][] {
  const coords = ring.map((p) => [p.longitude, p.latitude] as [number, number]);
  if (
    coords.length &&
    (coords[0][0] !== coords[coords.length - 1][0] ||
      coords[0][1] !== coords[coords.length - 1][1])
  ) {
    coords.push(coords[0]);
  }
  return coords;
}

/** Nearest point on building footprint boundary within entrance snap tolerance. */
export function snapEntranceToBuilding(
  lat: number,
  lon: number,
  buildings: Building[],
  toleranceM = ENTRANCE_SNAP_M,
  searchM = BUILDING_SEARCH_M,
): SnapTarget | null {
  const click = point([lon, lat]);
  let best: SnapTarget | null = null;
  let bestDist = Infinity;

  for (const b of buildings) {
    if (!b.footprint || b.footprint.length < 3) continue;
    const centerDist = haversineMeters(lat, lon, b.latitude, b.longitude);
    if (centerDist > searchM + 50) continue;
    try {
      const line = lineString(ringToLineCoords(b.footprint));
      const nearest = nearestPointOnLine(line, click, { units: 'meters' });
      const d = nearest.properties.dist ?? Infinity;
      if (d <= toleranceM && d < bestDist) {
        bestDist = d;
        const [lng, la] = nearest.geometry.coordinates;
        best = {
          kind: 'building-boundary',
          buildingId: b.id,
          latitude: la,
          longitude: lng,
        };
      }
    } catch {
      /* skip invalid rings */
    }
  }
  return best;
}

/** Nearest existing node within tolerance. */
export function snapToNearbyNode(
  lat: number,
  lon: number,
  nodes: GraphNode[],
  toleranceM = NODE_SNAP_M,
): SnapTarget | null {
  let best: SnapTarget | null = null;
  let bestDist = Infinity;
  for (const n of nodes) {
    const d = haversineMeters(lat, lon, n.latitude, n.longitude);
    if (d <= toleranceM && d < bestDist) {
      bestDist = d;
      best = { kind: 'node', nodeId: n.id, latitude: n.latitude, longitude: n.longitude };
    }
  }
  return best;
}

/** Nearest point on an edge line (not near endpoints within node tolerance). */
export function snapToNearbyEdge(
  lat: number,
  lon: number,
  edges: GraphEdge[],
  nodes: GraphNode[],
  edgeToleranceM = EDGE_SNAP_M,
  endpointAvoidM = NODE_SNAP_M,
): SnapTarget | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const click = point([lon, lat]);
  let best: SnapTarget | null = null;
  let bestDist = Infinity;

  for (const e of edges) {
    const from = byId.get(e.fromNodeId);
    const to = byId.get(e.toNodeId);
    if (!from || !to) continue;
    if (haversineMeters(lat, lon, from.latitude, from.longitude) <= endpointAvoidM) continue;
    if (haversineMeters(lat, lon, to.latitude, to.longitude) <= endpointAvoidM) continue;
    try {
      const line = lineString([
        [from.longitude, from.latitude],
        [to.longitude, to.latitude],
      ]);
      const nearest = nearestPointOnLine(line, click, { units: 'meters' });
      const d = nearest.properties.dist ?? Infinity;
      if (d <= edgeToleranceM && d < bestDist) {
        bestDist = d;
        const [lng, la] = nearest.geometry.coordinates;
        best = { kind: 'edge', edgeId: e.id, latitude: la, longitude: lng };
      }
    } catch {
      /* skip */
    }
  }
  return best;
}

/** Prefer node snap, else edge snap, for node/POI placement. */
export function snapNodeOrEdge(
  lat: number,
  lon: number,
  nodes: GraphNode[],
  edges: GraphEdge[],
): SnapTarget | null {
  return snapToNearbyNode(lat, lon, nodes) ?? snapToNearbyEdge(lat, lon, edges, nodes);
}

/** Hover preview: return best snap target for the active tool. */
export function previewSnapTarget(
  tool: string,
  lat: number,
  lon: number,
  buildings: Building[],
  nodes: GraphNode[],
  edges: GraphEdge[],
): SnapTarget | null {
  if (tool === 'entrance') return snapEntranceToBuilding(lat, lon, buildings);
  if (tool === 'node' || tool === 'poi') return snapNodeOrEdge(lat, lon, nodes, edges);
  return null;
}

/** Snap a bearing to nearest 15° increment (0–360). */
export function snapAngleDeg(bearingDeg: number, increment = 15): number {
  const n = Math.round(bearingDeg / increment) * increment;
  return ((n % 360) + 360) % 360;
}

function bearingDeg(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function destinationPoint(
  lat: number,
  lon: number,
  distanceM: number,
  bearing: number,
): { latitude: number; longitude: number } {
  const R = 6371000;
  const δ = distanceM / R;
  const θ = (bearing * Math.PI) / 180;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lon * Math.PI) / 180;
  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ),
  );
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
    );
  return { latitude: (φ2 * 180) / Math.PI, longitude: (λ2 * 180) / Math.PI };
}

/** Destination at same distance along snapped bearing from origin → cursor. */
export function projectAngleSnap(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
  increment = 15,
): { latitude: number; longitude: number; bearing: number } {
  const dist = turfDistance(point([fromLon, fromLat]), point([toLon, toLat]), {
    units: 'meters',
  });
  const bearing = bearingDeg(fromLon, fromLat, toLon, toLat);
  const snapped = snapAngleDeg(bearing, increment);
  const dest = destinationPoint(fromLat, fromLon, dist, snapped);
  return { ...dest, bearing: snapped };
}
