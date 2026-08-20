# CampusAR Audit Evidence Log

Generated from the live repository at `/home/praveen/AR-navigationP`.
No application source, schema, tests, or configuration were modified for this audit.
This file is a compact inventory. Narrative findings live in `CAMPUSAR_FULL_TECHNICAL_AUDIT_EXPORT.md`.

Date of inspection: 2026-08-20.

---

## 1. Repository tree (source only)

Omitted: `node_modules/`, `dist/`, `build/`, Unity `Library/`/`Temp/` (gitignored), generated Cesium copies.

```
AR-navigationP/
├── .env.example
├── .github/workflows/ci.yml
├── .gitignore
├── .prettierignore
├── docker-compose.yml
├── package.json
├── package-lock.json
├── README.md
├── docs/
│   ├── API.md
│   ├── ARCHITECTURE.md
│   ├── DATABASE.md
│   ├── DEPLOYMENT.md
│   ├── architecture/          # HLD/LLD, security, GPS, indoor-ar-mapping, twin, WS, etc.
│   ├── design/                # UX/design system
│   └── product/               # PRD, features, roles
├── apps/api/
│   ├── Dockerfile
│   ├── package.json
│   ├── vitest.config.ts
│   └── src/
│       ├── server.ts
│       ├── application/       # auth, navigation, indoor, validation
│       ├── domain/            # astar, indoor routing/geometry, prediction, errors
│       ├── infrastructure/
│       │   ├── auth/jwt.ts
│       │   ├── config/env.ts
│       │   ├── db/            # schema.sql, seed.sql, seed.ts, migrate.ts, pool.ts
│       │   ├── iot/simulator.ts
│       │   ├── realtime/wsHub.ts
│       │   ├── repositories/
│       │   └── swagger/openapi.ts
│       └── interfaces/http/
│           ├── app.ts
│           ├── middleware/auth.ts, errorHandler.ts
│           └── routes/        # auth, campus, navigation, indoor, safety, admin, iot
├── apps/web/
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── vite.config.ts
│   ├── index.html
│   ├── package.json
│   └── src/
│       ├── App.tsx, main.tsx
│       ├── components/        # AppShell, maps, indoor picker, twin Cesium, navigate search
│       ├── features/          # auth, map, navigate, ar, indoor, safety, admin, analytics, twin
│       ├── hooks/             # useCampusLive, useGeolocation
│       ├── lib/               # api.ts, geo, routeProgress, buildingNavigation, cesiumCampus
│       ├── stores/            # authStore, themeStore (theme + prefs + nav)
│       └── public/models/avatars/
├── packages/shared/src/index.ts
├── unity/CampusAR/
│   ├── README.md
│   └── Assets/Scripts/        # ApiClient, RouteFollower, ArrowGuide, VoiceGuide, Indoor/*
├── scripts/dev-backend.sh
└── (this audit) CAMPUSAR_*.md
```

### Directory purpose

| Path | Purpose in actual code |
|------|------------------------|
| `apps/api` | Express REST + WebSocket server |
| `apps/web` | React SPA (Leaflet/OSM maps, Web AR camera overlay, Cesium twin) |
| `packages/shared` | Shared TS types/constants consumed by API and web |
| `unity/CampusAR` | C# scripts only (no Unity project version file, no `Packages/manifest.json` in repo) |
| `apps/api/src/infrastructure/db` | Canonical schema + seed + migrate runner |
| `docs/` | Architecture/product/design; several claims diverge from code |
| `.github/workflows/ci.yml` | format, lint, typecheck, schema apply, test, docker build |
| `docker-compose.yml` | PostGIS 16, API, nginx web |

---

## 2. Package scripts

Root `package.json`:

| Script | Command |
|--------|---------|
| `dev` | `npm run dev --workspaces --if-present` |
| `dev:api` | `npm run dev -w @campusar/api` |
| `dev:web` | `npm run dev -w @campusar/web` |
| `build` | `npm run build --workspaces --if-present` |
| `test` | `npm run test --workspaces --if-present` |
| `lint` | `eslint . --ext .ts,.tsx --max-warnings 0` |
| `lint:fix` | eslint --fix |
| `format` / `format:check` | prettier write/check |
| `typecheck` | workspaces typecheck |
| `db:migrate` / `db:seed` | API workspace |

