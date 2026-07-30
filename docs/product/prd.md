# 2. Product Requirements Document (PRD) — CampusAR V1

## Executive summary

CampusAR V1 is a web-based smart-campus navigation product. Users search campus destinations, receive AI-assisted multi-criteria routes, follow map and Web AR guidance, and optionally use safety features (hazards, SOS). Administrators manage campus graph data, routing weights, hazards, crowd inputs, and view analytics. A Digital Twin view provides live operational visualization. Physical IoT and native ARCore are designed as extension points, not V1 hard dependencies.

## Product scope

### In scope (V1)

- Account types: **guest (primary navigation)**; **organization admin** (email/password for Admin Dashboard). General visitor registration is not required.
- Campus place search (buildings, rooms, categories)
- Graph-based routing with distance, crowd, safety, accessibility preferences
- Map visualization with route polyline and live crowd coloring (when data available)
- Navigate mode with turn list, voice optional, periodic recalculation
- Web AR mode with camera overlay, compass-aligned cues, avatar guide doll, arrival confirmation
- Safety: danger zones, emergency exits/contacts listing, SOS event creation
- Admin: route weights, buildings/paths, danger zones, crowd levels, events, IoT simulator controls
- Digital Twin 3D overview with live overlays
- Analytics summary for admins
- API documentation (OpenAPI), health checks, containerized deployment

### Out of scope (V1)

- Multi-campus tenancy and white-label branding portals
- Paid subscriptions / marketplace
- Full BLE trilateration / UWB / IMU fusion production localization
- Production MQTT mesh and hardware device management
- Trained LSTM models in production MLOps
- Full Unity/ARCore store release
- Real emergency dispatch integration (police CAD, SMS gateways as SLA products)
- Offline-first full campus download packs

## Functional requirements

### FR-1 Identity & access

| ID | Requirement |
|----|-------------|
| FR-1.1 | Users can **Continue as Guest** on an organization URL/QR without creating an account (primary path) |
| FR-1.2 | Organization administrators can log in with email/password and receive a session (JWT or equivalent) |
| FR-1.3 | Admin tokens can refresh; logout and membership revocation invalidate access |
| FR-1.4 | Admin Dashboard screens and APIs require Organization Admin (or future Super Admin); guests are denied |
| FR-1.5 | Guest access is limited to navigation-related features for the resolved organization |

**Why:** Majority of users are visitors; credentials are reserved for people who configure the org. See [login-experience.md](./login-experience.md), [role-permissions.md](./role-permissions.md).

**NaaS note:** General visitor registration is not required for V1/NaaS guest navigation. Optional “save trips” accounts may appear later without changing admin login.

### FR-2 Campus discovery

| ID | Requirement |
|----|-------------|
| FR-2.1 | List buildings and rooms |
| FR-2.2 | Search by name/code/category |
| FR-2.3 | Filter by room category |
| FR-2.4 | Select source and destination nodes for routing |

**Why:** Discovery is the top of the navigation funnel.

### FR-3 Routing

| ID | Requirement |
|----|-------------|
| FR-3.1 | Compute route between two graph nodes |
| FR-3.2 | Apply accessibility preferences (wheelchair, avoid stairs, prefer lift/ramp) |
| FR-3.3 | Factor crowd, safety, and blocked edges into path choice |
| FR-3.4 | Optionally apply predictive crowd penalties |
| FR-3.5 | Recalculate routes on demand and on a timer during active navigation |
| FR-3.6 | Return turn-by-turn instructions, distance, ETA |

**Why:** Core product value vs static maps.

### FR-4 Guidance UX

| ID | Requirement |
|----|-------------|
| FR-4.1 | Map mode shows route and progress context |
| FR-4.2 | Navigate mode shows instruction list and map |
| FR-4.3 | AR mode uses device camera when permitted |
| FR-4.4 | AR shows directional cue aligned to bearing/compass when available |
| FR-4.5 | User can choose male/female guide avatar; avatar reflects walk/turn/arrival |
| FR-4.6 | Explicit success state on destination reached |
| FR-4.7 | Optional text-to-speech for instructions |

