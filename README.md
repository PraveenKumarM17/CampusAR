# CampusAR – Smart Campus Navigation

Production-quality platform for campus search, composite-cost A* routing, IoT-simulated crowd sensing, predictive re-routing, Digital Twin monitoring, Web AR navigation, safety, accessibility, admin tooling, and analytics.

## Stack

- **Web**: React + TypeScript + Tailwind + Three.js Digital Twin
- **API**: Node.js + Express + Zod + JWT + WebSocket (clean architecture)
- **DB**: PostgreSQL 16 + PostGIS
- **AR**: Web AR in the browser + Unity AR Foundation scaffold
- **Ops**: Docker Compose, GitHub Actions, ESLint, Prettier, Vitest

## Quick start (local)

```bash
cp .env.example .env
npm install

docker compose up -d db

# Apply schema + Smart Campus seed (DB published on host port 5433)
npm run db:migrate -w @campusar/api
npm run db:seed -w @campusar/api

# Run API + web
npm run dev:api
npm run dev:web
```

- Web: http://localhost:5173
- API: http://localhost:4000
- Swagger: http://localhost:4000/api/docs
- WebSocket: `ws://localhost:4000/ws`

### Demo accounts

| Role    | Email                   | Password                |
| ------- | ----------------------- | ----------------------- |
| Admin   | admin@smartcampus.edu   | admin123                |
| Student | student@smartcampus.edu | student123              |
| Guest   | —                       | Use “Continue as guest” |

## Docker (full stack)

```bash
cp .env.example .env
docker compose up --build
```

Web on `:5173`, API on `:4000`, DB on host `:5433`.

## Monorepo layout

```
apps/api          Express API (domain / application / infrastructure / interfaces)
apps/web          React client (map, navigate, AR, twin, safety, admin)
packages/shared   Shared TypeScript types
unity/CampusAR    Unity AR Foundation client scaffold
docs/             Architecture, API, database, deployment
```

## Four-layer architecture

1. **L1 IoT simulation** – 10s crowd/sensor ticks writing into `crowd_levels` / `sensor_readings`
2. **L2 AI routing** – A* with distance + crowd + traffic + safety + accessibility; schedule/EWMA crowd forecast
3. **L3 Digital Twin** – Three.js campus twin with live WebSocket heatmaps
4. **L4 Web AR** – Camera overlay with compass-aligned guidance

## Scripts

| Command             | Description                  |
| ------------------- | ---------------------------- |
| `npm run lint`      | ESLint                       |
| `npm run format`    | Prettier                     |
| `npm run typecheck` | TS check all workspaces      |
| `npm test`          | Unit + API integration tests |

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [API](docs/API.md)
- [Database](docs/DATABASE.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Unity AR](unity/CampusAR/README.md)
