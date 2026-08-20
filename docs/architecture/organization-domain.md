# Organization Domain Model

**Purpose:** Canonical domain entities and relationships for CampusAR multi-tenant NaaS.  
**Style:** Conceptual (no SQL DDL). Aligns with Clean Architecture domain layer.

---

## 1. Hierarchy

```text
Organization
 ├── OrganizationBranding
 ├── OrganizationSettings
 ├── OrganizationMembership[]  → User
 └── Site[]                    (physical campus / hospital / HQ)
      ├── Building[]
      │    └── Floor[]
      ├── NavigationNode[]
      ├── NavigationEdge[]
      ├── SafetyZone / Hazard[]
      ├── Exit[] / EmergencyContact[]
      └── (optional) Sensor / CrowdObservation[]
```

**Invariant:** Spatial data belongs to a **Site**. A Site belongs to exactly one Organization. Cross-org and cross-site foreign keys are forbidden.

See [`site-tenancy.md`](./site-tenancy.md) for Phase 2.5A (active site, APIs, RNSIT as seed).

---

## 2. Core entities

### 2.1 Organization

| Attribute | Intent |
|-----------|--------|
| `id` | Stable internal UUID |
| `slug` | Public URL key (`rnsit`, `infosys`) — unique, immutable preferred |
| `displayName` | Human name |
| `legalName` | Optional billing/legal |
| `status` | `draft` \| `active` \| `suspended` \| `archived` |
| `timezone` | Local time for analytics/schedules |
| `defaultMapCenter` / `defaultZoom` | Map bootstrap |
| `boundingBox` | Optional geofence for GPS sanity |
| `planTier` | Entitlements hook |
| `createdAt` / `updatedAt` | Audit |

**Aggregate root** for tenant configuration. Graph content may be a separate aggregate for write contention (editor).

### 2.2 OrganizationBranding

| Attribute | Intent |
|-----------|--------|
| Logo URL(s) | Light/dark variants |
| Accent / primary / secondary tokens | CSS variable sources |
| Splash image / welcome message | Guest entry |
| Favicon | Browser chrome |
| Custom CSS (restricted) | Advanced; optional later |

See [`branding-system.md`](./branding-system.md).

### 2.3 OrganizationSettings

| Attribute | Intent |
|-----------|--------|
| Guest mode enabled | Default true |
| Require GPS | Soft/hard |
| Allowed map styles | Satellite / hybrid / streets |
| Positioning providers enabled | GPS, future BLE… |
| AR enabled | Entitlement |
| SOS policy | Contacts, auto-notify |
| Editor: draft vs publish | Feature flag |

### 2.4 User & Membership

| Entity | Notes |
|--------|-------|
| **User** | Global identity for **admins** (email, password hash, optional platform role). Visitors navigating as guests typically have no User row. |
| **OrganizationMembership** | `(userId, organizationId, role, status)` — e.g. `org_admin` |

A user may belong to multiple orgs (consultant, multi-campus operator). Admin console selects **active org**.

### 2.5 Building & Floor

| Entity | Attributes (conceptual) |
|--------|-------------------------|
| **Building** | Name, footprint polygon optional, outdoor-only flag |
| **Floor** | Building ref, level index, label (`G`, `1`), floorplan asset (future) |

Outdoor campus graphs may use a synthetic building “Campus Grounds” / floor `0`.

### 2.6 Category

Org-defined taxonomy: `Library`, `Lab`, `Parking`, `Clinic`, `Gate`, `Washroom`, `Elevator`, `Exit`, etc.  
Platform ships **industry templates** that seed categories on org creation.

### 2.7 NavigationNode (Place)

Represents a **real-world location**, not a technical waypoint-only ID in the product UX.

| Attribute | Required | Notes |
|-----------|----------|-------|
| Name | Yes | “Library”, “Room 204” |
| Category | Yes | FK to Category |
| Coordinates (lat/lng) | Yes | Outdoor; indoor local coords later |
| Building / Floor | Optional | Strongly recommended for indoor |
| Description | Optional | Visitor-facing |
| Icon | Optional | Override category icon |
| Accessibility | Optional | Wheelchair, etc. |
| Visibility | Yes | `public` \| `staff` \| `hidden` |
| Search keywords | Optional | Synonyms |
| External ref | Optional | Room code / asset ID |
| Status | Yes | `active` \| `archived` |