API: `dev` = `tsx watch src/server.ts`; `build` = `tsc`; `test` = `vitest run`; `db:migrate` / `db:seed`.

Web: `dev` = `vite`; `build` = `tsc -b && vite build`; `test` = `vitest run`.

Shared: `build` / `typecheck` / `prepare` = tsc.

---

## 3. Environment variable names

From `.env.example` and `apps/api/src/infrastructure/config/env.ts`.
**No `.env` file is committed** (`.gitignore` includes `.env`). Values below are example/default names only.

| Name | Appears committed? | Notes |
|------|-------------------|--------|
| `POSTGRES_USER` | `.env.example`, compose default `campusar` | |
| `POSTGRES_PASSWORD` | `.env.example` example `campusar_secret` | Default also in compose |
| `POSTGRES_DB` | `.env.example` / compose | |
| `DATABASE_URL` | `.env.example`; env.ts fallback to localhost:5433 | |
| `API_PORT` | example `4000` | |
| `JWT_ACCESS_SECRET` | example string in `.env.example` and compose default | env.ts also has hardcoded fallback |
| `JWT_REFRESH_SECRET` | same | |
| `JWT_ACCESS_EXPIRES` | `.env.example` `15m`; env.ts fallback `8h` | **mismatch** |
| `JWT_REFRESH_EXPIRES` | `7d` | |
| `CORS_ORIGIN` | example localhost:5173 | comma-separated; `*` allowed |
| `NODE_ENV` | | |
| `IOT_SIMULATOR` | `.env.example` `true`; compose API service does **not** set it | env.ts defaults true |
| `VITE_API_URL` | `/api` in example; Docker web ARG default `http://localhost:4000/api` | baked at web build |
| `VITE_WS_URL` | optional, commented | |
| `VITE_GOOGLE_MAPS_API_KEY` | empty in example | |

Docs `deployment-architecture.md` also mention `ACCESS_TTL` / `REFRESH_TTL` — **those names are not used in code**.

---

## 4. Complete frontend route list

From `apps/web/src/App.tsx`. Catch-all `*` → `/`.

| Route | Component | Auth | Role |
|-------|-----------|------|------|
| `/` | `LandingPage` | none | — |
| `/map` | `MapPage` | frontend `Protected` (any logged-in user/guest) | any |
| `/navigate` | `NavigatePage` | same | any |
| `/ar` | `ArPage` | same | any |
| `/indoor` | `IndoorPage` | same | any |
| `/safety` | `SafetyPage` | same | any |
| `/twin` | `TwinPage` | `Protected` + nested `Protected admin` | `admin` |
| `/admin` | `AdminPage` | admin | `admin` |
| `/analytics` | `AnalyticsPage` | admin | `admin` |

No other React Router paths exist. Hash routes: none.

Protection mechanism: `useAuthStore.user` presence. Admin: `user.role !== 'admin'` redirects to `/map`. This is **frontend-only**. Backend admin routes use `requireAuth` + `requireRole('admin')`.

Member/`user` role is valid in JWT and `Protected`, but Landing only offers guest + admin login. `api.register` has no UI.

Dead client methods (defined in `api.ts`, no feature caller): `register`, `markRead`, `iotSensors`, `adminBuildings.update`, `adminZones.update`, `adminCrowd.remove`, `adminEvents.update`.

---

## 5. Complete API endpoint list

Mounted in `apps/api/src/interfaces/http/app.ts`. Prefix `/api` except `/health`.

### OTHER

| Method | Path | Auth |
|--------|------|------|
| GET | `/health` | none (JSON `{ status, service }` — **no DB check**; docs `/health/live` `/health/ready` do not exist) |
| GET | `/api/docs` | none (Swagger UI) |
| GET | `/api/docs.json` | none |
| WS | `/ws` | **none** |

### AUTH (`/api/auth`)

