# Database

PostgreSQL 16 with PostGIS.

## Apply schema

```bash
npm run db:migrate -w @campusar/api
npm run db:seed -w @campusar/api
```

SQL sources:

- [`apps/api/src/infrastructure/db/schema.sql`](../apps/api/src/infrastructure/db/schema.sql)
- [`apps/api/src/infrastructure/db/seed.sql`](../apps/api/src/infrastructure/db/seed.sql)

Docker Compose mounts both into `docker-entrypoint-initdb.d` for first boot. Password hashes are finalized by `seed.ts` when using npm scripts.

## Core tables

| Table                                          | Purpose              |
| ---------------------------------------------- | -------------------- |
| `users`                                        | Auth + roles         |
| `buildings` / `floors` / `rooms`               | Campus hierarchy     |
| `nodes` / `edges`                              | Navigation graph     |
| `danger_zones`                                 | Safety overlays      |
| `crowd_levels`                                 | Simulated crowd      |
| `events`                                       | Campus events        |
| `route_weights`                                | Singleton A* weights |
| `notifications` / `notification_reads`         | Alerts               |
| `emergency_contacts` / `emergency_exits`       | Safety               |
| `analytics_searches` / `analytics_navigations` | Metrics              |
| `sos_events`                                   | SOS log              |

Geography columns use `GEOGRAPHY(POINT, 4326)` for spatial indexing.
