# CampusAR Full Technical Audit Export

**Repository:** `/home/praveen/AR-navigationP`  
**Audit type:** Static source inspection + local verification commands  
**Code modified for this audit:** none (application/schema/tests/config untouched)  
**Companion inventory:** `CAMPUSAR_AUDIT_EVIDENCE.md`

This report describes the **implemented** system. Documentation that disagrees with code is called out explicitly. Claims that were not executed on a device or in Docker Compose full-stack mode are marked **NOT VERIFIED**.

---

# 1. Executive Summary

CampusAR is a TypeScript monorepo: Express + PostgreSQL/PostGIS API, React SPA, shared types, and a Unity C# script scaffold. Outdoor campus navigation (Leaflet/OSM, optional Google Maps, composite-cost A\*, GPS tracking, Web AR camera overlay) is the most complete path. Indoor navigation exists as a **separate local-meter graph** with QR text codes, a building-handoff picker, and Unity mapping scripts. Digital Twin is **Cesium**, lazy-loaded on `/twin`, not Three.js despite README/architecture docs.

The codebase typechecks, lints, unit/API-tests (98 tests), and production-builds on this machine. It is **not production-ready**: SOS does not contact campus security; JWT refresh tokens are not stored or revoked; Swagger and the unauthenticated campus graph are public; Docker web nginx does not proxy `/api` or `/ws`; Prettier CI would fail; indoor “scan QR” is a text field; Unity/AR Foundation versions are not in-repo; demo admin password is hardcoded in the landing page.

**Release decision:** READY ONLY FOR INTERNAL TESTING (see end).

---

# 2. Actual Architecture

```
Browser SPA (Vite/React)
  ├─ Leaflet OSM / optional Google Maps  (/map, /navigate)
  ├─ getUserMedia + Three.js doll        (/ar)
  ├─ Indoor QR text + indoor A*          (/indoor)
  ├─ Cesium OSM 3D boxes                 (/twin, admin only)
  └─ Zustand persist (auth, prefs, nav) in localStorage
           │ HTTP /api  (Vite proxy in dev only)
           │ WS /ws     (Vite proxy in dev only)
           ▼
Express API (interfaces → application → domain → infrastructure)
  ├─ JWT access + refresh (stateless; no session table)
  ├─ A* outdoor (WGS84 nodes/edges) + indoor (local xyz)
  ├─ IoT simulator → crowd_levels / sensor_readings + WS broadcast
  └─ Swagger at /api/docs (always on)
           │ pg parameterized queries
           ▼
PostgreSQL 16 + PostGIS
  outdoor graph ≠ indoor graph (explicitly separate tables)
```

Unity scripts call the same REST indoor/outdoor APIs. There is no MQTT, no BLE, no native QR decoder in the web app.

---

# 3. Repository Inventory

See `CAMPUSAR_AUDIT_EVIDENCE.md` §1 for the tree. Notable facts:

- **No** `ProjectVersion.txt` or Unity `Packages/manifest.json` in the repo. Unity is scripts + README only.
- DB truth is `apps/api/src/infrastructure/db/schema.sql`. `migrate.ts` applies a small patch then the full schema file (`CREATE IF NOT EXISTS` — not a versioned migration history).
- Docker init mounts `schema.sql` + `seed.sql`. Indoor tables exist in schema; `seed.sql` TRUNCATE list omits `indoor_*` by name but truncating `buildings` **CASCADE** still wipes them.

---

# 4. Tech Stack

### Frontend (from `apps/web/package.json` + imports)

| Piece | Actual library | Where used |
|-------|----------------|------------|
| Framework | React 18 | entire SPA |
| Build | Vite 6 + `@vitejs/plugin-react` | `vite.config.ts` |
| Router | `react-router-dom` 7 | `App.tsx` |
| State | Zustand 5 persist | `authStore`, `themeStore` |
| CSS | Tailwind 3 | `index.css`, `tailwind.config.js` |
| Maps | Leaflet 1.9 + react-leaflet; optional Google JS API | `MapPage`, `NavigatePage`, `AdminMapEditor`, `GoogleCampusMap` |
| Twin | **Cesium** 1.144 + `vite-plugin-cesium` | `CesiumDigitalTwin.tsx` only |
| AR (web) | `getUserMedia` + `@react-three/fiber` / `drei` / `three` doll | `ArPage`, `GuideDoll` |
| QR | **lucide-react icon only** — no html5-qrcode / BarcodeDetector | `IndoorPage` text input |
| Charts | recharts | `AnalyticsPage` |
| Tests | vitest | `*.test.ts` |

Three.js is **not** the digital twin. It is the AR guide doll.

### Backend

| Piece | Actual |
|-------|--------|
| Runtime | Node ≥20 |
| Framework | Express 4 |
| Validation | Zod |
| Auth | jsonwebtoken + bcryptjs |
| DB | `pg` parameterized SQL (no ORM) |
| WS | `ws` WebSocketServer path `/ws` |
| Logging | morgan (`dev` / `tiny` in test) |
| HTTP hardening | helmet with **CSP disabled**; cors |
| Tests | vitest + supertest |

**Absent:** rate limiting, CSRF tokens, OpenTelemetry, Sentry, Redis, queue.

### Database

PostgreSQL 16 + PostGIS (`postgis/postgis:16-3.4`). Schema SQL + `migrate.ts`. Seed: `seed.sql` then `seed.ts` re-hashes demo passwords.

### Unity

README claims Unity **2022.3 LTS**, AR Foundation, ARCore/ARKit. **NOT VERIFIED** from project files (none present). Scripts reference `UnityEngine.XR.ARFoundation`. REST via `UnityWebRequest`. Default API `http://localhost:4000/api`.

### Infrastructure

Docker Compose: db `:5433→5432`, api `:4000`, web nginx `:5173→80`. CI: GitHub Actions on `main`/`mvp`/`develop`. No reverse-proxy TLS in-repo. Web nginx serves SPA only; **no `/api` or `/ws` location**.

---

# 5. Complete Frontend Route Audit

