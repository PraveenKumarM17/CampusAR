export type MapEngine = 'leaflet' | 'maplibre';

const raw = (import.meta.env.VITE_MAP_ENGINE ?? 'leaflet').toLowerCase();

export const MAP_ENGINE: MapEngine = raw === 'maplibre' ? 'maplibre' : 'leaflet';

export const MAPLIBRE_STYLE_URL =
  import.meta.env.VITE_MAPLIBRE_STYLE_URL?.trim() ||
  'https://demotiles.maplibre.org/style.json';