**Graph role:** nodes participate in routing; hidden nodes may still be pathing waypoints if marked `routable`.

### 2.8 NavigationEdge

| Attribute | Notes |
|-----------|-------|
| From / To nodes | Same org; undirected or bidirectional flag |
| Distance / base cost | Meters or derived |
| Accessibility weight | Stairs vs ramp |
| Bidirectional | Default true |
| Status | Active / closed |

Editor creates edges by selecting two nodes (“Create Path”).

### 2.9 Safety entities

- **Hazard** — temporary or permanent; affects routing weights.  
- **Exit** — emergency egress nodes or annotations.  
- **SafetyZone** — geofenced alert regions (optional).  
- **EmergencyContact** — org SOS targets.

### 2.10 QR

- **QrCode** — encodes deep link to org (and optional destination).  
- **QrCampaign** — named print batch, analytics on scans.

See [`qr-navigation.md`](./qr-navigation.md).

---

## 3. Relationships (ER conceptual)

```mermaid
erDiagram
  ORGANIZATION ||--o{ MEMBERSHIP : has
  USER ||--o{ MEMBERSHIP : holds
  ORGANIZATION ||--|| BRANDING : has
  ORGANIZATION ||--o{ BUILDING : owns
  BUILDING ||--o{ FLOOR : contains
  ORGANIZATION ||--o{ CATEGORY : defines
  ORGANIZATION ||--o{ NODE : owns
  NODE }o--o| BUILDING : located_in
  NODE }o--o| FLOOR : on
  NODE }o--|| CATEGORY : typed_as
  ORGANIZATION ||--o{ EDGE : owns
  EDGE }o--|| NODE : from
  EDGE }o--|| NODE : to
  ORGANIZATION ||--o{ HAZARD : owns
  ORGANIZATION ||--o{ QR : issues
```

---

## 4. Domain services (conceptual)

| Service | Responsibility |
|---------|----------------|
| `OrganizationResolver` | Slug / QR → org; suspend check |
| `GraphQueryService` | Load org subgraph for map/routing |
| `GraphEditService` | Node/edge CRUD with invariants |
| `RoutingService` | Existing A* / costs; org-scoped snapshot |
| `BrandResolver` | Tokens for shell |
| `MembershipService` | Invite, role change, revoke |
| `QrService` | Issue codes, resolve scans |

---

## 5. Invariants

1. Edge endpoints must share the same `organizationId`.  
2. Node building/floor, if set, must belong to same org.  
3. Slug immutable after first publish (**Assumption:** rename requires platform support).  
4. Archived nodes cannot be destination targets; may remain in path until republish.  
5. Deleting a category remaps nodes to “Uncategorized” or blocks delete if in use.  
6. Guest cannot read `visibility=staff|hidden` nodes in search (routing may still use hidden waypoints).

---

## 6. Industry templates (not forks)

On org create, apply a **template**:

| Template | Seed categories (examples) |
|----------|----------------------------|
| University | Gate, Block, Lab, Library, Hostel, Sports |
| Corporate | Lobby, Meeting, Cafeteria, Parking, Gate |
| Hospital | Reception, Ward, Clinic, Pharmacy, Parking |
| Mall | Entrance, Store, Food Court, Parking, Restroom |
| Generic | Place, Entrance, Parking, Facility |

Templates never branch the codebase; they are data.

---

## 7. Alignment with Clean Architecture

- Entities/value objects live in **domain**.  
- Use cases orchestrate membership + graph edit + routing.  
- Infrastructure: Postgres repos always require `organizationId`.  
- Interfaces: HTTP/WS map DTOs ↔ domain; never leak other tenants.

---

## 8. Related

- [`multi-tenant-architecture.md`](./multi-tenant-architecture.md)  
- [`map-editor.md`](./map-editor.md)  
- Existing [`database-design.md`](./database-design.md) (update when implementing)  