| ROUTE | COMPONENT | AUTH | ROLE | MAIN FETCHES | STATE | MAIN API | OUTGOING NAV | ERROR | LOADING |
|-------|-----------|------|------|--------------|-------|----------|--------------|-------|---------|
| `/` | `LandingPage` | no | — | none | local form; writes `useAuthStore` | `api.guest`, `api.login` | `/map` guest; `/admin` admin | `error` string | `loading` |
| `/map` | `MapPage` | any session | any | buildings, rooms, nodes, edges, zones, categories | nav store; GPS; live WS | campus + `route` + indoor context | `/navigate`, `/ar` | `gpsNote`; empty catch on route | none dedicated |
| `/navigate` | `NavigatePage` | any | any | places, nodes, buildings | nav store + local route/arrived | `route`, `recalculate`, `resolveNavigate`, indoor context/handoff | `/ar`, `/indoor?building&destination` | `error` text | `loading` / `recalcBusy` |
| `/ar` | `ArPage` | any | any | places | nav store; local phase machine | `route`/`recalculate` | `/navigate` indoor CTA | GPS/camera messages | GPS init timeout 12s |
| `/indoor` | `IndoorPage` | any | any | context + place from URL | nav store indoor fields | anchor, indoorRoute, indoorPlace, search | `/navigate` cancel; `/map` finish | restoreError + error | `busy` |
| `/safety` | `SafetyPage` | any | any | zones, exits, contacts | local | `sos` | none | sosMsg | `sending` |
| `/twin` | `TwinPage` | admin UI | admin | buildings, nodes, edges, zones, crowd | live hook + GPS | campus + iotCrowd | none | silent catch on crowd | Suspense |
| `/admin` | `AdminPage` + `AdminMapEditor` | admin UI | admin | weights, buildings, edges, zones, crowd, events, iot | local tab | all `api.admin*` + iot start/stop | none | `message` | none |
| `/analytics` | `AnalyticsPage` | admin UI | admin | summary | local | `analyticsSummary` | none | `error` paragraph | “Loading analytics…” |
| `*` | Navigate `/` | — | — | — | — | — | `/` | — | — |

**Undocumented in README quick start but implemented:** `/indoor`. Twin is admin-only in code; README does not say admin-only.

**Frontend vs backend auth:** guests hitting `/admin` are redirected by React. Direct `GET /api/admin/weights` without admin JWT returns 401/403. Campus/navigation/indoor-read/SOS remain usable with guest or **no** token (`optionalAuth`).

Protection mechanism: `App.tsx` `Protected` checks `useAuthStore.user`; admin nested check `user.role !== 'admin'`.

---

# 6. Complete API Audit

Errors go through `errorHandler`: Zod 400 `VALIDATION_ERROR`, `AppError` with its status/code, else 500.

### AUTH (`/api/auth`)

**POST `/register`** — Body `{ email, password min 6, name }`. `authService.register` inserts `users` role `user`. 201 `{ user, tokens }`. 409 `EMAIL_TAKEN`. **Frontend UI caller: none** (`api.register` exists unused).

**POST `/login`** — `{ email, password }`. bcrypt. 200. 401 `INVALID_CREDENTIALS`. Callers: `LandingPage`, Unity `IndoorApiClient.LoginAdmin`, tests.

**POST `/guest`** — Optional `{ name }`. Creates guest user `email=null`. 201. Caller: `LandingPage`.

**POST `/refresh`** — `{ refreshToken }`. Verifies refresh JWT; loads user; issues **new** access+refresh. Old refresh remains valid until TTL (not stored). 401. Caller: `api.ts` `refreshAccessToken`.

### CAMPUS (`/api/campus`) — no pagination

**GET `/buildings` `/floors` `/rooms` `/nodes` `/places` `/edges` `/categories`** — no auth. Repository list queries.

**GET `/search?q=`** — optionalAuth (analytics `user_id`); Zod `q` min 1; `analytics_searches` insert.

**GET `/places`** — named active nodes `DISTINCT ON lower(trim(name))`. Callers: Navigate, AR, tests.

**GET `/floors`** — **no web `api.floors` method**. Indoor context embeds floors.

### NAVIGATION (`/api/navigation`)

**POST `/route` and `/recalculate`** — same handler. Body: UUID source/dest, optional strict `accessibility`, `usePrediction`. `validateRouteEndpoints` (named+active, not same) → graph+weights+zones+events → A\* → `analytics_navigations` insert. 200 `RouteResponse`. 400 `SAME_NODE`. 422 `INVALID_NODE`. 404 `NO_ROUTE`. Callers: Map, Navigate, AR.

**GET `/resolve?from&to`** — UUID optional. `resolveShareEndpoints`. Caller: NavigatePage. **Missing from `docs/API.md`.**

### INDOOR (`/api/indoor`)

Writes: admin JWT. Reads: optionalAuth; unpublished maps 404 for non-admin.

| Method | Path | Notes |
|--------|------|-------|
| GET | `/maps` | non-admin: published only |
| POST/PUT | `/maps`, `/maps/:id` | admin |
| GET | `/maps/:id` | bundle |
| POST/PUT/DELETE | `/nodes`, `/nodes/:id` | admin; soft delete |
| POST/PUT/DELETE | `/edges`, `/edges/:id` | admin |
| POST/PUT | `/places`, `/places/:id` | admin |
| GET | `/places/search` | `q` + optional `buildingId` |
| GET | `/places?buildingId=` | browse published |
| GET | `/places/:id` | 404 deleted/unpublished; 422 building mismatch |
| POST | `/anchors` | admin |
| GET | `/anchors/:code` | 422 `ANCHOR_BUILDING_MISMATCH` if `buildingId` query |
| POST | `/handoffs` | admin |
| GET | `/handoffs?outdoorNodeId=` | |
| GET | `/buildings/:buildingId/context` | published map or null |
| POST | `/route` | optional `expectedBuildingId`; 422 mismatch / NO_ROUTE |

### SAFETY / NOTIFICATIONS

**GET `/api/safety/zones|exits|contacts`** — no auth. Contacts include **phone**.

**POST `/api/safety/sos`** — optionalAuth. Insert `sos_events` + `notifications`. Response `'Campus security has been notified'`. **No SMS/email/webhook.** Caller: `SafetyPage`.

**GET `/api/notifications`** — optionalAuth; last 50 rows, **global** feed (not user-targeted). **POST `/:id/read`** — requireAuth. Frontend `api.markRead` exists but **is never called**; unread badge in `AppShell` never clears.

### ADMIN (`/api/admin`) — `requireAuth` + `requireRole('admin')` on entire router

weights GET/PUT; buildings CRUD; paths/nodes CRUD (soft delete nodes); paths/edges CRUD (hard delete); danger-zones CRUD (Zod types omit `fire`); crowd GET/POST/DELETE; events CRUD.

### IOT (`/api/iot`)

GET status/sensors/crowd optionalAuth. POST start/stop/tick **admin**. **tick has no frontend caller.**

### ANALYTICS (`/api/analytics`)

