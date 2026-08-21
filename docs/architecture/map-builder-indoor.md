# Indoor Map Builder (Phases 2.5C + 2.5D)

The Indoor Map Builder extends the canonical Map Builder with floor-plan authoring and indoor navigation graph editing for any organization site.

## Routes

- Outdoor: `/admin/map-builder`
- Indoor building picker: `/admin/map-builder/indoor`
- Indoor editor: `/admin/map-builder/indoor/:buildingId`

## Coordinate systems

**`floor-plan-meters-v1`** — building-local 2D floor coordinates in meters (Map Builder canvas).

- Origin `(0, 0)` is the floor plan reference corner for that floor.
- `+X` horizontal, `+Y` vertical on the 2D plan view.
- **Not WGS84.**

**`ar-local-meters-v1`** — canonical indoor routing frame on `indoor_nodes`:

- `localX` = floor-plan X
- `localZ` = floor-plan Y
- `localY` = vertical elevation (default 0 on a floor)

The map builder converts between these when placing or moving navigation nodes.

## Canonical data

| Feature | Storage | Notes |
|---------|---------|-------|
| Floors | `floors` | `level`, `name`, `updated_at` |
| Room polygons | `rooms.local_geometry` | Floor-plan polygon |
| Corridors | `floor_corridors.local_geometry` | Polygon |
| Indoor POIs | `floor_pois` | Point features |
| Navigation graph | `indoor_maps`, `indoor_nodes`, `indoor_edges` | Single canonical graph |
| Destinations / search | `indoor_places` | Linked to rooms via `metadata.roomId` |
| Outdoor → indoor | `indoor_handoffs` | Outdoor `nodes` → `indoor_nodes` |

## API (map editor)

All routes require `requireMapEditor` and site context via `X-Site-Id`.

**Floor plan (2.5C):**

- `GET /api/admin/map-builder/indoor/snapshot?buildingId=`
- `GET /api/admin/map-builder/indoor/validate?buildingId=`
- Floor / room / corridor / POI CRUD

**Navigation graph (2.5D):**

- `GET /api/admin/map-builder/indoor/graph/snapshot?buildingId=` — layout + graph bundle
- `POST /api/admin/map-builder/indoor/graph/ensure-map`
- Node / edge / room-link / handoff CRUD under `/api/admin/map-builder/indoor/graph/...`

Legacy Unity/admin clients may also mutate via `/api/indoor/*` using `requireMapEditor` (platform admin or org/site admin with site scope).

Public read: `GET /api/campus/buildings/:buildingId/indoor-layout?floorId=`

## Editing workflow

- Floor-plan geometry: local canvas until explicit Save (2.5B.1 model)
- Navigation nodes: created/moved/deleted via canonical API (move saved on pointer-up)
- Connect tool: pick node A, then node B to create an edge
- Room linking: creates `room_entrance` node + `indoor_places` row with `metadata.roomId`
- Handoff: pick outdoor entrance, then indoor node
- Validation covers layout **and** graph connectivity (errors + warnings)

## Phase 2.5E (not yet)

- Unified Draft → Validate → Preview → Publish for outdoor + indoor together
- Full publish gate before public navigation consumes draft graph edits