| Method | Path | Auth |
|--------|------|------|
| POST | `/register` | none |
| POST | `/login` | none |
| POST | `/guest` | none |
| POST | `/refresh` | none (body refresh JWT) |

### CAMPUS (`/api/campus`)

| Method | Path | Auth |
|--------|------|------|
| GET | `/buildings` | none |
| GET | `/floors` | none |
| GET | `/rooms` | none |
| GET | `/nodes` | none |
| GET | `/places` | none |
| GET | `/edges` | none |
| GET | `/search` | optionalAuth (for analytics user id) |
| GET | `/categories` | none |

### NAVIGATION (`/api/navigation`)

| Method | Path | Auth |
|--------|------|------|
| POST | `/route` | optionalAuth |
| POST | `/recalculate` | optionalAuth (same handler) |
| GET | `/resolve` | optionalAuth |

### INDOOR (`/api/indoor`)

| Method | Path | Auth |
|--------|------|------|
| GET | `/maps` | optionalAuth (non-admin filtered to published) |
| POST | `/maps` | admin |
| GET | `/maps/:id` | optionalAuth |
| PUT | `/maps/:id` | admin |
| POST | `/nodes` | admin |
| PUT | `/nodes/:id` | admin |
| DELETE | `/nodes/:id` | admin |
| POST | `/edges` | admin |
| PUT | `/edges/:id` | admin |
| DELETE | `/edges/:id` | admin |
| POST | `/places` | admin |
| GET | `/places/search` | optionalAuth |
| GET | `/places` | optionalAuth (`buildingId` required) |
| GET | `/places/:id` | optionalAuth |
| PUT | `/places/:id` | admin |
| POST | `/anchors` | admin |
| GET | `/anchors/:code` | optionalAuth |
| POST | `/handoffs` | admin |
| GET | `/handoffs` | optionalAuth (`outdoorNodeId`) |
| GET | `/buildings/:buildingId/context` | optionalAuth |
| POST | `/route` | optionalAuth |

