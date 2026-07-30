# 5. Technology Decisions — CampusAR

Architecture Decision Records (compact). Product requirements are fixed; these choices implement them.

---

## Decision summary

| Area | Decision | Status |
|------|----------|--------|
| Frontend framework | React + TypeScript + Vite | Accepted |
| Styling | Tailwind CSS | Accepted |
| Maps | MapLibre GL | Accepted |
| 3D / Twin / doll | Three.js (+ React Three Fiber optional) | Accepted |
| Backend runtime | Node.js + TypeScript | Accepted |
| HTTP framework | Express (adapter-swappable) | Accepted |
| Database | PostgreSQL + PostGIS | Accepted |
| Auth | JWT access + refresh | Accepted |
| Realtime | WebSocket | Accepted |
| Containers | Docker / Compose | Accepted |
| Monorepo | npm workspaces (or pnpm) | Accepted |
| Future BLE | Client PositionProvider port | Planned |
| Future MQTT | Ingest worker adapter | Planned |
| Future ML | CrowdPredictor port → TF Serving / ONNX | Planned |

---

## React

**Why:** Ecosystem maturity for SPA maps/AR overlays, strong TypeScript support, team hiring pool, aligns with existing CampusAR web app direction.

**Alternatives:** Vue/Svelte (fine DX, smaller map/AR ecosystem examples); Flutter web (heavier, less ideal for MapLibre/Three mix).

**Tradeoff:** Bundle size discipline required (lazy routes, code split Three/Map).

---

## Node.js + TypeScript

**Why:** Shared language with frontend; fast iteration for modular monolith; adequate for campus-scale CPU pathfinding; same types via `packages/shared`.

**Alternatives:** Go/Rust (higher perf ceiling, split stacks); Python (ML-native but weaker typed API sharing); .NET (enterprise fit, different team assumption).

**Tradeoff:** CPU-heavy ML later should not run in request path — offload to worker.

---

## PostGIS

**Why:** First-class geospatial (snap, distance, intersects hazards) with relational integrity for graph + admin CRUD.

**Alternatives:** Mongo + GeoJSON (weaker relational graph integrity); Neo4j (excellent graphs, weaker campus GIS/admin combo); specialized routing DB only (overkill V1).

**Tradeoff:** Ops must enable PostGIS extension; spatial indexes required.

---

## Tailwind CSS

**Why:** Utility speed for product UI iteration; consistent design tokens via config; fits Vite.

**Alternatives:** CSS Modules, MUI/Chakra (faster generic admin, weaker unique brand control).

**Tradeoff:** Enforce design tokens to avoid utility sprawl (coding standards).

---

## Three.js

**Why:** Digital Twin + guide doll in-browser without native install; large ecosystem; WebGL control.

**Alternatives:** Babylon.js (also strong); pure CSS 3D (insufficient); Cesium (heavier geospatial globe — optional later).

**Tradeoff:** Performance budgets; graceful WebGL fallback to 2D map.

---

## MapLibre

**Why:** Open-source Mapbox GL successor; vector maps; good React bindings; no forced proprietary lock-in.

**Alternatives:** Leaflet (simpler, less modern GL); Google Maps (cost/ToS); Mapbox GL (license).

**Tradeoff:** Basemap tile attribution/provider still needed if using external tiles; campus can ship self-hosted style.

---

## WebSocket

**Why:** Low-latency crowd/hazard fan-out for map/twin/AR; simple V1 co-location with API.

**Alternatives:** SSE (simpler one-way, OK for V1 lite); MQTT to browser (unusual); polling (higher latency/load).

**Tradeoff:** Sticky sessions or shared pub/sub required when horizontally scaling (see scalability).

---

## JWT

**Why:** Stateless API auth for SPA + future native clients; RBAC claims (`role`).

**Alternatives:** Session cookies (simpler XSS surface with care, harder for non-browser clients); OAuth-only (SSO later).

**Tradeoff:** Secure storage (memory + httpOnly refresh cookie preferred over localStorage long-term); rotation & revocation strategy for admin.

---

## Docker

**Why:** Reproducible API/web/db; matches CI and campus IT deploy patterns.

**Alternatives:** Bare systemd; serverless (WS harder); PaaS only.

**Tradeoff:** Compose ≠ production orchestrator; plan K8s/Nomad later without redesigning app contracts.

---

## Future: BLE

**Why (product):** Indoor accuracy.

**Architecture choice:** `PositionProvider` interface on client (and optional server snap assist). BLE impl returns pose + accuracy; pipeline unchanged.

**Alternatives:** Wi-Fi RTT, UWB, visual VPS — same port.

---

## Future: MQTT

**Why:** Standard IoT transport.

**Architecture choice:** MQTT bridge worker subscribes → normalizes → writes crowd/sensor stores → emits same internal events as simulator.

**Alternatives:** HTTP device push, Kafka (heavier).

---

## Future: TensorFlow / ML runtime

**Why:** LSTM-class predictors per product roadmap.

**Architecture choice:** `CrowdPredictor` port; V1 EWMA in-process; later gRPC/HTTP to TF Serving / ONNX Runtime. Routing domain never imports TF directly.

**Alternatives:** PyTorch serve, Vertex/SageMaker, rules-only forever.

---

## Deliberately deferred

| Tech | Why deferred |
|------|--------------|
| Kubernetes (mandatory) | Premature for single-campus pilot |
| Graph microservice split | Modular monolith until scale/team needs |
| Redis (mandatory V1) | Add when multi-instance WS/cache needed |
| GraphQL | REST sufficient; fewer moving parts |
| Micro-frontend | Single product SPA |

---

## Consistency rule

New libraries must: (1) serve a product requirement, (2) have an owner, (3) not bypass domain ports for IoT/ML/pose.
