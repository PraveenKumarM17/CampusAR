# Site Map Versioning (Phase 2.5E)

CampusAR map data supports a **draft → validate → preview → publish → live** workflow so organizations can edit maps without affecting live navigation.

---

## Architecture (Step 2 complete)

```
Organization
    └── Site
          ├── Published Map Version  →  Public Map / Navigate / Indoor / AR / Search / Digital Twin
          └── Draft Map Version      →  Map Builder only
```

Every canonical authored spatial row carries `map_version_id` referencing `site_map_versions`.

### Versioned tables

| Layer | Tables |
|-------|--------|
| Outdoor | `buildings`, `nodes`, `edges`, `site_areas` |
| Indoor layout | `floors`, `rooms`, `floor_corridors`, `floor_pois` |
| Indoor navigation | `indoor_maps`, `indoor_nodes`, `indoor_edges`, `indoor_places`, `indoor_anchors`, `indoor_handoffs` |

### Explicitly **not** versioned (live operational data)

`users`, `organizations`, `sites`, memberships, `danger_zones`, `events`, `emergency_contacts`, `emergency_exits`, `crowd_levels`, `sensor_readings`, analytics, WebSocket sessions.

Emergency exits/contacts may reference **published** outdoor `nodes` by UUID; they are not cloned with drafts.

---

## Published vs draft resolution

```
Public request
  → resolveRequestSiteId()
  → resolvePublishedMapVersion(siteId)
  → SQL WHERE map_version_id = publishedVersionId

Map Builder (requireMapEditor + X-Site-Id)
  → resolveEditorDraftMapVersion()  // idempotent; clones on first create
  → SQL reads/writes WHERE map_version_id = draftVersionId
```

Public indoor routing additionally requires `indoor_maps.status = 'published'` within the published site version.

---

## Draft clone algorithm

When `POST /api/admin/map-builder/draft` creates a new draft (or backfills spatial rows for a metadata-only draft from Step 1):

1. `BEGIN` — lock site row (`FOR UPDATE`)
2. Re-check for existing draft; if spatial rows already exist for draft version, return it
3. Insert draft `site_map_versions` row (`based_on_version_id` → published)
4. **Transactional clone** published → draft with **new UUIDs** and an in-memory old→new ID map:

   ```
   buildings → floors → outdoor nodes → rooms → corridors → POIs
   → outdoor edges → site_areas
   → indoor_maps (status=draft) → indoor_nodes → indoor_edges
   → indoor_places (two-pass parent_place_id) → indoor_anchors → origin_anchor update
   → indoor_handoffs
   ```

5. `COMMIT` — on any failure, full rollback (no partial draft graph)

Published row UUIDs (e.g. RNSIT seed buildings) are **never changed**. Draft clones get independent IDs.

Indoor anchor codes are suffixed (`-d{versionPrefix}`) to satisfy version-scoped uniqueness.

---

## Authorization / guards

Existing site guards remain (`requireMapEditor`, `resolveEditorSiteId`, `assertResourceInSite`).

Additional version guards (`mapVersionGuard.ts`):

| Code | Meaning |
|------|---------|
| `VERSION_CONTEXT_REQUIRED` | Row missing `map_version_id` |
| `CROSS_VERSION_REFERENCE` | Resource or edge endpoint not in active version |
| `PUBLISHED_VERSION_READ_ONLY` | Map Builder attempted to mutate published rows |

Outdoor edge creation validates both endpoints share the draft `map_version_id`.

---

## Migration / backfill

File: `map-builder-versioning-spatial.sql`

- Adds nullable `map_version_id` to all versioned tables
- Ensures each site has published version 1 (idempotent)
- Backfills `map_version_id = sites.published_map_version_id` (building-scoped tables via join)
- Adds indexes; replaces `buildings (site_id, code)` unique with `(map_version_id, code)`
- Sets `NOT NULL` after backfill when safe

---

## API

Map Builder snapshot (`GET /api/admin/map-builder/snapshot`):

```json
{
  "siteId": "...",
  "version": { "id": "...", "status": "draft", "versionNumber": 2, ... },
  "buildings": [],
  "nodes": [],
  "edges": [],
  "areas": []
}
```

Draft creation: `POST /api/admin/map-builder/draft` — idempotent, returns 201 on first create / 200 if draft exists.

---

## Code map

| Layer | File |
|-------|------|
| Spatial migration | `infrastructure/db/map-builder-versioning-spatial.sql` |
| Clone service | `application/mapVersionCloneService.ts` |
| Version guards | `application/mapVersionGuard.ts` |
| Version service/repo | `application/mapVersionService.ts`, `infrastructure/repositories/mapVersionRepository.ts` |
| Context helpers | `application/mapVersionContext.ts` |
| Tests | `interfaces/http/mapVersionSpatial.api.test.ts` |

