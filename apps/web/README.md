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

During migration, keep both stacks available so pages can be moved one-by-one and parity-validated before Leaflet removal.