### SAFETY / NOTIFICATIONS

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/safety/zones` | none |
| GET | `/api/safety/exits` | none |
| GET | `/api/safety/contacts` | none |
| POST | `/api/safety/sos` | optionalAuth |
| GET | `/api/notifications` | optionalAuth |
| POST | `/api/notifications/:id/read` | requireAuth |

### ADMIN (`/api/admin` — router-level requireAuth+admin)

| Method | Path |
|--------|------|
| GET/PUT | `/weights` |
| POST/PUT/DELETE | `/buildings`, `/buildings/:id` |
| GET/POST/PUT/DELETE | `/paths/nodes`, `/paths/nodes/:id` |
| GET/POST/PUT/DELETE | `/paths/edges`, `/paths/edges/:id` |
| GET/POST/PUT/DELETE | `/danger-zones`, `/danger-zones/:id` |
| GET/POST/DELETE | `/crowd`, `/crowd/:id` |
| GET/POST/PUT/DELETE | `/events`, `/events/:id` |

### IOT (`/api/iot`)

| Method | Path | Auth |
|--------|------|------|
| GET | `/status` `/sensors` `/crowd` | optionalAuth |
| POST | `/start` `/stop` `/tick` | admin |

### ANALYTICS (`/api/analytics`)

| Method | Path | Auth |
|--------|------|------|
| GET | `/summary` `/searches` `/popular-routes` | admin |

OpenAPI (`apps/api/src/infrastructure/swagger/openapi.ts`) lists 12 path groups. Indoor context/places/anchors, most admin CRUD, IoT, and `/navigation/resolve` are not in the spec.

Frontend callers vs backend: `GET /campus/floors`, `POST /iot/tick`, `GET /analytics/searches`, `GET /analytics/popular-routes`, and all indoor admin write routes have **no** web caller (indoor writes: Unity only).

Share helper `buildNavigateShareUrl` omits `building` even though `/navigate` URL state includes it.

---

## 6. Database table list

From `apps/api/src/infrastructure/db/schema.sql` (actual source of truth).

Outdoor/campus: `users`, `buildings`, `floors`, `rooms`, `nodes`, `edges`, `danger_zones`, `crowd_levels`, `sensor_readings`, `events`, `route_weights`, `notifications`, `notification_reads`, `emergency_contacts`, `emergency_exits`, `analytics_searches`, `analytics_navigations`, `sos_events`.

Indoor (local meters): `indoor_maps`, `indoor_nodes`, `indoor_edges`, `indoor_places`, `indoor_anchors`, `indoor_handoffs`.

No refresh-token / session table. No organization/tenant table.

---

## 7. State store list

| Store | File | Persist key |
|-------|------|-------------|
| `useAuthStore` | `apps/web/src/stores/authStore.ts` | `campusar-auth` (Zustand persist → localStorage by default) |
| `useThemeStore` | `themeStore.ts` | `campusar-theme` |
| `usePrefsStore` | `themeStore.ts` | `campusar-prefs` |
| `useNavStore` | `themeStore.ts` | `campusar-nav` |

No Redux, no React Query/SWR cache layer. Page-local `useState` is used heavily.

---

## 8. Files inspected (primary)

- `apps/api/src/interfaces/http/app.ts`, all route files, `auth.ts`, `errorHandler.ts`, `server.ts`
- `apps/api/src/application/{authService,navigationService,indoorService,navigationValidation}.ts`
- `apps/api/src/infrastructure/{config/env,auth/jwt,db/schema.sql,migrate.ts,seed.ts,seed.sql,realtime/wsHub.ts,iot/simulator.ts,repositories/*,swagger/openapi.ts}`
- `apps/web/src/{App.tsx,main.tsx,lib/api.ts,stores/*,hooks/*,features/**,components/**}`
- `packages/shared/src/index.ts`
- `unity/CampusAR/README.md`, `Assets/Scripts/**/*.cs`
- `docker-compose.yml`, Dockerfiles, `nginx.conf`, `.github/workflows/ci.yml`, `.env.example`
- `README.md`, `docs/API.md`, `docs/DATABASE.md`, selected architecture docs
- Test files under `apps/*/src/**/*.test.ts`

Explore passes also confirmed: unused `api.markRead` / `iotSensors` / admin update helpers; `useCampusLive` `sensors` unread; `Promise.all` without `.catch` on Map/Twin/Safety; CI has no `npm run build`; `/health` does not touch Postgres.

---

## 9. Commands actually executed

Working directory: `/home/praveen/AR-navigationP`.
Executed 2026-08-20 with Node workspaces (outside sandbox so Vitest workers could finish).

| Command | Exit | Pass/Fail |
|---------|------|-----------|
| `npm run typecheck` | 0 | PASS |
| `npm run lint` | 0 | PASS |
| `npm run format:check` | 1 | **FAIL** — Prettier: 105 files |
| `npm test` | 0 | PASS — API 45 tests / 7 files; web 53 tests / 8 files |
| `npm run build` | 0 | PASS — web Vite build ~12s; Cesium chunk ~4.2 MB JS |

Docker Compose full-stack boot, physical GPS, camera QR, Unity/ARCore, and production HTTPS were **not** executed.

---

## 10. Exact test/build results (summary)

**Typecheck:** all workspaces `tsc --noEmit` succeeded.

**Lint:** `eslint . --ext .ts,.tsx --max-warnings 0` succeeded.

**Format:** `prettier --check` failed. Sample: `apps/api/src/application/indoorService.ts`, `apps/web/src/features/navigate/NavigatePage.tsx`, `README.md`, most of `docs/`. Message: `Code style issues found in 105 files.`

**API tests:** 45 passed including `indoor.api.test.ts` (DB was reachable on this run; `GET /api/indoor/buildings/:id/context`, scoped search, QR building mismatch 422, deleted place 404).

**Web tests:** 53 passed including `buildingNavigation.test.ts` (12) and `routeProgress.test.ts` (11).

**Production build:** `vite build` reported:
- `dist/assets/index-BXnqQ_8w.js` 1,788.76 kB (gzip 504.46 kB)
- `dist/assets/CesiumDigitalTwin-BrMYM2zH.js` 4,169.25 kB (gzip 1,121.71 kB)

CI workflow also runs `npm run format:check` first — that job would fail on current tree.