GET summary/searches/popular-routes **admin**. Frontend uses **summary only**.

### OTHER

GET `/health` none — process liveness only, **no DB probe**. GET `/api/docs` and `/api/docs.json` none. WS `/ws` **none**.

Swagger (`openapi.ts`) documents **12 path groups** (`/auth/*`, `/campus/buildings`, `/campus/search`, `/navigation/route`, `/indoor/route`, `/safety/zones`, `/safety/sos`, `/notifications`, `/admin/weights`, `/analytics/summary`). Most of the ~70 HTTP routes are undocumented in OpenAPI.

---

# 7. Frontend-to-Backend Connection Matrix

**Guest login:** `LandingPage` → `api.guest` → `POST /auth/guest` → `INSERT users` → JWT → `campusar-auth` localStorage.

**Outdoor route:** `NavigatePage.compute` → `POST /navigation/route` → `nodes`/`edges`/`route_weights`/`danger_zones`/`events` → A\* → `analytics_navigations` → Leaflet polyline.

**Building handoff:** building pick → `GET /indoor/buildings/:id/context` → `applyBuildingContext` → outdoor dest=entrance → arrival hold → picker `GET /indoor/places` + search → `/indoor?building&destination` → typed QR → `GET /indoor/anchors/:code?buildingId=` → `POST /indoor/route`.

**SOS:** `SafetyPage` → `POST /safety/sos` → `sos_events` + `notifications` → canned success string.

**Twin:** REST snapshot + WS crowd/hazard → Cesium `fromDegrees(lon,lat)` (matches WGS84).

**Admin editor:** `AdminMapEditor` → `/api/admin/paths/*`.

### Dead / mismatched surface

| Issue | Evidence |
|-------|----------|
| `api.register` unused | no UI caller |
| `api.markRead` unused | `AppShell` lists notes but never POSTs `/notifications/:id/read` |
| `api.iotSensors` unused | WS `sensors` also unread by any page |
| `api.adminBuildings.update`, `adminZones.update`, `adminEvents.update`, `adminCrowd.remove` unused | Admin UI create/delete only |
| No `api.floors` | backend `GET /campus/floors` exists |
| No client for `POST /iot/tick`, `GET /analytics/searches`, `GET /analytics/popular-routes` | |
| Indoor admin CRUD unused by web | Unity `IndoorApiClient` only |
| Share URL drops `building` | `buildNavigateShareUrl` sets only `from`/`to`; Navigate URL bar also syncs `building` |
| `docs/API.md` incomplete | omits places, resolve, most indoor |
| JWT has no `organizationId` | `jwt.ts` |
| Admin zone types omit `fire` | `adminRoutes.ts` vs schema |
| Docker `VITE_API_URL=http://localhost:4000/api` vs nginx no proxy | Dockerfile + nginx.conf |
| env.ts access TTL fallback `8h` vs `.env.example` `15m` | |

`api.ts` paths match Express for methods that exist. Indoor `indoorResolveAnchor(code, token, expectedBuildingId)` order is easy to misuse; `IndoorPage` currently passes token then buildingId correctly.

IDs: outdoor `nodes.id` ≠ `indoor_nodes.id`. `CampusPlace.id` is a **node** id. Indoor destination is `indoor_places.id`.

---

# 8. Database and Data Integrity Audit

| Table | PK | FKs | Soft delete | Timestamps |
|-------|----|-----|-------------|------------|
| users | id | — | no | created_at |
| buildings | id | — | no | no |
| floors | id | building CASCADE | no | no |
| nodes | id | floor SET NULL, building SET NULL | `active` | no |
| rooms | id | floor/building CASCADE, node SET NULL | no | no |
| edges | id | from/to CASCADE | **hard DELETE** | no |
| danger_zones | id | — | `active` | no |
| crowd_levels | id | edge/node CASCADE | no | updated_at |
| sensor_readings | id | building SET NULL | no | recorded_at |
| events | id | — | `active` | starts/ends |
| route_weights | id=1 | — | no | updated_at |
| notifications | id | — | no | created_at |
| notification_reads | (notif, user) | CASCADE | — | read_at |
| emergency_contacts | id | node SET NULL | no | no |
| emergency_exits | id | building/node CASCADE | no | no |
| analytics_* | id | user/nodes SET NULL | no | created_at |
| sos_events | id | user SET NULL | no | created_at |
| indoor_maps | id | building CASCADE, created_by SET NULL | `active` | created/updated |
| indoor_nodes | id | map/building/floor CASCADE | `active` | no |
| indoor_edges | id | map/building/floors/nodes CASCADE | `active` | no |
| indoor_places | id | map/building CASCADE; floor/node/parent SET NULL | `active` | no |
| indoor_anchors | id | map/building/floor/node CASCADE; code UNIQUE | `active` | no |
| indoor_handoffs | id | outdoor node, indoor node, building, map CASCADE; UNIQUE outdoor_node | `active` | no |

**Missing FK:** `indoor_maps.origin_anchor_id` and `indoor_nodes.anchor_id` unconstrained.

**No** refresh-token table. **No** organization/tenant table.

**Indexes:** gist `nodes.geom`, `danger_zones.geom`; named-node partial; indoor indexes; analytics query/created. No `sos_events.created_at` index.

**Cascade:** deleting a building wipes indoor graphs. Admin UI exposes building delete.

**Duplicate models:** `rooms` vs `indoor_places`; outdoor `nodes.kind='indoor'` vs `indoor_nodes`.

**listNamedPlaces DISTINCT ON name** can hide duplicate names.

**seed.sql TRUNCATE** omits indoor tables by name; CASCADE from buildings still deletes them.

```
users
buildings ─┬─ floors ─ rooms ─ nodes ── edges
           └─ indoor_maps ─┬─ indoor_nodes ─ indoor_edges
                           ├─ indoor_places (self parent)
                           ├─ indoor_anchors
                           └─ indoor_handoffs ─ outdoor nodes
```

---

# 9. Authentication and Authorization Audit

**Guest:** Landing → `POST /auth/guest` → new UUID every click → localStorage → Bearer header → logout clears Zustand only.

**Admin:** Landing prefills `admin@smartcampus.edu` / `admin123`. Non-admin login rejected in **UI only**. A `user` JWT still works for campus APIs.

**Tokens:** HS256; secrets from env with in-code fallbacks. Payload `sub, role, name, email`. Refresh not in DB; logout does not revoke. Concurrent 401 coalesced via `refreshInFlight`. `/auth/*` skipped for auto-refresh (no refresh loop). XSS: localStorage + CSP disabled.

