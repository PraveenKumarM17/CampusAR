/** Apply a live event only when it belongs to the active site. Untagged events stay global. */
export function liveEventBelongsToSite(
  messageSiteId: string | null | undefined,
  activeSiteId: string | null | undefined,
): boolean {
  if (!messageSiteId || !activeSiteId) return true;
  return messageSiteId === activeSiteId;
}
