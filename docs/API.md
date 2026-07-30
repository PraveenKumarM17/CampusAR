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
  "accessibility": {
    "wheelchairMode": false,
    "preferLift": false,
    "preferRamp": false,
    "avoidStairs": false
  }
}
```

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