**Privilege:** Admin router role-checked. Indoor writes admin-only; published indoor reads public. Full nodes/edges dump public. Notification mark-read: any authed user can mark any id (global notifications). SOS unauthenticated allowed. Seed UUIDs predictable. Register open, no email verify, no lockout.

Docs claim org-bound guests, rotatable refresh revoke, `organizationId` in JWT — **not implemented**.

---

# 10. Outdoor Navigation Audit

1. Search: campus search (map) or named places + buildings (navigate).
2. GPS: `useGeolocation` filters (`GPS_MAX_ACCURACY_M`, campus proximity, jump logic).
3. Source snap: **named** places only (`snapGpsForRouting`).
4. Dest: named place or building entrance.
5. `POST /navigation/route`; `routeReqId` drops stale responses on Navigate/AR.
6. Progress: polyline projection; `STEP_ADVANCE_BUFFER_M=22`.
7. Arrival: radius 28 m, hold 3 s.
8. Recalc: Navigate every 30 s; AR off-route 45 m, cooldown 15 s, hold 2.5 s.
9. Every successful route/recalculate inserts `analytics_navigations`.

Risks: MapPage `computeRoute` has **no request id** (race). Swap via `setDestination` clears building context unless dest equals entrance. Empty graph: 404 `NO_ROUTE`. Inactive node: 422. `formatDistance` clamps ≤0. Arrival local flag vs store `arrivalPromptShown` can diverge. Same source/dest: 400. `pointToSegment` treats lat/lon as Cartesian (campus-scale OK).

---

# 11. Building-to-Indoor Handoff Audit

```
none
 → navigating_outdoor          (published map + entrance)
 → arrived_at_building         (outdoor hold; arrivalPromptShown=true)
 → selecting_indoor_destination
 → waiting_for_anchor
 → navigating_indoor
 → none                        (complete / new outdoor dest)
```

| Scenario | Actual |
|----------|--------|
| No indoor map / draft | treated as outdoor-only; no picker |
| Published | handoff; 5 min module cache |
| Multiple entrances | SQL LIMIT 1 (entrance kind first) or handoff row |
| No entrance | dest not overwritten; no building arrival |
| Picker once | `!arrivalPromptShown`; persist keeps it |
| I'll choose later | dismissed; will not reopen |
| Refresh navigate | `?building=` restores via context API |
| Refresh indoor | GET place/context; 404 if deleted |
| Cancel QR | back to confirm on `/navigate` |
| Unpublish after preload | cache may lie for ≤5 min |
| Other-building QR/place | 422 with building name |

**QR is typed, not camera-scanned.**

---

# 12. Indoor Navigation Audit

Local `local_x/y/z` meters, not WGS84. Graph per published `indoor_maps`. Places hierarchical; route uses `place.nodeId`. Anchors unique codes.

`routeIndoorGraph` reuses outdoor A\* with Euclidean heuristic. `maxDistanceM: 80` is **heuristic normalization**, not a hard 80 m cap.

Anchor/place building mismatch: 422. Disconnected: 422 `NO_ROUTE`. Inactive source: 404. Unpublished: 404. Stairs/elevator via prefs → `indoorPrefsToAccessibility`. Same-node indoor start=goal: no explicit SAME_NODE (A\* degenerate) — **NOT VERIFIED** as a dedicated 400. Web indoor UI is an instruction list, not GPS.

---

# 13. AR / Unity Audit

**Web AR phases:** initializing, waiting_gps, gps_unavailable, navigating, off_route, recalculating, arrived. Camera `facingMode: environment`. `routeReqId` present. Compass permission helper. No WebXR. Platform camera/compass **NOT VERIFIED**.

**Unity:** mapper uses ARSession/ARPlaneManager/ARReticle; REST indoor CRUD; guidance controller. Versions **NOT VERIFIED**. Login JSON string-interpolated (quote break). Local meters match backend assumption (not GPS).

---

# 14. State Management Audit

| Store | Persist key | Contents | Reset |
|-------|-------------|----------|-------|
| auth | `campusar-auth` | user, access, refresh | logout |
| theme | `campusar-theme` | dark (forced light) | hydrate |
| prefs | `campusar-prefs` | accessibility, voice, avatar | none auto |
| nav | `campusar-nav` | outdoor ids + building indoor machine | setDestination (non-entrance) / completeIndoor |

Two arrival truths: React `arrived` vs store `arrivalPromptShown`. Indoor persist survives logout (different key). No React Query.

---

# 15. WebSocket / Polling / Live Data Audit

`useCampusLive`: WS to `/ws`, retry 3 s, no auth. Server broadcasts to all clients. IoT 10 s ticks; default **on**. N+1 upserts per edge. In-process singleton (not multi-replica safe). Navigate 30 s HTTP recalc independent of WS. Crowd WS ids are array indexes, not DB ids.

Hook state `sensors` is populated from WS `sensors` messages but **no component reads `live.sensors`**. Consumers are Map/AR/Twin for `crowd` / `zones` / `status` / `lastEmergency` only. Multiple pages each call `useCampusLive()` — each opens its own WebSocket (no shared connection).

---

# 16. Admin Audit

Tabs: map, weights, buildings, paths, zones, crowd, events, iot. **No indoor admin tab.** Outdoor self-loop edges not forbidden by Zod. Duplicate edges allowed. Cross-building outdoor edges not validated. Indoor SAME_NODE rejected. Indoor any two nodes may be connected across floors without stairs. No multi-step transactions in the map editor.

---

# 17. Safety / SOS Audit

Public GETs. SOS optionalAuth, no rate limit, no lat/lng range. GPS fail → campus center (false location). Hardcoded message. Persists rows only. UI/API claim security notified. Phones in contacts are public. Contradicts `security-architecture.md` “no fake dispatch guarantees”.

---

# 18. Analytics Audit

Search rows from `/campus/search` only. Navigation row per route **and** recalc. `travel_time_minutes` = eta (`VALUES $6,$6`). Unique searchers: all null user_ids collapse to `'anon'`. Search strings stored raw. Indoor search not recorded.

---

# 19. Cesium Digital Twin Audit

Lazy chunk ~4.2 MB. OSM imagery. Buildings are **28×22 m boxes**, not footprints. Coordinates WGS84. Admin UI only; data APIs public. README/docs still say Three.js. Nginx/Cesium workers in Docker **NOT VERIFIED**.

---

# 20. Error Handling Audit

No React error boundary (`main.tsx` is StrictMode + BrowserRouter only). Many empty/silent catches (Map route, Twin crowd, optional JWT, WS parse, GPS warmup `() => {}`). Navigate/Indoor/Landing/Analytics show errors.