**Why:** Multiple modalities for different contexts (desk vs walking outdoors).

### FR-5 Safety

| ID | Requirement |
|----|-------------|
| FR-5.1 | Display active danger zones |
| FR-5.2 | List emergency exits and contacts |
| FR-5.3 | SOS creates a logged event and user-visible confirmation |
| FR-5.4 | Hazards/events that affect routing update path selection |

**Why:** Campus duty of care and differentiation.

### FR-6 Operations

| ID | Requirement |
|----|-------------|
| FR-6.1 | Admin CRUD for key campus entities and weights |
| FR-6.2 | Admin can start/stop IoT simulation |
| FR-6.3 | Digital Twin reflects live crowd/hazard state |
| FR-6.4 | Analytics summarize searches and navigations |

**Why:** Product must be operable without engineering for day-to-day campus changes.

### FR-7 Platform

| ID | Requirement |
|----|-------------|
| FR-7.1 | REST API with validation and error codes |
| FR-7.2 | Real-time channel for crowd/sensor/hazard updates |
| FR-7.3 | Health endpoint and deployable containers |
| FR-7.4 | Shared typed contracts between clients and API |

## Non-functional requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-1 | Performance | Route p95 < 200 ms for ≤ ~1k edges |
| NFR-2 | Latency | AR first meaningful paint of guidance < 3 s after route ready (device-dependent) |
| NFR-3 | Availability | 99.5% for production API |
| NFR-4 | Security | Passwords hashed; JWT secrets configurable; role checks on admin routes |
| NFR-5 | Privacy | Minimize PII; SOS location stored for ops; retention policy TBD with campus |
| NFR-6 | Accessibility | Keyboard-usable web flows; respect accessibility routing prefs |
| NFR-7 | Scalability | Stateless API instances behind load balancer-ready design |
| NFR-8 | Observability | Structured logs; health checks; basic request logging |
| NFR-9 | Usability | SUS ≥ 75 on primary navigation task |
| NFR-10 | Maintainability | Clean module boundaries; documented extension points for IoT/ML/AR |

## Constraints

1. V1 ships as **web-first**; camera/orientation APIs vary by browser and require HTTPS in production.
2. Without indoor positioning hardware, **indoor accuracy is limited**.
3. Campus must supply or accept a **seeded graph** (nodes/edges); survey-grade GIS may lag.
4. Real emergency response SLAs require campus partnerships outside software alone.
5. Engineering capacity assumes a small team; MoSCoW must be respected.

## Assumptions

| ID | Assumption |
|----|------------|
| A-1 | Single campus graph in V1 |
| A-2 | English UI first; multilingual later |
| A-3 | Walking is the primary mode; no transit/bike multimodal in V1 |
| A-4 | Crowd data may be simulated |
| A-5 | Users have modern smartphones for AR; desktop still usable for map/admin |
| A-6 | Campus admins can be trained in < 1 hour to publish a hazard |

## Risks (summary)

See [risks.md](./risks.md). Top risks: indoor positioning expectations; browser AR permissions; graph data quality; over-scoping IoT/ML.

## Future scope (post-V1)

**Platform (NaaS):** Organization tenancy, visual map editor, QR entry, per-org branding, industry templates — see [multi-tenancy.md](./multi-tenancy.md) and [roadmap.md](./roadmap.md) (V1.5–V2).

**Depth:** BLE/MQTT IoT, LSTM prediction, native AR, voice assistant, smart parking, federated learning, LiDAR twin bootstrapping. See [future-opportunities.md](./future-opportunities.md).

V1 PRD assumptions (e.g. A-1 single campus graph) remain valid for the **reference tenant**; schema and roadmap prepare multi-org.

## Acceptance of V1 (product)

V1 is accepted when:

1. Guest → search → route → navigate → AR → arrival success works on a seeded campus.
2. Admin can change weights/hazards and see routing impact.
3. Twin and map show live crowd updates when simulator runs.
4. Automated tests and CI gate critical routing/auth paths.
5. Documentation pack (this folder) matches shipped behaviour at a product level.
