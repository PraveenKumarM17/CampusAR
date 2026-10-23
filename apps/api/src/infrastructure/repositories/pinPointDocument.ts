export interface PinPointRecord {
  id: string;
  stableId: string | null;
  siteId: string | null;
  mapVersionId: string | null;
  name: string | null;
  latitude: number;
  longitude: number;
  floorId: string | null;
  buildingId: string | null;
  kind: string;
  active: boolean;
  updatedAt: string | null;
}

export interface PinPointDoc {
  /** Postgres node id; set by the upsert filter, not by toPinPointDoc. */
  _id?: string;
  stableId: string | null;
  siteId: string | null;
  mapVersionId: string | null;
  name: string | null;
  latitude: number;
  longitude: number;
  floorId: string | null;
  buildingId: string | null;
  kind: string;
  active: boolean;
  updatedAt: Date | null;
  /** GeoJSON point, coordinates are [longitude, latitude]. */
  location: { type: 'Point'; coordinates: [number, number] };
}

export function toPinPointDoc(row: PinPointRecord): PinPointDoc {
  return {
    stableId: row.stableId,
    siteId: row.siteId,
    mapVersionId: row.mapVersionId,
    name: row.name,
    latitude: row.latitude,
    longitude: row.longitude,
    floorId: row.floorId,
    buildingId: row.buildingId,
    kind: row.kind,
    active: row.active,
    updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    location: { type: 'Point', coordinates: [row.longitude, row.latitude] },
  };
}
