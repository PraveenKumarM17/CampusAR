# CampusAR – Smart Campus Navigation

Production-quality platform for campus search, composite-cost A* routing, IoT-simulated crowd sensing, predictive re-routing, Digital Twin monitoring, Web AR navigation, safety, accessibility, admin tooling, and analytics.

## Stack

- **Web**: React + TypeScript + Tailwind + Three.js Digital Twin
- **API**: Node.js + Express + Zod + JWT + WebSocket (clean architecture)
- **DB**: PostgreSQL 16 + PostGIS
- **AR**: Web AR in the browser + Unity AR Foundation scaffold
- **Ops**: Docker Compose, GitHub Actions, ESLint, Prettier, Vitest

## Quick start (local)

### One-command setup (for teammates)

#### Windows (recommended — auto-installs Git, Node.js, Docker if missing)

Open **PowerShell** (normal user is fine) and paste:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/PraveenKumarM17/CampusAR/main/scripts/bootstrap.ps1 | iex"
```

Custom install folder:

```powershell
$env:CAMPUSAR_INSTALL_DIR = "D:\CampusAR"
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/PraveenKumarM17/CampusAR/main/scripts/bootstrap.ps1 | iex"
```

The script will automatically:

1. Install **winget** (App Installer) if needed  
2. Install **Git**, **Node.js LTS (20+)**, and **Docker Desktop** via winget if missing  
3. Start Docker Desktop and wait until it is running  
4. Clone the repo to `%USERPROFILE%\CampusAR`  
5. Run `npm install`, start PostgreSQL, migrate, and seed  

**After setup**, open two PowerShell windows:

```powershell
cd $env:USERPROFILE\CampusAR
npm run dev:api    # http://localhost:4000

cd $env:USERPROFILE\CampusAR
npm run dev:web    # http://localhost:5173
```

**Notes for Windows:**

- First Docker install may require **sign-out or reboot** — if setup stops at Docker, restart PC, open Docker Desktop, then run `powershell -ExecutionPolicy Bypass -File scripts\setup.ps1` again inside the clone.  
- Allow **UAC prompts** when winget installs software.  
- **WSL2** is recommended for Docker Desktop (installer usually enables it).

**Already cloned?** Setup only:

```powershell
cd CampusAR
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
```

#### Linux / macOS / WSL

```bash
curl -fsSL https://raw.githubusercontent.com/PraveenKumarM17/CampusAR/main/scripts/bootstrap.sh | bash
```

Custom install folder:

```bash
curl -fsSL https://raw.githubusercontent.com/PraveenKumarM17/CampusAR/main/scripts/bootstrap.sh | bash -s -- ~/projects/CampusAR
```

**Requirements (Linux/macOS):** Git, Node.js 20+, npm, Docker — install manually if missing.

**Already cloned?**

```bash
bash scripts/setup.sh
```

---

### Manual setup

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

##updates
