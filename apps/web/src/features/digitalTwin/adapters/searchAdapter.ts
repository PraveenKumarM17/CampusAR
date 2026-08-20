import type { CampusPOI, DigitalTwinBuilding, ParkingArea, TwinSearchHit } from '../types/digitalTwin';

export function filterTwinBuildings(
  buildings: DigitalTwinBuilding[],
  query: string,
): DigitalTwinBuilding[] {
  const q = query.trim().toLowerCase();
  if (!q) return buildings;
  return buildings.filter(
    (b) =>
      b.name.toLowerCase().includes(q) ||
      b.code.toLowerCase().includes(q) ||
      (b.description ?? '').toLowerCase().includes(q),
  );
}

export function searchTwinObjects(input: {
  buildings: DigitalTwinBuilding[];
  pois: CampusPOI[];
  parking: ParkingArea[];
  query: string;
}): TwinSearchHit[] {
  const q = input.query.trim().toLowerCase();
  const parkingIds = new Set(input.parking.map((p) => p.id));
  const hits: TwinSearchHit[] = [];

  for (const building of input.buildings) {
    if (parkingIds.has(building.id)) continue;
    if (
      q &&
      !building.name.toLowerCase().includes(q) &&
      !building.code.toLowerCase().includes(q) &&
      !(building.description ?? '').toLowerCase().includes(q)
    ) {
      continue;
    }
    hits.push({
      id: building.id,
      name: building.name,
      type: 'building',
      latitude: building.latitude,
      longitude: building.longitude,
      subtitle: building.code,
    });
  }

  for (const poi of input.pois) {
    if (q && !poi.name.toLowerCase().includes(q) && !poi.category.toLowerCase().includes(q)) continue;
    hits.push({
      id: poi.id,
      name: poi.name,
      type: 'poi',
      latitude: poi.latitude,
      longitude: poi.longitude,
      subtitle: poi.category,
    });
  }

  for (const lot of input.parking) {
    if (q && !lot.name.toLowerCase().includes(q) && !q.includes('park')) continue;
    hits.push({
      id: lot.id,
      name: lot.name,
      type: 'parking',
      latitude: lot.latitude,
      longitude: lot.longitude,
      subtitle: 'Parking',
    });
  }

  if (!q) return hits;
  return hits;
}

export const SEARCH_KIND_LABEL: Record<TwinSearchHit['type'], string> = {
  building: 'Building',
  poi: 'POI',
  parking: 'Parking',
};
