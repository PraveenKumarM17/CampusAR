import type { Building, CrowdLevel, DangerZone, GraphEdge, GraphNode } from '@campusar/shared';
import { CAMPUS_CENTER } from './campus';

/** Crowd intensity → path color (matches legacy twin legend). */
export function crowdColor(intensity: number): string {
  if (intensity < 0.33) return '#0f6b63';
  if (intensity < 0.66) return '#c47a12';
  return '#b42318';
}

export function hazardColor(type: DangerZone['type']): string {
  if (type === 'fire') return '#b42318';
  if (type === 'construction') return '#c47a12';
  return '#d97706';
}

export function buildCrowdByEdge(
  crowd: CrowdLevel[],
  edges: GraphEdge[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of crowd) {
    if (c.edgeId) m.set(c.edgeId, c.intensity);
  }
  for (const e of edges) {
    if (!m.has(e.id)) m.set(e.id, e.crowdScore);
  }
  return m;
}

export function campusCameraTarget(
  buildings: Building[],
  nodes: GraphNode[],
  fallback: { lat: number; lon: number } = CAMPUS_CENTER,
): { latitude: number; longitude: number; heightM: number } {
  const points =
    buildings.length > 0
      ? buildings.map((b) => ({ latitude: b.latitude, longitude: b.longitude }))
      : nodes.map((n) => ({ latitude: n.latitude, longitude: n.longitude }));

  if (points.length === 0) {
    return {
      latitude: fallback.lat,
      longitude: fallback.lon,
      heightM: 800,
    };
  }

  const latitude = points.reduce((s, p) => s + p.latitude, 0) / points.length;
  const longitude = points.reduce((s, p) => s + p.longitude, 0) / points.length;

  let maxSpanM = 120;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dLat = (points[j].latitude - points[i].latitude) * 110_540;
      const dLon =
        (points[j].longitude - points[i].longitude) *
        111_320 *
        Math.cos((latitude * Math.PI) / 180);
      maxSpanM = Math.max(maxSpanM, Math.hypot(dLat, dLon));
    }
  }

  return {
    latitude,
    longitude,
    heightM: Math.max(400, maxSpanM * 1.8),
  };
}

export function buildingHeightM(floorsCount: number): number {
  return Math.max(12, floorsCount * 3.5);
}
