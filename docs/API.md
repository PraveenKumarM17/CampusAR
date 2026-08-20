# REST API

Base URL: `/api`  
Interactive docs: `/api/docs`  
OpenAPI JSON: `/api/docs.json`

## Auth

| Method | Path             | Description            |
| ------ | ---------------- | ---------------------- |
| POST   | `/auth/register` | Create student account |
| POST   | `/auth/login`    | Email/password login   |
| POST   | `/auth/guest`    | Guest session          |
| POST   | `/auth/refresh`  | Refresh tokens         |

Responses include `{ user, tokens: { accessToken, refreshToken } }`.

## Sites

| Method | Path            | Description |
| ------ | --------------- | ----------- |
| GET    | `/sites`        | Accessible sites for the caller (guest: default active site) |
| GET    | `/sites/:id`    | Site metadata (center, timezone, organization) |

Campus, navigation, safety, IoT crowd, and admin map reads/writes are scoped by:

1. Header `X-Site-Id`
2. Query `siteId`
3. Body `siteId`
4. Otherwise the oldest active site

See [`architecture/site-tenancy.md`](./architecture/site-tenancy.md).

## Campus

| Method | Path                                  | Description            |
| ------ | ------------------------------------- | ---------------------- |
| GET    | `/campus/buildings`                   | List buildings         |
| GET    | `/campus/floors?buildingId=`          | Floors                 |
| GET    | `/campus/rooms?buildingId=&category=` | Rooms                  |
| GET    | `/campus/nodes`                       | Graph nodes            |
| GET    | `/campus/edges`                       | Graph edges            |
| GET    | `/campus/search?q=`                   | Search buildings/rooms |
| GET    | `/campus/categories`                  | Room categories        |

## Navigation

| Method | Path                      | Description                     |
| ------ | ------------------------- | ------------------------------- |
| POST   | `/navigation/route`       | A* route                        |
| POST   | `/navigation/recalculate` | Same as route (explicit recalc) |

Body:

```json
{
  "sourceNodeId": "uuid",
  "destinationNodeId": "uuid",
  "usePrediction": true,
  "accessibility": {
    "wheelchairMode": false,
    "preferLift": false,
    "preferRamp": false,
    "avoidStairs": false
  }
}
```

## IoT

| Method | Path           | Description             |
| ------ | -------------- | ----------------------- |
| GET    | `/iot/status`  | Simulator status        |
| GET    | `/iot/sensors` | Latest sensor readings  |
| GET    | `/iot/crowd`   | Current crowd levels    |
| POST   | `/iot/start`   | Start simulator (admin) |
| POST   | `/iot/stop`    | Stop simulator (admin)  |
| POST   | `/iot/tick`    | Force one tick (admin)  |

WebSocket: same-origin `/ws` (F-002). Messages `{ type, payload, at, siteId }`. Types `crowd`, `sensors`, `hazard` are site-tagged; clients ignore other sites. `iot_status` / `ping` may be global.

## Safety & notifications

| Method | Path                      | Description              |
| ------ | ------------------------- | ------------------------ |
| GET    | `/safety/zones`           | Danger zones             |
| GET    | `/safety/exits`           | Emergency exits          |
| GET    | `/safety/contacts`        | Security / medical / SOS |
| POST   | `/safety/sos`             | Trigger SOS              |
| GET    | `/notifications`          | Alerts                   |
| POST   | `/notifications/:id/read` | Mark read (auth)         |

## Admin (role: admin)

CRUD under `/admin` for buildings, path nodes/edges, danger zones, crowd levels, events, and `GET/PUT /admin/weights`.

## Analytics (role: admin)

| Method | Path                        |
| ------ | --------------------------- |
| GET    | `/analytics/summary`        |
| GET    | `/analytics/searches`       |
| GET    | `/analytics/popular-routes` |

## Errors

```json
{ "code": "NO_ROUTE", "message": "...", "details": {} }
```
