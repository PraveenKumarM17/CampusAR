/** Default campus: RNSIT, Channasandra, Bengaluru */
export const CAMPUS_CENTER = {
  lat: 12.9014,
  lon: 77.5184,
} as const;

export const CAMPUS_MAP_CENTER: [number, number] = [CAMPUS_CENTER.lat, CAMPUS_CENTER.lon];

export const CAMPUS_LABEL = 'RNSIT · Channasandra, Bengaluru';

/** Default map zoom to show full walkable campus */
export const CAMPUS_DEFAULT_ZOOM = 18;

/** Deepest zoom the user may reach; tiles above the native limit are upscaled. */
export const CAMPUS_MAX_ZOOM = 22;

/**
 * Esri and Carto serve blank placeholder tiles (HTTP 200) above z19 for this area,
 * so Leaflet must stretch z19 rather than request them.
 */
export const BASEMAP_MAX_NATIVE_ZOOM = 19;
