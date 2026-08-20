import type { TwinLatLng } from '../types/digitalTwin';

export function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isValidLatitude(value: unknown): value is number {
  return isFiniteCoordinate(value) && Math.abs(value) <= 90;
}

export function isValidLongitude(value: unknown): value is number {
  return isFiniteCoordinate(value) && Math.abs(value) <= 180;
}

export function isValidWgs84(point: { latitude?: unknown; longitude?: unknown }): boolean {
  return isValidLatitude(point.latitude) && isValidLongitude(point.longitude);
}

/**
 * Cesium `Cartesian3.fromDegrees` and `fromDegreesArray` take longitude first.
 * CampusAR API / PostGIS seed data store WGS84 as latitude, longitude.
 */
export function toCesiumLonLat(point: TwinLatLng): { longitude: number; latitude: number } {
  return { longitude: point.longitude, latitude: point.latitude };
}

/** Interleaved [lon, lat, lon, lat, ...] for Cesium.fromDegreesArray. */
export function toCesiumDegreesArray(points: TwinLatLng[]): number[] {
  const out: number[] = [];
  for (const point of points) {
    if (!isValidWgs84(point)) continue;
    out.push(point.longitude, point.latitude);
  }
  return out;
}

export function rejectInvalidCoordinates<T extends { latitude?: unknown; longitude?: unknown }>(
  items: T[],
): T[] {
  return items.filter((item) => isValidWgs84(item));
}