**Unhandled `Promise.all` (no `.catch`):** `MapPage.tsx` campus bootstrap; `TwinPage.tsx` snapshot (only `iotCrowd` has `.catch(() => [])`); `SafetyPage.tsx` zones/exits/contacts. A rejected promise becomes an unhandled rejection; map/twin/safety stay empty with no user message.

500 leaks `String(err)` when not production. Loading states inconsistent. Retry: Track me + WS reconnect; SOS is re-click only.

---

# 21. Security Audit

Static only. JWT fallbacks and compose defaults committed as examples. `.env` not committed. SQL parameterized. No `dangerouslySetInnerHTML`. CORS allows `*` if configured; credentials true. CSRF low (Bearer). No rate limit. Swagger always on. Helmet CSP off. Seed/demo passwords. Full graph public.

---

# 22. Performance Audit

Main JS ~1.8 MB gzip ~504 KB; Cesium extra ~4.2 MB. Full edge/node lists on map. Graph reload every route. IoT N+1. Search ILIKE no trigram. Indoor context loads all buildings then finds one. No pagination.

---

# 23. Production Readiness Audit

API Docker CMD does **not** migrate. Web nginx no API proxy. No API healthcheck in compose. `GET /health` does not query Postgres. No HTTPS. IoT on by default. CI format-check would fail. CI **does not** run `npm run build` (only `docker compose build`). Destructive seed TRUNCATE.

Required names: `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGIN`, `JWT_ACCESS_EXPIRES`, `JWT_REFRESH_EXPIRES`, `API_PORT`, `NODE_ENV`, `IOT_SIMULATOR` (set `false` in prod), `VITE_API_URL` (must be browser-reachable).

---

# 24. Documentation vs Implementation Mismatches

| DOCUMENTED CLAIM | ACTUAL IMPLEMENTATION | STATUS |
|------------------|----------------------|--------|
| README: Digital Twin is Three.js | Cesium on `/twin` | IMPLEMENTED DIFFERENTLY |
| digital-twin-design.md Three.js | Cesium Viewer | IMPLEMENTED DIFFERENTLY |
| Scan QR on `/indoor` | Text field | PARTIALLY IMPLEMENTED |
| JWT includes organizationId | no org in payload | NOT IMPLEMENTED |
| Refresh revoke on logout | client clear only | NOT IMPLEMENTED |
| Honest SOS / no fake dispatch | “security has been notified” | IMPLEMENTED DIFFERENTLY |
| Guest org-bound session | anonymous guest row | PARTIALLY IMPLEMENTED |
| ACCESS_TTL / REFRESH_TTL | JWT_*_EXPIRES | IMPLEMENTED DIFFERENTLY |
| docs/API.md complete | missing indoor/places/resolve | PARTIALLY IMPLEMENTED |
| docs/DATABASE.md tables | omits `indoor_*` | PARTIALLY IMPLEMENTED |
| Swagger = API | subset | PARTIALLY IMPLEMENTED |
| Web indoor mapping admin | Unity only | IMPLEMENTED DIFFERENTLY |
| README “production-quality” | gaps in this report | NOT IMPLEMENTED |
| Unity 2022.3 + AR versions | README only | NOT VERIFIED |
| Multi-tenant org docs | no org tables | NOT IMPLEMENTED |
| `/health/live` and `/health/ready` | only `GET /health` JSON `{ status, service }` | NOT IMPLEMENTED |
| CI runs lint, typecheck, test, **build** | CI: format, lint, typecheck, schema+seed, test, `docker compose build` — **no** `npm run build` | PARTIALLY IMPLEMENTED |
| Dependabot / `npm audit` in CI | neither present | NOT IMPLEMENTED |
| Security doc: guests primary; email login **admins only** | `POST /auth/register` creates role `user`; seed student login | IMPLEMENTED DIFFERENTLY |
| README footer “swathi changed readme” | stray line in `README.md` | IMPLEMENTED DIFFERENTLY |

---

# 25. Tests and Verification Results

Executed 2026-08-20 in this repo:

| COMMAND | RESULT | PASS/FAIL | FAILURE SUMMARY | ENV vs CODE |
|---------|--------|-----------|-----------------|-------------|
| `npm run typecheck` | exit 0 | PASS | — | — |
| `npm run lint` | exit 0 | PASS | — | — |
| `npm run format:check` | exit 1 | FAIL | 105 files Prettier | **code/style** (CI uses this) |
| `npm test` | exit 0 | PASS | API 45, web 53 | DB was up |
| `npm run build` | exit 0 | PASS | Vite 12.11s | — |
| `docker compose up --build` | not run | — | — | NOT VERIFIED |
| Device GPS/QR/AR/Unity | not run | — | — | NOT VERIFIED |

No coverage reporter. No E2E.

---

# 26. Complete Findings List

ID: F-001  
TITLE: SOS claims campus security was notified but only writes DB rows  
SEVERITY: CRITICAL  
AREA: Safety  
STATUS: CONFIRMED  

EVIDENCE:
- `apps/api/src/interfaces/http/routes/safetyRoutes.ts` `recordSos` + notification insert
- Response `message: 'Campus security has been notified'`
- No SMS/email/webhook in repository

PROBLEM: Users believe an emergency dispatch happened.  
IMPACT: Delayed real-world help; legal/safety liability.  
REPRODUCTION SCENARIO: Guest opens `/safety`, taps SOS, sees success. Nobody is paged.  
RECOMMENDATION: Honest copy (“logged for staff”) or a real alerting channel.

---

ID: F-002  
TITLE: Docker web build cannot call API from a real browser  
SEVERITY: HIGH  
AREA: Production  
STATUS: CONFIRMED  

EVIDENCE:
- `apps/web/Dockerfile` `ARG VITE_API_URL=http://localhost:4000/api`
- `apps/web/nginx.conf` SPA only, no `/api` or `/ws` proxy

PROBLEM: Baked localhost API URL; nginx does not proxy.  
IMPACT: Compose web UI fails API/WS except on the same machine with API on :4000.  
REPRODUCTION SCENARIO: Open `http://<lan-ip>:5173` after `docker compose up --build`.  
RECOMMENDATION: Nginx proxy `/api` and `/ws`; bake `VITE_API_URL=/api`.

---

ID: F-003  
TITLE: Refresh tokens are not stored or revoked  
SEVERITY: HIGH  
AREA: Auth  
STATUS: CONFIRMED  

