# 9. API Architecture — CampusAR

**This document defines REST conventions only.** It does not enumerate or implement concrete endpoint handlers. OpenAPI may mirror these rules at build time.

---

## REST principles

- Resources are nouns (`/places`, `/routes`, `/hazards`); actions via HTTP methods or clearly named sub-resources (`/routes/calculate`).
- Stateless requests: auth via bearer token (and refresh flow), not server sticky session for REST.
- JSON request/response bodies (`Content-Type: application/json`).
- Idempotency: GET/HEAD safe; PUT/PATCH idempotent where used; POST for calculate/SOS may create new results/events.
- Server is authoritative for routes, hazards, and crowd state.

---

## Versioning

| Strategy | Choice |
|----------|--------|
| URI versioning | `/api/v1/...` as public prefix |
| Breaking changes | New `/api/v2`; deprecate v1 with header `Deprecation` |
| Additive fields | Allowed in minor evolutions; clients ignore unknown fields |

**Assumption:** V1 ships as `/api` or `/api/v1` consistently; pick one in implementation and document in OpenAPI.

WebSocket may share origin with `/ws` and carry `protocolVersion` in the hello message.

---

## Authentication

| Client type | Mechanism |
|-------------|-----------|
| Registered user | `Authorization: Bearer <access_token>` |
| Admin | Same + role claim enforced server-side |
| Guest | Public GETs + route calculate allowed; mutations limited |
| Refresh | Dedicated refresh endpoint or cookie-based refresh |

WS: token on connect (query `token` or `Sec-WebSocket-Protocol` / first message auth — prefer header where possible; browsers may need query/first-message). Reject unauthenticated admin channels.

Detail: [`security-architecture.md`](./security-architecture.md).

---

## Rate limiting

| Class | Guidance |
|-------|----------|
| Auth login/register | Strict per IP + per account |
| Route calculate / recalculate | Per user/IP budget (nav loops) |
| SOS | Per user coalescing window |
| Admin writes | Moderate |
| Global | Proxy-level limits |

Return `429` with `Retry-After` when possible.

---

## Validation

- All inputs validated at boundary (schema).
- Geospatial payloads checked for type and campus bounds where relevant.
- Unknown fields: strip or reject (pick one; **Assumption: strip with warning in logs for forwards-compat**).

---

## Standard error format

```json
{
  "error": {
    "code": "NO_ROUTE",
    "message": "Human readable explanation",
    "details": {},
    "requestId": "uuid"
  }
}
```

| HTTP | Typical codes |
|------|----------------|
| 400 | `VALIDATION_ERROR` |
| 401 | `UNAUTHORIZED` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT` |
| 422 | `NO_ROUTE`, domain unprocessable |
| 429 | `RATE_LIMITED` |
| 500 | `INTERNAL` |
| 503 | `SERVICE_UNAVAILABLE` |

Clients branch on `code`, not substring of `message`.

---

## Pagination

For list resources (places, hazards, analytics events, SOS):

| Param | Meaning |
|-------|---------|
| `cursor` or `page` | Prefer cursor for large/analytics; page OK for admin small lists |
| `limit` | Default 20–50; max capped |

Response:

```json
{
  "data": [],
  "meta": { "nextCursor": "...", "limit": 50 }
}
```

---

## Filtering

Query params: `category`, `q` (search), `active=true`, `bbox`, `floor`, `type`.  
Multiple filters are AND unless documented.

---

## Sorting

`sort=name`, `sort=-updatedAt` (prefix `-` for descending).  
Whitelist allowed sort fields per resource.

---

## Response standards

### Success envelope (recommended)

```json
{
  "data": {},
  "meta": {}
}
```

Lists always return arrays in `data`.  
Route responses include explainability flags in `data` or `meta` (`predictionUsed`, `avoidedHazards`, etc.) per product AI routing.

### Headers

- `X-Request-Id` echo
- Cache-Control: `no-store` for auth and live data; short cache for static place catalogs if desired

---

## Resource groups (logical — not an implementation)

| Group | Examples of concerns |
|-------|----------------------|
| Auth | register, login, refresh, logout |
| Campus | places search, buildings, graph read models |
| Navigation | calculate, recalculate |
| Safety | hazards read, SOS create, contacts/exits |
| Admin | CRUD graph/hazards/weights/crowd/events, IoT control |
| IoT / Live | status, latest crowd/sensors snapshots |
| Analytics | summary aggregates |
| Health | live/ready |

Exact paths belong in OpenAPI at implementation time.

---

## Compatibility with future clients

- Unity / native apps use the same `/api/v1` + JWT.
- ML services are **not** public REST consumers of navigate; they implement internal predictor ports or private admin ingest.
- MQTT devices do not call public REST; they use bridge credentials on a private network.
