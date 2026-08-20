# Outdoor Map Builder (Phase 2.5B)

The Map Builder is the first canonical outdoor map-authoring experience in CampusAR. It edits the same site-scoped spatial data consumed by Leaflet, navigation routing, Cesium Digital Twin, and future AR.

## Route

- Frontend: `/admin/map-builder`
- API snapshot: `GET /api/admin/map-builder/snapshot`
- API validation: `GET /api/admin/map-builder/validate`

## Canonical data

| Feature | Storage | Notes |
|---------|---------|-------|
| Building footprint | `buildings.footprint_geom` (`GEOGRAPHY(POLYGON,4326)`) | Nullable; legacy point buildings remain valid |
| Building center | `buildings.latitude/longitude` | Updated from footprint centroid when footprint saved |
| Navigation graph | `nodes`, `edges` | Same A* graph as `/navigate` |
| Entrances | `nodes.kind = 'entrance'` + `building_id` | Not a separate dataset |
| POIs | Named outdoor `nodes` | Search and map treat named nodes as places |
| Areas | `site_areas` | Parking, open, restricted, assembly polygons |

There is **no draft/publish workflow** in this phase. Saves write directly to the active canonical map.

## Authorization

Map Builder write APIs use `requireMapEditor`:

- Platform `admin` users
- Organization `org_admin` members
- `site_admin` members for assigned sites

Members and guests receive `403`. Every write resolves site context via `resolveEditorSiteId`:

- `X-Site-Id` header (preferred)
- Auto-resolve when the editor has exactly one editable site
- `SITE_CONTEXT_REQUIRED` when ambiguous — never silently uses the oldest site

## Validation

`GET /api/admin/map-builder/validate` reports errors (invalid geometry, cross-site references, dangling edges) and warnings (no footprint, no entrance, disconnected graph).

## Legacy compatibility

Existing RNSIT buildings keep their UUIDs and point coordinates. Footprints are optional until an administrator draws them in Map Builder.

## Dependencies

- `@geoman-io/leaflet-geoman-free` — polygon drawing and editing on Leaflet

## Stabilization (Phase 2.5B.1)

- Existing building footprints can be edited in Map Builder via **Edit geometry** (Leaflet-Geoman vertex drag).
- Geometry edits are local until **Save geometry**; **Cancel** restores the loaded snapshot without an API call.
- Unsaved geometry prompts **Save / Discard / Stay** when switching sites or features.
- Building `latitude`/`longitude` are derived server-side from `footprint_geom` via PostGIS `ST_Centroid` and cannot be edited independently when a footprint exists.
- Optimistic concurrency uses `buildings.updated_at` (`expectedUpdatedAt` on PUT).
- Legacy **Admin → Map pins** tab removed; use Map Builder only for outdoor authoring.


- **2.5C** — Indoor floor editor
- **2.5D** — Room editor
- **2.5E** — Draft → validate → preview → publish workflow
