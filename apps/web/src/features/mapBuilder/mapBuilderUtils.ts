import type { GeoPoint } from '@campusar/shared';
import type L from 'leaflet';

export function cloneGeoRing(ring: GeoPoint[]): GeoPoint[] {
  return ring.map((p) => ({ latitude: p.latitude, longitude: p.longitude }));
}

export function ringToLatLngs(ring: GeoPoint[]): [number, number][] {
  return ring.map((p) => [p.latitude, p.longitude]);
}

export function ringFromPolygonLayer(layer: L.Polygon): GeoPoint[] {
  const latlngs = layer.getLatLngs();
  const ringRaw = (Array.isArray(latlngs[0]) ? latlngs[0] : latlngs) as L.LatLng[];
  return ringRaw.map((ll) => ({ latitude: ll.lat, longitude: ll.lng }));
}

export function ringsEqual(a: GeoPoint[], b: GeoPoint[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((p, i) => p.latitude === b[i].latitude && p.longitude === b[i].longitude);
}

export type UnsavedChoice = 'stay' | 'discard' | 'save';

export interface GeometryEditSession {
  buildingId: string;
  originalFootprint: GeoPoint[];
  draftFootprint: GeoPoint[];
  expectedUpdatedAt?: string;
}
