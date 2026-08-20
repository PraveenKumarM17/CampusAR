import type { Building } from '@campusar/shared';
import { GREEN_AREA_POLYGONS } from '../models/buildingGeometry';
import type { GreenArea } from '../types/digitalTwin';
import { isOpenAreaBuilding } from './buildingAdapter';
import { isValidWgs84 } from './coordinates';

/**
 * Open / sports areas that already exist as campus buildings (Ground A/B, basketball).
 * Markers at real coordinates. Polygons only when GREEN_AREA_POLYGONS has surveyed rings.
 */
export function greenAreasFromBuildings(buildings: Building[]): GreenArea[] {
  const out: GreenArea[] = [];
  for (const building of buildings) {
    if (!isOpenAreaBuilding(building)) continue;
    if (!isValidWgs84(building)) continue;
    const geometry = GREEN_AREA_POLYGONS[building.id];
    out.push({
      id: building.id,
      name: building.name,
      latitude: building.latitude,
      longitude: building.longitude,
      geometry: geometry && geometry.length >= 3 ? geometry : undefined,
    });
  }
  return out;
}

export function greenEntityId(id: string): string {
  return `green-${id}`;
}

export function parseGreenEntityId(entityId: string | undefined): string | null {
  if (!entityId?.startsWith('green-')) return null;
  return entityId.slice('green-'.length) || null;
}