EVIDENCE:
- `apps/api/src/application/authService.ts` `refresh`
- No refresh table; logout is `authStore.logout`

PROBLEM: Stolen refresh works for 7d; logout is client-only.  
IMPACT: Account takeover after XSS or token theft.  
REPRODUCTION SCENARIO: Copy refresh from localStorage, logout, `POST /api/auth/refresh`.  
RECOMMENDATION: Store hashed jti, rotate, revoke on logout.

---

ID: F-004  
TITLE: JWTs in localStorage without CSP  
SEVERITY: HIGH  
AREA: Security  
STATUS: CONFIRMED  

EVIDENCE:
- `apps/web/src/stores/authStore.ts` persist `campusar-auth`
- `apps/api/src/interfaces/http/app.ts` `contentSecurityPolicy: false`

PROBLEM: XSS steals tokens.  
IMPACT: Guest or admin session theft.  
RECOMMENDATION: httpOnly cookies + CSP, or CSP and short access TTL.

---

ID: F-005  
TITLE: No rate limiting on login, guest, or SOS  
SEVERITY: HIGH  
AREA: Security  
STATUS: CONFIRMED  

EVIDENCE: no express-rate-limit; `authRoutes.ts`, `safetyRoutes.ts`  
PROBLEM: Brute force and SOS flood.  
IMPACT: Account guessing; DB fill; fake emergency spam.  
REPRODUCTION SCENARIO: Script POST `/api/auth/login` and `/api/safety/sos`.  
RECOMMENDATION: Rate limit by IP+email; extra friction on SOS.

---

ID: F-006  
TITLE: Unauthenticated Swagger and full campus graph  
SEVERITY: HIGH  
AREA: Security  
STATUS: CONFIRMED  

EVIDENCE:
- `app.ts` `/api/docs` always
- `GET /api/campus/nodes` and `/edges` no auth

PROBLEM: Attack surface and campus layout dump.  
IMPACT: Easier abuse of routing/SOS; information disclosure.  
RECOMMENDATION: Disable Swagger in production; consider auth for graph exports.

---

ID: F-007  
TITLE: Demo admin password hardcoded in UI and docs  
SEVERITY: HIGH  
AREA: Security  
STATUS: CONFIRMED  

EVIDENCE: `LandingPage.tsx` default `admin123`; README; `seed.ts`  
PROBLEM: Default credentials if seed is used outside a laptop demo.  
IMPACT: Trivial admin takeover.  
RECOMMENDATION: Never prefill production UI; force password change.

---

ID: F-008  
TITLE: CI format check fails on current tree  
SEVERITY: HIGH  
AREA: CI  
STATUS: CONFIRMED  

EVIDENCE: `npm run format:check` exit 1, 105 files; `.github/workflows/ci.yml` runs it first  
PROBLEM: `quality` job fails before tests.  
IMPACT: PRs cannot merge green.  
REPRODUCTION SCENARIO: Push to `main`/`mvp`/`develop`.  
RECOMMENDATION: Run prettier or drop the check until formatted.

---

ID: F-009  
TITLE: Indoor “QR scan” is a text box  
SEVERITY: HIGH  
AREA: Indoor  
STATUS: CONFIRMED  

EVIDENCE: `IndoorPage.tsx` input; no BarcodeDetector/html5-qrcode  
PROBLEM: Users cannot scan markers in the web app.  
IMPACT: Handoff stops at typing; docs oversell.  
RECOMMENDATION: Camera barcode scan or honest copy.

---

ID: F-010  
TITLE: IoT simulator enabled by default including production Docker  
SEVERITY: MEDIUM  
AREA: IoT  
STATUS: CONFIRMED  

EVIDENCE: `env.ts` default true; compose API omits `IOT_SIMULATOR`; `server.ts` `maybeStartIotSimulator`  
PROBLEM: Fake crowd written every 10s; N+1 upserts.  
IMPACT: DB load; false twin/map heat.  
RECOMMENDATION: Default false when `NODE_ENV=production`.

---

ID: F-011  
TITLE: Analytics navigation counts and travel time are misleading  
SEVERITY: MEDIUM  
AREA: Analytics  
STATUS: CONFIRMED  

EVIDENCE: `analyticsRepository.recordNavigation` uses eta for `travel_time_minutes`; called on every recalc  
PROBLEM: Metrics ≠ unique completed trips.  
IMPACT: Dashboard overstates usage and “travel time”.  
RECOMMENDATION: Record completed arrivals separately; do not copy ETA into travel_time.

---

ID: F-012  
TITLE: SOS falls back to campus centroid  
SEVERITY: MEDIUM  
AREA: Safety  
STATUS: CONFIRMED  

EVIDENCE: `SafetyPage.tsx` `pos ?? CAMPUS_CENTER`  
PROBLEM: Failed GPS still “succeeds” at fixed coordinates.  
IMPACT: Wrong emergency location.  
RECOMMENDATION: Fail SOS if no GPS.

---

ID: F-013  
TITLE: Guest users unbounded  
SEVERITY: MEDIUM  
AREA: Auth  
STATUS: CONFIRMED  

EVIDENCE: `authService.guest` insert every click  
PROBLEM: No cleanup.  
IMPACT: `users` table growth.  
RECOMMENDATION: Reuse device guest or TTL purge.

---

ID: F-014  
TITLE: Building context cache can serve unpublished maps for 5 minutes  
SEVERITY: MEDIUM  
AREA: Indoor handoff  
STATUS: CONFIRMED  

EVIDENCE: `apps/web/src/lib/buildingNavigation.ts` `BUILDING_CONTEXT_CACHE_MS`  
PROBLEM: Admin unpublish not seen immediately.  
IMPACT: Picker/route against unpublished graph until TTL.  
RECOMMENDATION: Invalidate on 404; shorter TTL.

---

ID: F-015  
TITLE: Persisted nav store can restore a finished indoor trip  
SEVERITY: MEDIUM  
AREA: State  
STATUS: CONFIRMED  

EVIDENCE: `useNavStore` persist includes `transitionStatus` and dest ids  
PROBLEM: Next-day restore may reopen waiting_for_anchor.  
IMPACT: Confusing UI after logout/login.  
RECOMMENDATION: Clear indoor fields on logout; session TTL.

---

ID: F-016  
TITLE: Admin danger zone API cannot create `fire`  
SEVERITY: MEDIUM  
AREA: Admin  
STATUS: CONFIRMED  

EVIDENCE: `adminRoutes.ts` zod enum vs `schema.sql` includes `fire`  
PROBLEM: Schema/WS vs admin API diverge.  
IMPACT: Cannot manage fire zones from admin form.  
RECOMMENDATION: Align enums.

