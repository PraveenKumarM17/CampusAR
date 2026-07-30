# Architecture

## Overview

CampusAR is a monorepo with a React client, Express API, shared types, and a Unity AR client scaffold. The API follows clean architecture so routing, campus data, and future localization sources remain swappable.

```
Client (Web / Unity)
    ↓ REST + JWT + WebSocket
Interfaces (Express routes, Zod validation, Swagger, WS hub)
    ↓
Application (auth, navigation services)
    ↓
Domain (A* engine, cost model, crowd predictor, errors)
    ↓
Infrastructure (Postgres/PostGIS, IoT simulator, JWT)
```

## Four layers

| Layer       | Implementation                                                                                        |
| ----------- | ----------------------------------------------------------------------------------------------------- |
| **L1 IoT**  | `infrastructure/iot/simulator.ts` ticks every 10s → `crowd_levels` / `sensor_readings` + WS broadcast |
| **L2 AI**   | A* composite cost + `ScheduleEwmaPredictor` (LSTM-ready) + hazard/event edge penalties                |
| **L3 Twin** | `/twin` Three.js scene fed by REST snapshot + live WebSocket crowd/hazards                            |
| **L4 AR**   | `/ar` camera overlay with DeviceOrientation compass alignment + 10s recalculate                       |

## Routing engine

1. Load nodes/edges and admin `route_weights`.
2. Apply active danger zones / routing-affecting events to edge safety, crowd, and blocked flags.
3. Optionally blend live crowd with predicted intensity (horizon ~20 min).
4. Apply accessibility filters (wheelchair / avoid stairs / lift & ramp preference).
5. Skip or heavily penalize `blocked` edges.
6. Run A* with heuristic = scaled haversine distance.
7. Emit turn instructions, distance, ETA, and `predictionUsed`.

Cost model (paper-aligned):

`w = α·d̃ + β·crowd + safety·(1−s) + accessibility·(1−a)`

## Realtime bus

- WebSocket path: `/ws`
- Message types: `crowd`, `sensors`, `hazard`, `iot_status`, `ping`
- Admin can start/stop the simulator via `/api/iot/*` (also auto-starts when `IOT_SIMULATOR=true`)

## Frontend

Feature folders under `apps/web/src/features` keep map, navigate, AR, twin, safety, admin, and analytics isolated. Zustand persists auth, theme, and accessibility prefs. `useCampusLive` shares one WS subscription pattern across map/twin/AR.

## Extension hooks

| Capability        | Extension point                                                   |
| ----------------- | ----------------------------------------------------------------- |
| BLE localization  | Replace client pose provider; map beacons → nearest `nodes`       |
| Real MQTT sensors | Replace simulator writer; keep `crowd_levels` / `sensor_readings` |
| Real LSTM         | Implement `CrowdPredictor`; swap `defaultCrowdPredictor`          |
| Unity ARCore      | `unity/CampusAR` scaffold; same REST + JWT contracts              |
