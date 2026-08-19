# CampusAR – Smart Campus Navigation

Production-quality platform for campus search, composite-cost A* routing, IoT-simulated crowd sensing, predictive re-routing, Digital Twin monitoring, Web AR navigation, safety, accessibility, admin tooling, and analytics.

## Stack

- **Web**: React + TypeScript + Tailwind + Three.js Digital Twin
- **API**: Node.js + Express + Zod + JWT + WebSocket (clean architecture)
- **DB**: PostgreSQL 16 + PostGIS
- **AR**: Web AR in the browser + Unity AR Foundation scaffold
- **Ops**: Docker Compose, GitHub Actions, ESLint, Prettier, Vitest

## Quick start (local)

### Prerequisites

| Tool | Version |
|------|---------|
| **Node.js** | 20 or newer |
| **npm** | Comes with Node |
| **Docker** | Docker Desktop (must be **running**) |
| **Git** | To clone the repo |

### 1. Clone and configure

```bash
git clone https://github.com/PraveenKumarM17/CampusAR.git
cd CampusAR
cp .env.example .env
npm install
```

On Windows (PowerShell): `copy .env.example .env`

### 2. Start the database

```bash
docker compose up -d db
```

PostgreSQL listens on host port **5433**.

### 3. Migrate and seed

```bash
npm run db:migrate
npm run db:seed
```

### 4. Run the app

Use **two terminals** from the project root:

**Terminal 1 — API:**
```bash
npm run dev:api
```

**Terminal 2 — Web:**
```bash
npm run dev:web
```

### 5. Open in browser

| Service | URL |
|---------|-----|
| Web app | http://localhost:5173 |
| API | http://localhost:4000 |
| Swagger | http://localhost:4000/api/docs |
| WebSocket | `ws://localhost:4000/ws` |

### Demo accounts

| Role    | Email                   | Password                |
| ------- | ----------------------- | ----------------------- |
| Admin   | admin@smartcampus.edu   | admin123                |
| Student | student@smartcampus.edu | student123              |
| Guest   | —                       | Use “Continue as guest” |

### Optional: Google Maps

Add to `.env`:

```env
VITE_GOOGLE_MAPS_API_KEY=your_key_here
```

Without it, maps use Esri satellite + roads.

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

##updates
