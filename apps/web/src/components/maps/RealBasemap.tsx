import { TileLayer } from 'react-leaflet';

import { BASEMAP_MAX_NATIVE_ZOOM, CAMPUS_MAX_ZOOM } from '../../lib/campus';

export type BasemapMode = 'hybrid' | 'satellite' | 'streets';

/**
 * Real-world basemap tiles: satellite imagery + road/place labels
 * (Esri World Imagery + transportation / places overlays — buildings & roads visible).
 * Used by Leaflet only. MapLibre uses the same tile URLs via `applyMapLibreBasemap`.
 */
export function RealBasemapTiles({ mode = 'hybrid' }: { mode?: BasemapMode }) {
  if (mode === 'streets') {
    return (
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        maxZoom={CAMPUS_MAX_ZOOM}
        maxNativeZoom={BASEMAP_MAX_NATIVE_ZOOM}
      />
    );
  }

  return (
    <>
      <TileLayer
        attribution="Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics"
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        maxZoom={CAMPUS_MAX_ZOOM}
        maxNativeZoom={BASEMAP_MAX_NATIVE_ZOOM}
      />
      {mode === 'hybrid' && (
        <>
          <TileLayer
            attribution="Roads &copy; Esri"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"
            maxZoom={CAMPUS_MAX_ZOOM}
            maxNativeZoom={BASEMAP_MAX_NATIVE_ZOOM}
            opacity={0.95}
          />
          <TileLayer
            attribution="Labels &copy; Esri"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
            maxZoom={CAMPUS_MAX_ZOOM}
            maxNativeZoom={BASEMAP_MAX_NATIVE_ZOOM}
            opacity={0.95}
          />
        </>
      )}
    </>
  );
}

export function BasemapModeSwitcher({
  mode,
  onChange,
}: {
  mode: BasemapMode;
  onChange: (m: BasemapMode) => void;
}) {
  const options: { id: BasemapMode; label: string }[] = [
    { id: 'hybrid', label: 'Hybrid' },
    { id: 'satellite', label: 'Satellite' },
    { id: 'streets', label: 'Streets' },
  ];
  return (
    <div className="absolute left-3 top-3 z-[1000] inline-flex overflow-hidden rounded-md border border-line bg-paper-raised shadow-sm">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={`px-2.5 py-1.5 text-xs font-semibold ${
            mode === o.id ? 'bg-accent text-white' : 'text-ink-mute hover:bg-paper-soft'
          }`}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
