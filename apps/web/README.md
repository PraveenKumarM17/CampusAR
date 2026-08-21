# CampusAR Web

## Map Stack (Phase 1 Transition)

CampusAR web currently keeps two map engines installed:

- `leaflet` + `react-leaflet` (+ `@geoman-io/leaflet-geoman-free`) for the legacy map stack.
- `maplibre-gl` + `terra-draw` (+ `terra-draw-maplibre-gl-adapter`) for the new outdoor map stack migration.

Engine selection is controlled by env vars:

- `VITE_MAP_ENGINE=leaflet|maplibre` (default: `leaflet`)
- `VITE_MAPLIBRE_STYLE_URL=<vector-style-url>`

Example:

```bash
VITE_MAP_ENGINE=maplibre
VITE_MAPLIBRE_STYLE_URL=https://demotiles.maplibre.org/style.json
```

Pages currently behind the flag:

- `MapBuilderPage` (draw + edit)
- `MapPage` / `NavigatePage` (read + navigation consumers)

`ArPage` is still Leaflet/Google-only and is intentionally not migrated yet.

Default `MAPLIBRE_STYLE_URL` uses MapLibre’s public demo tiles (`demotiles.maplibre.org`). That is fine for local development, but **not** a production basemap (no SLA; can rate-limit). Set `VITE_MAPLIBRE_STYLE_URL` to a real provider (MapTiler, Stadia, self-hosted) before shipping MapLibre as default.

MapLibre GL JS v6 needs an explicit Vite worker URL (`setWorkerUrl` via `src/lib/maplibreWorker.ts`). Without it the map never reaches `load`, so campus GeoJSON layers (including the route line) never attach.

During migration, keep both stacks available so pages can be moved one-by-one and parity-validated before Leaflet removal.
