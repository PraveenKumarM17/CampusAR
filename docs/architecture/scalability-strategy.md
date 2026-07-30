# 17. Scalability Strategy — CampusAR

Scale guidance from pilot to campus-wide without rewriting domain boundaries.

---

## Load profiles (order-of-magnitude)

| Concurrent users | Character | Primary bottlenecks |
|------------------|-----------|---------------------|
| **10** | Dev/demo | None; single Node + Postgres fine |
| **100** | Small pilot | Route calc CPU; WS fan-out OK in-process |
| **1000** | Busy campus hour | DB connections; WS broadcast; graph load |
| **10000** | Multi-building peak / multi-campus path | Horizontal API; shared pub/sub; cache; possibly read replicas |

“Users” ≈ concurrent clients with open app; navigators ⊂ users.

---

## Strategy by tier

### 10 users
- Single API instance, Compose or one VM
- In-memory graph cache optional
- IoT simulator on

### 100 users
- Still one API possible
- Connection pool sized
- Proxy rate limits
- Ensure route p95 within budget with fixture load test

### 1000 users
- **2+ API replicas** behind proxy
- **Redis pub/sub** for WS fan-out
- Graph snapshot cache per process; invalidate via pub/sub on admin mutation
- Postgres pool + indexes verified
- Consider separating static web to CDN

### 10000 users
- Autoscale API on CPU/RPS/WS count
- Read replica for analytics/search
- Optional extract **Realtime** or **Routing** service
- Coalesce crowd broadcasts; binary protocols if needed
- CDN edge for SPA; geographic multi-AZ DB
- Multi-campus: shard by `campus_id` topics and data

---

## Caching

| Cache | Content | Invalidation |
|-------|---------|--------------|
| Process graph snapshot | Nodes/edges/weights | Admin mutation event |
| Places search | Short TTL | Write-through on place CRUD |
| HTTP CDN | SPA assets | Content hash |
| Redis (later) | Session revoke list, pub/sub, optional twin snapshot | TTL / explicit |

Do not cache route results long — crowd/hazards change.

---

## Horizontal scaling (API)

- Stateless request handlers
- Sticky sessions **or** shared WS bus (prefer shared bus)
- No in-memory-only authoritative state without replication

---

## Database scaling

| Technique | When |
|-----------|------|
| Indexes / query tune | First |
| Connection pooling (PgBouncer) | 1000+ |
| Read replicas | Analytics/search heavy |
| Partition analytics_events | High write volume |
| Vertical bump | Short-term |
| Shard by campus | Multi-campus V5 |

Graph size for one campus rarely needs sharding if cached in API.

---

## WebSocket scaling

See [`websocket-architecture.md`](./websocket-architecture.md).

Rules of thumb:

- Cap connections per instance; autoscale
- Prefer tick-coalesced crowd messages over per-edge storms
- Snapshot on reconnect to avoid huge diff backlogs

---

## Routing CPU

- A* on campus graphs is typically small vs IO
- Preload snapshot; avoid per-request full DB graph join when possible
- If ML inference added, **never** block event loop — sidecar

---

## Capacity testing

Before each scale milestone:

1. k6/Artillery: search + route + recalculate mix
2. WS: N subscribers + tick broadcasts
3. Admin mutation storm + cache invalidation
4. Watch p95 route latency and error rate (product KPIs)

---

## Cost-conscious path

Prefer: **modular monolith + cache + Redis + replicas** before microservices. Split along bounded contexts only when team or scaling pain demands.
