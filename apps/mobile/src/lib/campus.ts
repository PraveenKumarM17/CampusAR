import type {Site} from '@campusar/shared';

export const FALLBACK_MAP_CENTER = {lat: 12.9014, lon: 77.5184} as const;

export function resolveActiveSiteId(sites: Site[], current: string | null): string | null {
  if (current && sites.some(s => s.id === current)) return current;
  return sites[0]?.id ?? null;
}

export function siteLabel(site: Site | null | undefined): string {
  if (!site) return 'No site selected';
  return `${site.organizationName} · ${site.name}`;
}

export function siteMapCenter(site: Site | null | undefined): {latitude: number; longitude: number} {
  if (!site) {
    return {latitude: FALLBACK_MAP_CENTER.lat, longitude: FALLBACK_MAP_CENTER.lon};
  }
  return {latitude: site.latitude, longitude: site.longitude};
}
