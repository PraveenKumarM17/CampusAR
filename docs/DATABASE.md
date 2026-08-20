# Database

PostgreSQL 16 with PostGIS.

## Apply schema

```bash
npm run db:migrate -w @campusar/api
npm run db:seed -w @campusar/api
```

SQL sources:

- [`apps/api/src/infrastructure/db/schema.sql`](../apps/api/src/infrastructure/db/schema.sql)
- [`apps/api/src/infrastructure/db/tenancy.sql`](../apps/api/src/infrastructure/db/tenancy.sql) — existing DBs: create org/site tables and backfill `site_id`
- [`apps/api/src/infrastructure/db/seed.sql`](../apps/api/src/infrastructure/db/seed.sql)

Docker Compose mounts schema + seed into `docker-entrypoint-initdb.d` for first boot. Password hashes are finalized by `seed.ts` when using npm scripts.

## Core tables

| Table                                          | Purpose                      |
| ---------------------------------------------- | ---------------------------- |
| `organizations` / `sites`                      | Customer and physical location |
| `organization_memberships`                     | Org/site scoped access       |
| `users`                                        | Auth + roles                 |
| `buildings` / `floors` / `rooms`               | Site hierarchy               |
| `nodes` / `edges`                              | Navigation graph (site-scoped) |
| `danger_zones`                                 | Safety overlays (incl. fire) |
| `crowd_levels`                                 | Live / simulated crowd       |
| `sensor_readings`                              | Temp / humidity / AQI / occ. |
| `events`                                       | Campus events                |
| `route_weights`                                | Singleton A* weights         |
| `notifications` / `notification_reads`         | Alerts                       |
| `emergency_contacts` / `emergency_exits`       | Safety                       |
| `analytics_searches` / `analytics_navigations` | Metrics                      |
| `sos_events`                                   | SOS log                      |

Geography columns use `GEOGRAPHY(POINT, 4326)` for spatial indexing.
