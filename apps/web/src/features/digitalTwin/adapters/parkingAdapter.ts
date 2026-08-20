import type { Building } from '@campusar/shared';
import { PARKING_POLYGONS } from '../models/buildingGeometry';
import type { ParkingArea } from '../types/digitalTwin';
import { isParkingBuilding } from './buildingAdapter';
import { isValidWgs84 } from './coordinates';

/**
 * Parking from existing campus buildings (e.g. seed code PARK).
 * Uses a real polygon only when PARKING_POLYGONS is populated. Never invents stall counts.
 */
export function parkingAreasFromBuildings(buildings: Building[]): ParkingArea[] {
  const out: ParkingArea[] = [];
  for (const building of buildings) {
    if (!isParkingBuilding(building)) continue;
    if (!isValidWgs84(building)) continue;
    const geometry = PARKING_POLYGONS[building.id];
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

export function parkingEntityId(id: string): string {
  return `parking-${id}`;
}

export function parseParkingEntityId(entityId: string | undefined): string | null {
  if (!entityId?.startsWith('parking-')) return null;
  return entityId.slice('parking-'.length) || null;
}
