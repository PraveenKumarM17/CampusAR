import { AppError } from '../domain/errors';
import { query } from '../infrastructure/db/pool';
import { ringToWkt, type LatLng } from './geometry';

export interface FootprintValidationResult {
  valid: boolean;
  nPoints: number;
  areaM2: number;
}

export async function validateFootprintWkt(wkt: string): Promise<FootprintValidationResult> {
  const { rows } = await query<{
    valid: boolean;
    npoints: number;
    area_m2: number;
  }>(
    `SELECT
       ST_IsValid(g::geometry) AS valid,
       ST_NPoints(g::geometry) AS npoints,
       ST_Area(g::geography) AS area_m2
     FROM (SELECT ST_GeogFromText($1)::geography AS g) s`,
    [wkt],
  );
  const row = rows[0];
  if (!row?.valid) {
    throw new AppError('INVALID_GEOMETRY', 'Building footprint polygon is invalid', 422);
  }
  if (row.npoints < 4) {
    throw new AppError(
      'INVALID_GEOMETRY',
      'Building footprint must be a closed polygon with at least 3 vertices',
      422,
    );
  }
  if (!Number.isFinite(row.area_m2) || row.area_m2 < 1) {
    throw new AppError('INVALID_GEOMETRY', 'Building footprint area is too small', 422);
  }
  return { valid: true, nPoints: row.npoints, areaM2: row.area_m2 };
}

export async function centroidFromFootprintWkt(wkt: string): Promise<LatLng> {
  await validateFootprintWkt(wkt);
  const { rows } = await query<{ latitude: number; longitude: number }>(
    `SELECT
       ST_Y(ST_Centroid(g::geometry)) AS latitude,
       ST_X(ST_Centroid(g::geometry)) AS longitude
     FROM (SELECT ST_GeogFromText($1)::geography AS g) s`,
    [wkt],
  );
  const row = rows[0];
  if (!row || !Number.isFinite(row.latitude) || !Number.isFinite(row.longitude)) {
    throw new AppError('INVALID_GEOMETRY', 'Could not derive footprint centroid', 422);
  }
  return { latitude: Number(row.latitude), longitude: Number(row.longitude) };
}

export async function prepareFootprintWkt(ring: LatLng[]): Promise<string> {
  const wkt = ringToWkt(ring);
  await validateFootprintWkt(wkt);
  return wkt;
}

/** Haversine distance in meters between two WGS84 points. */
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function centroidDriftMeters(
  footprint: LatLng[],
  latitude: number,
  longitude: number,
): number {
  if (footprint.length < 3) return 0;
  let latSum = 0;
  let lonSum = 0;
  const open =
    footprint.length > 1 &&
    footprint[0].latitude === footprint[footprint.length - 1].latitude &&
    footprint[0].longitude === footprint[footprint.length - 1].longitude
      ? footprint.slice(0, -1)
      : footprint;
  for (const p of open) {
    latSum += p.latitude;
    lonSum += p.longitude;
  }
  const cLat = latSum / open.length;
  const cLon = lonSum / open.length;
  return haversineMeters(cLat, cLon, latitude, longitude);
}
