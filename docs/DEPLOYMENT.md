# Deployment guide

## Prerequisites

- Docker & Docker Compose
- Or Node 20+ and PostgreSQL 16 + PostGIS

## Environment

Copy `.env.example` to `.env` and set strong JWT secrets for production.

## Compose deploy

```bash
docker compose up --build -d
```

Services:

| Service      | Port        |
| ------------ | ----------- |
| web (nginx)  | 5173 → 80   |
| api          | 4000        |
| db (PostGIS) | 5433 → 5432 |

The web container nginx reverse-proxies `/api` and `/ws` to Compose service `api:4000`. The SPA is built with `VITE_API_URL=/api` so browsers on the LAN (`http://<SERVER-IP>:5173`) do not call `localhost:4000`.

Direct `api:4000` on the host is optional (debug/Swagger). The web app does not require it.

Verify proxying:

```bash
npm run test:docker
curl -i http://localhost:5173/health
curl -i http://localhost:5173/api/campus/buildings
```

WebSocket: `ws://localhost:5173/ws` (or `wss://` when the page is HTTPS).

Digital Twin: `http://localhost:5173/digital-twin` (legacy `/twin` redirects here). No Cesium Ion token. Building GLB files go in `apps/web/public/models/buildings/` and are registered in `buildingModels.ts`. Optional footprints/dimensions: `apps/web/src/features/digitalTwin/models/buildingGeometry.ts`. Production still uses `/api` and `/ws` (F-002).

Host port overrides: `WEB_HOST_PORT`, `API_HOST_PORT`, `POSTGRES_HOST_PORT`.

After first DB init, if login passwords are wrong (raw SQL seed), run:

```bash
docker compose exec api sh -c "node -e \"require('child_process').execSync('npx tsx src/infrastructure/db/seed.ts',{stdio:'inherit'})\" "
```

Prefer seeding via host npm against the published DB port:

```bash
DATABASE_URL=postgresql://campusar:campusar_secret@localhost:5433/campusar npm run db:seed -w @campusar/api
```

## Production notes

1. Terminate TLS at a reverse proxy (Caddy/Nginx/Traefik).
2. Restrict CORS `CORS_ORIGIN` to the real web origin.
3. Rotate JWT secrets; use 15m access / 7d refresh (or shorter).
4. Back up the Postgres volume regularly.
5. Point Unity `ApiBaseUrl` at the public HTTPS API.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs format, lint, typecheck, tests against PostGIS, and Docker image builds.
