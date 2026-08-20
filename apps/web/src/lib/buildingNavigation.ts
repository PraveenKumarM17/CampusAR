import type { Floor, IndoorBuildingContext, IndoorPlace, IndoorTransitionStatus } from '@campusar/shared';

export const BUILDING_CONTEXT_CACHE_MS = 5 * 60 * 1000;

type CacheEntry = { at: number; data: IndoorBuildingContext };
const contextCache = new Map<string, CacheEntry>();

export function clearBuildingContextCache(buildingId?: string): void {
  if (buildingId) contextCache.delete(buildingId);
  else contextCache.clear();
}

export async function loadBuildingContext(
  buildingId: string,
  fetchContext: (id: string) => Promise<IndoorBuildingContext>,
  now = Date.now(),
): Promise<IndoorBuildingContext> {
  const hit = contextCache.get(buildingId);
  if (hit && now - hit.at < BUILDING_CONTEXT_CACHE_MS) return hit.data;
  const data = await fetchContext(buildingId);
  contextCache.set(buildingId, { at: now, data });
  return data;
}

export function hasPublishedIndoorMap(ctx: IndoorBuildingContext | null | undefined): boolean {
  return ctx?.indoorMap?.status === 'published';
}

export interface BuildingNavPatch {
  selectedBuildingId: string;
  selectedBuildingName: string;
  hasIndoorMap: boolean;
  indoorMapId: string | null;
  outdoorEntranceNodeId: string | null;
  indoorDestinationPlaceId: null;
  indoorDestinationName: null;
  indoorDestinationDetail: null;
  arrivalPromptShown: false;
  indoorPickerDismissed: false;
  transitionStatus: IndoorTransitionStatus;
}

export function buildingContextToNavPatch(ctx: IndoorBuildingContext): BuildingNavPatch {
  const indoor = hasPublishedIndoorMap(ctx);
  const entranceId = ctx.entrance?.outdoorNodeId ?? null;
  return {
    selectedBuildingId: ctx.building.id,
    selectedBuildingName: ctx.building.name,
    hasIndoorMap: indoor,
    indoorMapId: ctx.indoorMap?.id ?? null,
    outdoorEntranceNodeId: entranceId,
    indoorDestinationPlaceId: null,
    indoorDestinationName: null,
    indoorDestinationDetail: null,
    arrivalPromptShown: false,
    indoorPickerDismissed: false,
    transitionStatus: indoor && entranceId ? 'navigating_outdoor' : 'none',
  };
}

export function outdoorDestinationForBuilding(patch: BuildingNavPatch): string | null {
  return patch.outdoorEntranceNodeId;
}

export function shouldOpenIndoorPicker(input: {
  arrived: boolean;
  hasIndoorMap: boolean;
  arrivalPromptShown: boolean;
}): boolean {
  return input.arrived && input.hasIndoorMap && !input.arrivalPromptShown;
}

export function indoorPickerVisible(input: {
  hasIndoorMap: boolean;
  indoorPickerDismissed: boolean;
  indoorDestinationPlaceId: string | null;
  transitionStatus: IndoorTransitionStatus;
}): boolean {
  if (!input.hasIndoorMap || input.indoorPickerDismissed || input.indoorDestinationPlaceId) {
    return false;
  }
  return (
    input.transitionStatus === 'arrived_at_building' ||
    input.transitionStatus === 'selecting_indoor_destination'
  );
}

export function indoorConfirmVisible(input: {
  indoorDestinationPlaceId: string | null;
  transitionStatus: IndoorTransitionStatus;
}): boolean {
  return (
    Boolean(input.indoorDestinationPlaceId) &&
    (input.transitionStatus === 'waiting_for_anchor' ||
      input.transitionStatus === 'selecting_indoor_destination')
  );
}

export function placeBelongsToBuilding(
  place: { buildingId: string } | null | undefined,
  buildingId: string,
): boolean {
  return place?.buildingId === buildingId;
}

export function filterPlacesForBuilding(places: IndoorPlace[], buildingId: string): IndoorPlace[] {
  return places.filter((p) => p.buildingId === buildingId);
}

export function placeAncestryLabels(place: IndoorPlace, places: IndoorPlace[]): string[] {
  const byId = new Map(places.map((p) => [p.id, p]));
  const labels: string[] = [];
  let current: IndoorPlace | undefined = place;
  const seen = new Set<string>();
  while (current?.parentPlaceId && !seen.has(current.id)) {
    seen.add(current.id);
    const parent = byId.get(current.parentPlaceId);
    if (!parent) break;
    labels.push(parent.name);
    current = parent;
  }
  return labels;
}

export function placeFloorLabel(place: IndoorPlace, floors: Floor[]): string | null {
  if (!place.floorId) return null;
  return floors.find((f) => f.id === place.floorId)?.name ?? null;
}

export function formatPlaceHierarchy(place: IndoorPlace, places: IndoorPlace[], floors: Floor[]): string {
  const parts = [...placeAncestryLabels(place, places)];
  const floor = placeFloorLabel(place, floors);
  if (floor) parts.push(floor);
  return parts.join(' → ');
}

export function parseIndoorParams(search: string): {
  building: string | null;
  destination: string | null;
  map: string | null;
} {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const building = params.get('building');
  const destination = params.get('destination');
  const map = params.get('map');
  return {
    building: building && uuid.test(building) ? building : null,
    destination: destination && uuid.test(destination) ? destination : null,
    map: map && uuid.test(map) ? map : null,
  };
}

export function buildIndoorNavPath(
  buildingId: string,
  destinationPlaceId: string,
  mapId?: string | null,
): string {
  const params = new URLSearchParams({ building: buildingId, destination: destinationPlaceId });
  if (mapId) params.set('map', mapId);
  return `/indoor?${params.toString()}`;
}

export function cancelIndoorScanStatus(): IndoorTransitionStatus {
  return 'waiting_for_anchor';
}

export function afterIndoorCompletePatch() {
  return {
    indoorDestinationPlaceId: null as string | null,
    indoorDestinationName: null as string | null,
    indoorDestinationDetail: null as string | null,
    arrivalPromptShown: false,
    indoorPickerDismissed: false,
    transitionStatus: 'none' as IndoorTransitionStatus,
    hasIndoorMap: false,
    indoorMapId: null as string | null,
    selectedBuildingId: null as string | null,
    selectedBuildingName: null as string | null,
    outdoorEntranceNodeId: null as string | null,
  };
}