---

ID: F-017  
TITLE: JWT access TTL mismatch (8h code fallback vs 15m example)  
SEVERITY: MEDIUM  
AREA: Auth  
STATUS: CONFIRMED  

EVIDENCE: `env.ts` vs `.env.example`  
PROBLEM: Misconfigured deploys get 8h access tokens.  
IMPACT: Longer stolen-token window.  
RECOMMENDATION: Fail if secret/TTL missing in production.

---

ID: F-018  
TITLE: Public emergency contact phone numbers  
SEVERITY: MEDIUM  
AREA: Safety  
STATUS: CONFIRMED  

EVIDENCE: `GET /api/safety/contacts` no auth  
PROBLEM: Harvestable PII.  
IMPACT: Spam of campus numbers.  
RECOMMENDATION: Auth or publish a single campus emergency number.

---

ID: F-019  
TITLE: Outdoor edges hard-deleted; nodes soft-deleted  
SEVERITY: MEDIUM  
AREA: Data  
STATUS: CONFIRMED  

EVIDENCE: `campusRepository.deleteEdge` DELETE; `deleteNode` UPDATE active  
PROBLEM: Inconsistent lifecycle.  
IMPACT: Graph/crowd orphans.  
RECOMMENDATION: Soft-delete edges; validate FKs in admin.

---

ID: F-020  
TITLE: No React error boundary  
SEVERITY: MEDIUM  
AREA: Frontend  
STATUS: CONFIRMED  

EVIDENCE: `apps/web/src/main.tsx`  
PROBLEM: Render throw whitescreens the SPA.  
IMPACT: Total tab outage.  
RECOMMENDATION: Route-level error boundaries.

---

ID: F-021  
TITLE: MapPage route requests can race  
SEVERITY: LOW  
AREA: Outdoor nav  
STATUS: CONFIRMED  

EVIDENCE: `MapPage.tsx` `computeRoute` vs Navigate `routeReqId`  
PROBLEM: Older route can overwrite newer.  
IMPACT: Wrong polyline briefly.  
RECOMMENDATION: Copy Navigate’s req id pattern.

---

ID: F-022  
TITLE: Named-place DISTINCT ON can hide duplicate names  
SEVERITY: LOW  
AREA: Campus data  
STATUS: CONFIRMED  

EVIDENCE: `listNamedPlaces` SQL  
PROBLEM: Two “Cafeteria” nodes → one result.  
IMPACT: Wrong outdoor destination.  
RECOMMENDATION: Distinct by id; disambiguate in UI.

---

ID: F-023  
TITLE: Cross-building outdoor edges not validated  
SEVERITY: LOW  
AREA: Admin  
STATUS: CONFIRMED  

EVIDENCE: `adminRoutes.ts` createEdge  
PROBLEM: Editor can connect unrelated nodes.  
IMPACT: Impossible walking routes.  
RECOMMENDATION: Validate connectivity rules.

---

ID: F-024  
TITLE: `origin_anchor_id` / `indoor_nodes.anchor_id` lack FKs  
SEVERITY: LOW  
AREA: Database  
STATUS: CONFIRMED  

EVIDENCE: `schema.sql`  
PROBLEM: Orphan UUIDs.  
IMPACT: Broken map origin.  
RECOMMENDATION: Deferrable FKs.

---

ID: F-025  
TITLE: Main JS bundle ~1.8MB / Cesium ~4.2MB  
SEVERITY: LOW  
AREA: Performance  
STATUS: CONFIRMED  

EVIDENCE: `vite build` this audit  
PROBLEM: Slow first load on campus LTE.  
IMPACT: Poor mobile UX.  
RECOMMENDATION: Further code-split; CDN.

---

ID: F-026  
TITLE: IoT tick N+1 queries  
SEVERITY: LOW  
AREA: Performance  
STATUS: CONFIRMED  

EVIDENCE: `simulator.ts` loop `upsertCrowdByEdge`  
PROBLEM: One query per edge per 10s.  
IMPACT: DB CPU as graph grows.  
RECOMMENDATION: Bulk upsert.

---

ID: F-027  
TITLE: Register API exists with no UI  
SEVERITY: INFO  
AREA: Auth  
STATUS: CONFIRMED  

EVIDENCE: `api.register` unused; `POST /auth/register` open  
PROBLEM: Unverified `user` accounts via API.  
IMPACT: Extra accounts; not admin.  
RECOMMENDATION: Disable or add verification.

---

ID: F-028  
TITLE: README/architecture still describe Three.js twin  
SEVERITY: INFO  
AREA: Docs  
STATUS: CONFIRMED  

EVIDENCE: `README.md`; `docs/architecture/digital-twin-design.md`  
PROBLEM: Reviewers audit the wrong renderer.  
IMPACT: Wrong ops assumptions.  
RECOMMENDATION: Document Cesium `/twin`.

---

ID: F-029  
TITLE: Unity/AR Foundation versions not in repository  
SEVERITY: INFO  
AREA: Unity  
STATUS: NOT VERIFIED  

EVIDENCE: no `ProjectVersion.txt` / `Packages/manifest.json`  
PROBLEM: Cannot confirm AR packages from source.  
IMPACT: Mapper may not build as documented.  
RECOMMENDATION: Commit Unity version/package files.

---

ID: F-030  
TITLE: Physical GPS, QR print, Unity mapper, Docker full-stack  
SEVERITY: INFO  
AREA: Verification  
STATUS: NOT VERIFIED  

EVIDENCE: this audit ran typecheck/lint/test/build only  
PROBLEM: Campus walk and compose networking unproven here.  
IMPACT: Unknown field failures.  
RECOMMENDATION: Device and compose test plan before any pilot.

---

ID: F-031  
TITLE: Notification unread state never clears  
SEVERITY: MEDIUM  
AREA: Frontend / Notifications  
STATUS: CONFIRMED  

EVIDENCE:
- `apps/web/src/lib/api.ts` `markRead` → `POST /notifications/:id/read`
- `apps/web/src/components/AppShell.tsx` fetches `notifications` but never calls `markRead`
- Grep of `apps/web`: no `api.markRead` / `markRead(` caller

PROBLEM: Backend per-user read table exists; UI never writes it.  
IMPACT: Bell/unread indicator stays on for every session.  
REPRODUCTION SCENARIO: Log in, open the notification panel, close it, reload.  
RECOMMENDATION: Call mark-read on open or per-item; or drop the unread UI.

