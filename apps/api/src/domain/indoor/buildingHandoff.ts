/** Building-scoped indoor handoff helpers. Keep messages user-facing. */

export function indoorAnchorBuildingError(expectedName: string, actualName: string): string {
  return `This marker belongs to ${actualName}. Please scan a marker inside ${expectedName}.`;
}

export function indoorPlaceBuildingError(expectedName: string, actualName: string): string {
  return `That place is in ${actualName}, not ${expectedName}. Choose a destination inside ${expectedName}.`;
}

export function publishedIndoorMapAvailable(
  indoorMap: { status: string; active?: boolean } | null | undefined,
): boolean {
  return indoorMap?.status === 'published' && indoorMap.active !== false;
}

export function placeBelongsToBuilding(
  place: { buildingId: string; active?: boolean } | null | undefined,
  buildingId: string,
): boolean {
  return Boolean(place?.buildingId === buildingId && place.active !== false);
}
