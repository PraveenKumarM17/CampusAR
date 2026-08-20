# Site Tenancy — CampusAR Phase 2.5A

CampusAR is a reusable spatial navigation platform. An organization such as a university, hospital, corporate campus, factory, or government institution configures its own sites. The same canonical map data powers Leaflet, outdoor routing, indoor handoff, AR, and the Cesium Digital Twin.

RNSIT is the **first seeded organization and site**, not the product itself.

This phase prepares the data architecture and APIs for a future Map Builder. It does **not** include drawing UIs, draft/publish workflows, billing, or a complex RBAC framework.

---

## 1. Domain

```text
Organization
 ├── Memberships (org_admin | site_admin | member)
 └── Sites
      ├── Buildings → floors / rooms / indoor maps
      ├── Outdoor nodes and edges
      ├── POIs (named nodes)
      ├── Areas (future parking / open / restricted geometry)
      ├── Hazards, emergency contacts, exits
      └── Live crowd / sensors (scoped by site)
```

| Entity | Role |
|--------|------|
| **Organization** | Customer account (RNSIT, a hospital, a corporate campus). |
| **Site** | One physical location. An organization may have several (main campus, north campus, HQ). |
| **Membership** | Scopes users to an organization, optionally to one site. |

Existing `users.role` remains `admin | user | guest`:

| Actor | How it maps |
|-------|-------------|
| Platform admin | `users.role = admin` — can manage any site |
| Organization admin | membership `org_admin` — map writes for that organization only |
| Site admin / map editor | membership `site_admin` — assigned site |
| Regular user | membership `member` or `users.role = user` — navigation |
| Guest | public reads of the default/active site |

A hospital administrator must not modify another hospital’s map.

---

## 2. Canonical map data

```text
                    Canonical Site Map Data
                             │
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
       Leaflet           Navigation          Cesium
       2D Map             Routing         Digital Twin
                                                   │
                                                   ▼
                                                  AR
```

Do not maintain separate Cesium or Leaflet datasets. Admin-authored site data (Phase 2.5B Map Builder) will be the source of truth.

---

## 3. Active site context

1. User signs in (or continues as guest).
2. `GET /api/sites` returns accessible sites (platform admin: all; membership: own org; guest: default active site).
3. Frontend stores `activeSiteId` (auto-select when only one site exists).
4. Subsequent API calls send `X-Site-Id`. Query `siteId` and body `siteId` are also accepted.
5. Map, Navigate, AR, Digital Twin, and Safety load that site’s data.
6. If the header is omitted, the API falls back to the oldest **active** site — not a hardcoded RNSIT slug at runtime.

Public map reads by site UUID are allowed so visitors can navigate. Writes require platform admin or org/site membership (`assertCanEditSite`). Existing admin HTTP routes still also require `users.role = admin`.

---

## 4. Navigation isolation

Routing loads only the requested site’s graph. Source, destination, nodes, and edges must belong to that site. Cross-site routes and edges are rejected (`CROSS_SITE_ROUTE`, `CROSS_SITE_EDGE`). Indoor routing stays building-scoped; buildings already belong to a site.

---

## 5. Live events

One WebSocket (`/ws`, F-002). Crowd, hazard, and sensor broadcasts carry `siteId`. The client ignores events for any other site. `iot_status` may remain global.

---

## 6. Empty sites

A new site may have no buildings, nodes, or edges. Clients must not crash. They show: **No map data has been published for this site yet.** The Map Builder will populate data later.

---

## 7. RNSIT seed

| Record | Stable id | Notes |
|--------|-----------|--------|
| Organization | slug `rnsit` | Demonstration university |
| Site | slug `rnsit-main` | Center and timezone from site metadata |
| Spatial rows | existing UUIDs | Backfilled with `site_id`; building UUIDs unchanged |

The platform must function for an empty site without this seed.

---

## 8. Out of scope (Phase 2.5B+)

Interactive polygon/graph/floor editors, GLB upload UI, draft/publish, billing, per-industry Cesium scenes, URL rewrite `/{orgSlug}/…`.
