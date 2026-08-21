# CampusAR Web

## Map Stack (Phase 1 Transition)

CampusAR web currently keeps two map engines installed:

- `leaflet` + `react-leaflet` (+ `@geoman-io/leaflet-geoman-free`) for the legacy map stack.
- `maplibre-gl` + `terra-draw` (+ `terra-draw-maplibre-gl-adapter`) for the new outdoor map stack migration.

Engine selection is controlled by env vars:

- `VITE_MAP_ENGINE=leaflet|maplibre` (default: `leaflet`)
- `VITE_GOOGLE_MAPS_API_KEY` (optional — Leaflet/Google path only; when unset, Leaflet uses Esri + CARTO)

Example:

```bash
VITE_MAP_ENGINE=maplibre
```

Basemap toggle (Hybrid / Satellite / Streets) is shared UI (`BasemapModeSwitcher`):

- **Leaflet:** Esri World Imagery (+ transport/labels for Hybrid), CARTO Voyager for Streets. Google Maps only if `VITE_GOOGLE_MAPS_API_KEY` is set.
- **MapLibre:** same Esri/CARTO raster tile URLs via `applyMapLibreBasemap` (no API key). Demotiles is no longer used as the live basemap.

**Production caveat:** there is no Esri/CARTO API key configured in this repo. Esri World Imagery is not a free unlimited public CDN for commercial production — it typically needs an ArcGIS Online / Location Platform subscription, attribution, and rate/tile quotas. CARTO’s public Voyager tiles are fine for light use but also have usage expectations. Treat the current keys-free raster URLs as **dev/demo defaults**; pick a licensed basemap provider (or self-hosted tiles) before production scale so this does not become basemap-outage #2.

Pages currently behind the flag (map canvas consumers):

- `MapBuilderPage` (draw + edit)
- `MapPage` / `NavigatePage` (read + navigation consumers)

`ArPage` is **not** a map-canvas page: it is camera + compass overlay (turn arrow, distance,
guide doll) driven by GPS/DeviceOrientation math and published route APIs. It does not import
Leaflet or MapLibre, does not use draft preview, and does not need `ensureMapLibreWorker()`.
`MAP_ENGINE` only affects the Map/Navigate pages you use to pick source/destination before opening AR.

MapLibre GL JS v6 needs an explicit Vite worker URL (`setWorkerUrl` via `src/lib/maplibreWorker.ts`). Without it the map never reaches `load`, so campus GeoJSON layers (including the route line) never attach.

During migration, keep both stacks available so pages can be moved one-by-one and parity-validated before Leaflet removal.
