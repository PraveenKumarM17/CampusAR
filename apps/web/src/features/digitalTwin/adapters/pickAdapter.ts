import type { TwinPick, TwinPickKind } from '../types/digitalTwin';
import { parseBuildingEntityId } from './buildingAdapter';
import { parseEntranceEntityId } from './entranceAdapter';
import { parseGreenEntityId } from './greenAreaAdapter';
import { parseParkingEntityId } from './parkingAdapter';
import { parsePoiEntityId } from './poiAdapter';

export function parseTwinPick(entityId: string | undefined): TwinPick | null {
  if (!entityId) return null;
  const buildingId = parseBuildingEntityId(entityId);
  if (buildingId) return { kind: 'building', id: buildingId };
  const entranceId = parseEntranceEntityId(entityId);
  if (entranceId) return { kind: 'entrance', id: entranceId };
  const poiId = parsePoiEntityId(entityId);
  if (poiId) return { kind: 'poi', id: poiId };
  const parkingId = parseParkingEntityId(entityId);
  if (parkingId) return { kind: 'parking', id: parkingId };
  const greenId = parseGreenEntityId(entityId);
  if (greenId) return { kind: 'green', id: greenId };
  return null;
}

export function pickKindLabel(kind: TwinPickKind): string {
  if (kind === 'building') return 'Building';
  if (kind === 'poi') return 'POI';
  if (kind === 'entrance') return 'Entrance';
  if (kind === 'parking') return 'Parking';
  return 'Open area';
}
