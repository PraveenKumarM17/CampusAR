import {FALLBACK_MAP_CENTER, siteLabel, siteMapCenter} from '../lib/campus';
import {useSiteStore} from '../stores/siteStore';

export function useActiveSite() {
  const sites = useSiteStore(s => s.sites);
  const activeSiteId = useSiteStore(s => s.activeSiteId);
  const site = sites.find(s => s.id === activeSiteId) ?? sites[0] ?? null;
  const center = siteMapCenter(site);

  return {
    site,
    activeSiteId: site?.id ?? activeSiteId,
    label: siteLabel(site),
    mapCenter: center,
    latLon: site ? {lat: site.latitude, lon: site.longitude} : FALLBACK_MAP_CENTER,
  };
}
