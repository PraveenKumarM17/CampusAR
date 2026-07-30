# Architecture

## Overview

CampusAR is a monorepo with a React client, Express API, shared types, and a Unity AR client scaffold. The API follows clean architecture so routing, campus data, and future localization sources remain swappable.

```
Client (Web / Unity)
    ↓ REST + JWT
Interfaces (Express routes, Zod validation, Swagger)
    ↓
Application (auth, navigation services)
    ↓
Domain (A* engine, cost model, errors)
    ↓
Infrastructure (Postgres/PostGIS repositories, JWT)
```

## Routing engine

1. Load nodes/edges and admin `route_weights`.
2. Apply accessibility filters (wheelchair / avoid stairs / lift & ramp preference).
3. Skip or heavily penalize `blocked` edges.
4. Run A* with heuristic = scaled haversine distance.
5. Emit turn instructions, distance, and ETA.
6. Record analytics navigation row.

## Safety & dynamics

- Danger zones and crowd scores are written by admins (simulated).
- SOS creates `sos_events` and an emergency notification.
- Blocked edges emit `road_closed` / `route_updated` notifications.

## Frontend

Feature folders under `apps/web/src/features` keep map, navigate, AR, safety, admin, and analytics isolated. Zustand persists auth, theme, and accessibility prefs.

## Future hooks

| Capability        | Extension point                                                     |
| ----------------- | ------------------------------------------------------------------- |
| BLE localization  | Replace client pose provider; map beacons → nearest `nodes`         |
| IoT crowd sensors | Writer service → `crowd_levels` / `edges.crowd_score`               |
| AI prediction     | Batch job updates crowd scores; routing unchanged                   |
| Digital twin      | Mirror buildings/edges into twin store; keep API as source of truth |