---

## Step 2 acceptance criteria ✓

- Public users only see published version spatial rows
- Map Builder only reads/writes draft version rows
- Draft clone is self-contained with remapped UUIDs
- No cross-version edges or indoor graph references
- RNSIT published building UUIDs preserved
- Empty sites get empty editable drafts
- Transactional clone with rollback on failure

---

## Step 2.1 stabilization ✓

- `schema.sql` includes `map_version_id` on all canonical spatial tables (fresh installs)
- `seed.sql` creates Published V1 before spatial rows and binds RNSIT data to it
- Clone rollback integration test (`CLONE_TEST_FAILURE` hook + transaction verify)
- Docker proxy test uses isolated host ports (`18543` / `18400` / `18080`) via `scripts/test-docker-proxy.mjs`

---

## Step 3A — Unified draft validation ✓

`GET /api/admin/map-builder/versions/:versionId/validate`

- Requires `requireMapEditor` + editor site context (`X-Site-Id`)
- **Draft versions only** — returns `422 VALIDATION_DRAFT_ONLY` for published/archived
- Validates the **requested** `versionId` — never falls back to published
- Aggregates existing validators (no duplicated rules):
  - `validateSiteMap` — outdoor buildings, nodes, edges, areas
  - `validateIndoorLayout` per draft building — floors, rooms, corridors, POIs + indoor graph
  - `validateVersionScopeIntegrity` — cross-version row and edge-endpoint checks

Response: `{ version, valid, summary: { errors, warnings }, issues[] }` where `issues[].level` is `error` | `warning`.

Legacy endpoints remain: `GET /map-builder/validate` (outdoor only), `GET /map-builder/indoor/validate?buildingId=`.

---

## Step 3B — Authorized draft preview ✓

Editor-gated preview namespace: `/api/admin/map-builder/preview/:versionId/*`

- Requires auth + `requireMapEditor` + `X-Site-Id`
- **Draft versions only** — `422 PREVIEW_DRAFT_ONLY` for published/archived
- Never falls back to published when a preview version is requested
- Mirrors public campus/indoor/navigation read shapes for Map, Navigate, Indoor, Digital Twin

Frontend: `previewStore`, `useCampusApi`, `PreviewBanner`, Map Builder **Preview Draft** action.

---

## Step 3C — Atomic draft publish ✓

`POST /api/admin/map-builder/versions/:versionId/publish`

### Authorization

- Auth + `requireMapEditor` + editor site context (`X-Site-Id`)
- **Draft only** — `422 PUBLISH_DRAFT_ONLY` for published/archived
- Cross-site rejected — `422 CROSS_SITE_REFERENCE` / `404`

### Validation gate

Inside the publish transaction (after row lock):

1. Re-run `validateMapVersion(siteId, draft)` on current DB state
2. **Errors block** publish → `409` with `{ published: false, version, validation }`
3. **Warnings do not block** publish

Frontend validation is advisory only; server always re-validates.

### Transaction sequence

```
BEGIN
  SELECT sites … FOR UPDATE
  SELECT site_map_versions (draft) … FOR UPDATE
  validateMapVersion(draft)
  IF errors → ROLLBACK → 409

  Archive prior published version (status=archived, archived_at=NOW())
  Demote prior indoor_maps to status=draft

  Promote draft (status=published, published_at, published_by)
  UPDATE sites.published_map_version_id = draftId
  Promote draft indoor_maps to status=published
COMMIT
  → broadcast map_published (site-scoped, after commit)
```

On any failure: **full ROLLBACK** — pointer, published status, and draft status unchanged.

### Version lifecycle

```
Published V1 → (edit) Draft V2 → (publish) → V1 archived, V2 published
Next Map Builder session → getOrCreateDraftVersion → Draft V3 cloned from V2
```

Publishing is a **metadata/state transition only** — spatial UUIDs are not cloned or replaced.

### Indoor map status

On publish:

- Draft version `indoor_maps` → `status = 'published'`
- Former published version `indoor_maps` → `status = 'draft'`

Public indoor reads still require published site version **and** `indoor_maps.status = 'published'`.

### Preview after publish

- Preview API rejects newly published version (`PREVIEW_DRAFT_ONLY`)
- Frontend exits preview, clears caches, resets navigation state on successful publish

### WebSocket

After successful commit: `map_published` event with `{ siteId, versionId, versionNumber }` (site-scoped). Operational crowd/hazard events unchanged.

---

## Remaining

- [ ] Rollback / version history UI
- [ ] Billing / org-level publish audit dashboard
