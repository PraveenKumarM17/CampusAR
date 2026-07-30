# CampusAR – Intelligent AR Navigation System

Production-quality MVP for campus search, smart A* routing, Web AR navigation, safety, accessibility, admin tooling, and analytics.

## Stack

- **Web**: React + TypeScript + Tailwind (glassmorphism, dark mode)
- **API**: Node.js + Express + Zod + JWT (clean architecture)
- **DB**: PostgreSQL 16 + PostGIS
- **AR**: Web AR in the browser + Unity AR Foundation scaffold
- **Ops**: Docker Compose, GitHub Actions, ESLint, Prettier, Vitest

## Quick start (local)

```bash
cp .env.example .env
npm install

docker compose up -d db

# Apply schema + Northridge seed (DB published on host port 5433)
npm run db:migrate -w @campusar/api
npm run db:seed -w @campusar/api

# Run API + web
npm run dev:api
npm run dev:web
```

- Web: http://localhost:5173
- API: http://localhost:4000
- Swagger: http://localhost:4000/api/docs

### Demo accounts

| Role    | Email                  | Password                |
| ------- | ---------------------- | ----------------------- |
| Admin   | admin@northridge.edu   | admin123                |
| Student | student@northridge.edu | student123              |
| Guest   | —                      | Use “Continue as guest” |

## Docker (full stack)

```bash
cp .env.example .env
docker compose up --build
```

Web on `:5173`, API on `:4000`, DB on `:5432`.

## Monorepo layout

```
apps/api          Express API (domain / application / infrastructure / interfaces)
apps/web          React client
packages/shared   Shared TypeScript types
unity/CampusAR    Unity AR Foundation client scaffold
docs/             Architecture, API, database, deployment
```

## Smart routing

A* edge cost combines distance, safety, crowd, accessibility, and blocked-road penalties. Weights are configurable in the admin dashboard and stored in `route_weights`.

Crowd levels and danger zones are **admin-simulated** (no IoT/BLE/MQTT in this MVP).

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

## Extensibility

Repositories for `crowd_levels` and `danger_zones` isolate dynamic inputs. Future BLE localization, IoT sensors, or AI crowd prediction can write into those tables (or swap repository implementations) without rewriting the routing engine or clients.
