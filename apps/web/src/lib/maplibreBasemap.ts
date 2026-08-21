import type { BasemapMode } from '../components/maps/RealBasemap';
import type { StyleSpecification } from 'maplibre-gl';
import type * as maplibregl from 'maplibre-gl';

/** Same Esri imagery URL Leaflet `RealBasemapTiles` uses (no API key). */
export const ESRI_WORLD_IMAGERY_TILES = [
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
];

export const ESRI_WORLD_TRANSPORTATION_TILES = [
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
];

export const ESRI_WORLD_BOUNDARIES_TILES = [
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
];

/** Same CARTO Voyager streets tiles Leaflet uses (MapLibre needs explicit {a,b,c,d} hosts). */
export const CARTO_VOYAGER_TILES = [
  'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
  'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
  'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
  'https://d.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
];

const SOURCE_STREETS = 'ml-basemap-streets';
const SOURCE_IMAGERY = 'ml-basemap-imagery';
const SOURCE_TRANSPORT = 'ml-basemap-transport';
const SOURCE_LABELS = 'ml-basemap-labels';

const LAYER_STREETS = 'ml-basemap-streets';
const LAYER_IMAGERY = 'ml-basemap-imagery';
const LAYER_TRANSPORT = 'ml-basemap-transport';
const LAYER_LABELS = 'ml-basemap-labels';

const ALL_SOURCES = [SOURCE_STREETS, SOURCE_IMAGERY, SOURCE_TRANSPORT, SOURCE_LABELS];
const ALL_LAYERS = [LAYER_STREETS, LAYER_IMAGERY, LAYER_TRANSPORT, LAYER_LABELS];

/** Empty style shell — campus overlays + basemap rasters are added at runtime. */
export function emptyMapLibreStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [],
  };
}

function removeBasemap(map: maplibregl.Map) {
  for (const id of ALL_LAYERS) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  for (const id of ALL_SOURCES) {
    if (map.getSource(id)) map.removeSource(id);
  }
}

/** First non-basemap layer id, so rasters stay under campus overlays. */
function firstOverlayLayerId(map: maplibregl.Map): string | undefined {
  const layers = map.getStyle()?.layers ?? [];
  return layers.find((l) => !l.id.startsWith('ml-basemap-'))?.id;
}

function canMutateStyle(map: maplibregl.Map): boolean {
  try {
    // Empty raster styles may never report isStyleLoaded()===true; getStyle() is enough.
    return Boolean(map.getStyle());
  } catch {
    return false;
  }
}

/**
 * Apply Esri/CARTO raster basemap (parity with Leaflet `RealBasemapTiles`).
 * Safe to call repeatedly when the mode changes; does not touch campus layers.
 */
export function applyMapLibreBasemap(map: maplibregl.Map, mode: BasemapMode): void {
  if (!canMutateStyle(map)) return;
  removeBasemap(map);
  const beforeId = firstOverlayLayerId(map);

  if (mode === 'streets') {
    map.addSource(SOURCE_STREETS, {
      type: 'raster',
      tiles: CARTO_VOYAGER_TILES,
      tileSize: 256,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/">CARTO</a>',
    });
    map.addLayer(
      { id: LAYER_STREETS, type: 'raster', source: SOURCE_STREETS, paint: { 'raster-opacity': 1 } },
      beforeId,
    );
    return;
  }

  map.addSource(SOURCE_IMAGERY, {
    type: 'raster',
    tiles: ESRI_WORLD_IMAGERY_TILES,
    tileSize: 256,
    attribution: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics',
  });
  map.addLayer(
    { id: LAYER_IMAGERY, type: 'raster', source: SOURCE_IMAGERY, paint: { 'raster-opacity': 1 } },
    beforeId,
  );

  if (mode === 'hybrid') {
    map.addSource(SOURCE_TRANSPORT, {
      type: 'raster',
      tiles: ESRI_WORLD_TRANSPORTATION_TILES,
      tileSize: 256,
      attribution: 'Roads © Esri',
    });
    map.addLayer(
      {
        id: LAYER_TRANSPORT,
        type: 'raster',
        source: SOURCE_TRANSPORT,
        paint: { 'raster-opacity': 0.95 },
      },
      beforeId,
    );
    map.addSource(SOURCE_LABELS, {
      type: 'raster',
      tiles: ESRI_WORLD_BOUNDARIES_TILES,
      tileSize: 256,
      attribution: 'Labels © Esri',
    });
    map.addLayer(
      {
        id: LAYER_LABELS,
        type: 'raster',
        source: SOURCE_LABELS,
        paint: { 'raster-opacity': 0.95 },
      },
      beforeId,
    );
  }
}

export const MAPLIBRE_BASEMAP_LAYER_PREFIX = 'ml-basemap-';
