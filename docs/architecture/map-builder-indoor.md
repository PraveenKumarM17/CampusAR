# Indoor Map Builder (Phase 2.5C)

The Indoor Map Builder extends the canonical Map Builder with floor-plan authoring for any organization site.

## Routes

- Outdoor: `/admin/map-builder`
- Indoor building picker: `/admin/map-builder/indoor`
- Indoor editor: `/admin/map-builder/indoor/:buildingId`

## Coordinate system

**`floor-plan-meters-v1`** — building-local 2D floor coordinates in meters.

- Origin `(0, 0)` is the floor plan reference corner for that floor.
- `+X` is horizontal (east on the 2D plan view).
- `+Y` is vertical (north on the 2D plan view).
- **Not WGS84.** Room polygons do not use latitude/longitude.

Indoor AR routing continues to use **`ar-local-meters-v1`** (`localX/localY/localZ` on `indoor_nodes`). Phase 2.5D will connect floor-plan geometry to the indoor navigation graph.

## Canonical data

| Feature | Storage | Notes |
|---------|---------|-------|
| Floors | `floors` | `level` (floor number), `name` (display), unique per building |
| Room polygons | `rooms.local_geometry` JSONB | Extends existing `rooms` catalog |
| Corridors | `floor_corridors.local_geometry` | Polygon in floor-plan meters |
| Indoor POIs | `floor_pois` | Point features on a floor |
| Indoor routing graph | `indoor_maps`, `indoor_nodes`, `indoor_edges` | Unchanged; not replaced |

## API (map editor)

All routes require `requireMapEditor` and resolve site via `X-Site-Id` / `resolveEditorSiteId`.

- `GET /api/admin/map-builder/indoor/snapshot?buildingId=`
- `GET /api/admin/map-builder/indoor/validate?buildingId=`
- Floor / room / corridor / POI CRUD under `/api/admin/map-builder/indoor/...`

Public read: `GET /api/campus/buildings/:buildingId/indoor-layout?floorId=`

## Editing workflow

Same principles as outdoor Map Builder 2.5B.1:

- Local canvas edits until explicit Save
- Cancel restores snapshot
- Unsaved guards on floor switch
- Optimistic concurrency via `updated_at` / `expectedUpdatedAt` → `409 STALE_EDIT`

## Digital Twin preparation

Floor-plan polygons are stored in canonical tables with stable UUIDs. Future Twin can extrude `rooms.local_geometry` and `floor_corridors.local_geometry` into a building-local 3D scene aligned with the outdoor footprint anchor.

## Phase 2.5D scope (not in 2.5C)

- Indoor navigation graph editor (nodes/edges on floor canvas)
- Link rooms to `indoor_places` / routing destinations
- Bridge `rooms` catalog with indoor search
- Draft/publish workflow unification