---

ID: F-032  
TITLE: Shared navigate URLs drop building / indoor context  
SEVERITY: MEDIUM  
AREA: Indoor handoff  
STATUS: CONFIRMED  

EVIDENCE:
- `apps/web/src/lib/navigateUrl.ts` `buildNavigateShareUrl` sets only `from` and `to`
- `parseNavigateParams` and Navigate URL sync also use `building`
- `NavigatePage.tsx` share copies `buildNavigateShareUrl(sourceNodeId, destinationNodeId)`

PROBLEM: Clipboard share cannot restore indoor building preload.  
IMPACT: Recipient gets outdoor-only navigation even when the sender was going to a mapped building.  
REPRODUCTION SCENARIO: Pick a published indoor building, share the URL, open it in a private window.  
RECOMMENDATION: Include `building` (and indoor destination if set) in the share builder.

---

ID: F-033  
TITLE: `/health` does not check the database; live/ready endpoints missing  
SEVERITY: MEDIUM  
AREA: Production  
STATUS: CONFIRMED  

EVIDENCE:
- `apps/api/src/interfaces/http/app.ts` `GET /health` returns `{ status: 'ok', service: 'campusar-api' }` with no `pool.query`
- `docker-compose.yml` API service has no healthcheck
- `docs/architecture/deployment-architecture.md` and `security-architecture.md` claim `/health/live` and `/health/ready`

PROBLEM: Orchestrators can mark the API healthy while Postgres is down.  
IMPACT: False-green deploys; clients get 500s after traffic is attached.  
REPRODUCTION SCENARIO: Stop Postgres, curl `/health` — still `ok`.  
RECOMMENDATION: Ready probe that `SELECT 1` against the pool; keep a cheap liveness path.

---

ID: F-034  
TITLE: Map, Twin, and Safety bootstrap promises have no rejection handler  
SEVERITY: MEDIUM  
AREA: Error handling  
STATUS: CONFIRMED  

EVIDENCE:
- `MapPage.tsx` `Promise.all([buildings, rooms, nodes, edges, zones, categories]).then(...)` — no `.catch`
- `TwinPage.tsx` same pattern; only `iotCrowd` uses `.catch(() => [])`
- `SafetyPage.tsx` `Promise.all([zones, exits, contacts]).then(...)` — no `.catch`

PROBLEM: Failed campus/safety fetches become unhandled rejections and empty UI.  
IMPACT: Blank map/twin/safety with no retry or error copy.  
REPRODUCTION SCENARIO: Kill the API, hard-reload `/map` or `/safety`.  
RECOMMENDATION: `.catch` with user-visible error + retry, matching AnalyticsPage.

---

ID: F-035  
TITLE: CI does not run the production web/API TypeScript+Vite build  
SEVERITY: LOW  
AREA: CI  
STATUS: CONFIRMED  

EVIDENCE:
- `.github/workflows/ci.yml` quality job: format, lint, typecheck, psql schema/seed, `npm test`
- docker job: `docker compose build` only — no image push, no `/health` smoke
- `docs/architecture/deployment-architecture.md` lists CI **build**

PROBLEM: Vite/Cesium production bundling is not gated on PRs (local `npm run build` passed this audit).  
IMPACT: Bundle/asset regressions can merge if typecheck still passes.  
RECOMMENDATION: Add `npm run build` to CI; optional compose smoke of `/health`.

---

ID: F-036  
TITLE: Live sensor readings are computed and unused  
SEVERITY: INFO  
AREA: IoT / Frontend  
STATUS: CONFIRMED  

EVIDENCE:
- `useCampusLive.ts` stores `sensors` from WS `sensors` messages
- No `live.sensors` consumer under `apps/web/src`
- `api.iotSensors` has no caller

PROBLEM: Simulator writes `sensor_readings` and broadcasts; UI never shows them.  
IMPACT: Extra WS/CPU with no product surface.  
RECOMMENDATION: Wire an admin/twin panel or stop broadcasting unused payloads.

---

ID: F-037  
TITLE: Admin UI cannot update buildings, zones, or events; cannot delete crowd rows  
SEVERITY: LOW  
AREA: Admin  
STATUS: CONFIRMED  

EVIDENCE:
- `api.ts` defines `adminBuildings.update`, `adminZones.update`, `adminEvents.update`, `adminCrowd.remove`
- `AdminPage.tsx` only create/remove for buildings/zones/events; crowd upsert only
- Backend PUT/DELETE routes exist and are admin-gated

PROBLEM: Operators must recreate or use raw API to edit.  
IMPACT: Stale names/coords; crowd rows accumulate.  
RECOMMENDATION: Wire the existing client methods or remove dead API wrappers.

---

## RELEASE DECISION

**READY ONLY FOR INTERNAL TESTING**

Outdoor A\* + Leaflet + GPS overlay are the strongest parts and are covered by unit/API tests. Production networking, safety messaging, auth hardening, indoor web QR, and documentation honesty are not at release quality.

### MUST FIX BEFORE RELEASE

- F-001 SOS copy / real alerting
- F-002 Docker/nginx API+WS proxy and correct `VITE_API_URL`
- F-003 / F-004 token storage and revocation
- F-005 rate limits on login/guest/SOS
- F-007 default admin credentials in UI
- F-008 CI prettier failure
- F-012 SOS must not invent location

### SHOULD FIX BEFORE RELEASE

- F-006 Swagger/graph exposure in prod
- F-009 camera QR or honest UX
- F-010 disable IoT simulator in production
- F-011 analytics semantics
- F-013 guest table growth
- F-015 persist vs logout
- F-016 fire zone enum
- F-017 JWT TTL/secret production fail-fast
- F-018 contact PII
- F-020 error boundaries
- F-031 notification mark-read
- F-032 share URL building param
- F-033 health/readiness vs Postgres
- F-034 Map/Twin/Safety unhandled bootstrap

### CAN FIX AFTER RELEASE

- F-014 cache TTL
- F-019 / F-023 / F-024 graph integrity
- F-021 MapPage races
- F-022 duplicate names
- F-025 / F-026 performance
- F-027 register API
- F-028 docs
- F-035 CI `npm run build`
- F-036 unused sensors
- F-037 admin update UI

### NOT VERIFIED ON REAL DEVICE

- Outdoor GPS arrival at RNSIT
- Compass on iOS Safari
- Camera permissions Android/iOS
- Printed CampusAR QR
- Unity AR Foundation mapper/guidance
- Cesium assets under nginx
- `docker compose up --build` from another host
- Multi-tab refresh-token races under load
