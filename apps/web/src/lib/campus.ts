/** Default campus: RNSIT, Channasandra, Bengaluru */
export const CAMPUS_CENTER = {
  lat: 12.9014,
  lon: 77.5184,
} as const;

export const CAMPUS_MAP_CENTER: [number, number] = [CAMPUS_CENTER.lat, CAMPUS_CENTER.lon];

export const CAMPUS_LABEL = 'RNSIT · Channasandra, Bengaluru';

/** Default map zoom to show full walkable campus */
export const CAMPUS_DEFAULT_ZOOM = 18;
