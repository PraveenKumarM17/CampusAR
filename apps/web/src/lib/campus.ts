import type { Site } from '@campusar/shared';

/** Development/test fallback only — live map center comes from GET /api/sites. */
export const FALLBACK_MAP_CENTER = {
  lat: 12.9014,
  lon: 77.5184,
} as const;

/** @deprecated Use active site metadata. Kept for tests and GPS fallback. */
export const CAMPUS_CENTER = FALLBACK_MAP_CENTER;

export const CAMPUS_MAP_CENTER: [number, number] = [FALLBACK_MAP_CENTER.lat, FALLBACK_MAP_CENTER.lon];

export const CAMPUS_DEFAULT_ZOOM = 18;
export const CAMPUS_MAX_ZOOM = 22;
export const BASEMAP_MAX_NATIVE_ZOOM = 19;

export function resolveActiveSiteId(sites: Site[], current: string | null): string | null {
  if (current && sites.some((s) => s.id === current)) return current;
  return sites[0]?.id ?? null;
}

export function siteMapCenter(site: Site | null | undefined): [number, number] {
  if (!site) return CAMPUS_MAP_CENTER;
  return [site.latitude, site.longitude];
}

export function siteLabel(site: Site | null | undefined): string {
  if (!site) return 'No site selected';
  return `${site.organizationName} · ${site.name}`;
}

export function siteHasPublishedMap(counts: { buildings: number; nodes: number; edges: number }): boolean {
  return counts.buildings > 0 || counts.nodes > 0 || counts.edges > 0;
}

export const EMPTY_SITE_MESSAGE = 'No map data has been published for this site yet.';
