import { AppError } from '../domain/errors';

export type LatLng = { latitude: number; longitude: number };

export function isValidCoordinate(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

export function closeRing(ring: LatLng[]): LatLng[] {
  if (ring.length < 3) {
    throw new AppError('INVALID_GEOMETRY', 'Polygon requires at least 3 vertices', 422);
  }
  for (const p of ring) {
    if (!isValidCoordinate(p.latitude, p.longitude)) {
      throw new AppError('INVALID_GEOMETRY', 'Coordinates are out of valid WGS84 range', 422);
    }
  }
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first.latitude === last.latitude && first.longitude === last.longitude) return ring;
  return [...ring, { latitude: first.latitude, longitude: first.longitude }];
}

export function ringToWkt(ring: LatLng[]): string {
  const closed = closeRing(ring);
  const coords = closed.map((p) => `${p.longitude} ${p.latitude}`).join(', ');
  return `POLYGON((${coords}))`;
}

/** GeoJSON Polygon from PostGIS ST_AsGeoJSON */
export function footprintFromGeoJson(geojson: unknown): LatLng[] | undefined {
  if (!geojson || typeof geojson !== 'object') return undefined;
  const g = geojson as { type?: string; coordinates?: unknown };
  if (g.type !== 'Polygon' || !Array.isArray(g.coordinates) || !Array.isArray(g.coordinates[0])) {
    return undefined;
  }
  const ring = g.coordinates[0] as number[][];
  const pts: LatLng[] = [];
  for (const coord of ring) {
    if (!Array.isArray(coord) || coord.length < 2) continue;
    const [lon, lat] = coord;
    if (!isValidCoordinate(lat, lon)) continue;
    pts.push({ latitude: lat, longitude: lon });
  }
  if (pts.length < 3) return undefined;
  if (pts.length > 1) {
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (first.latitude === last.latitude && first.longitude === last.longitude) {
      pts.pop();
    }
  }
  return pts.length >= 3 ? pts : undefined;
}

export function ringCentroid(ring: LatLng[]): LatLng {
  const open = ring.length > 0 &&
    ring[0].latitude === ring[ring.length - 1].latitude &&
    ring[0].longitude === ring[ring.length - 1].longitude
    ? ring.slice(0, -1)
    : ring;
  if (open.length === 0) {
    throw new AppError('INVALID_GEOMETRY', 'Cannot compute centroid of empty ring', 422);
  }
  let latSum = 0;
  let lonSum = 0;
  for (const p of open) {
    latSum += p.latitude;
    lonSum += p.longitude;
  }
  return { latitude: latSum / open.length, longitude: lonSum / open.length };
}
