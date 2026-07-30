# 1. Product Vision — CampusAR

## Vision statement

CampusAR will be the default **Navigation-as-a-Service** layer for private places—universities, corporate campuses, hospitals, parks, malls, and similar sites: a trusted, real-time wayfinding product that gets people to the right building, floor, and room—safely and without friction—while giving each organization an isolated workspace to manage maps, branding, and operations.

The same application serves every organization. No organization sees another’s data.

## Mission

Help every visitor and member of an organization reach their destination with confidence—**without requiring an account**—by combining map navigation, AI-assisted routing, optional Web AR guidance, safety context, and (over time) IoT and Digital Twin intelligence. Organizations administer their own branded workspace via **administrator login**; the same application serves every tenant.

## Problem statement

Large private sites combine outdoor open spaces with dense multi-story buildings. Existing tools fail in complementary ways:

| Approach | Limitation |
|----------|------------|
| **GPS / consumer maps** | Degrades indoors and near concrete; room-level guidance is impractical; no org ownership |
| **Static PDF / printed maps** | No crowds, closures, events, or safety conditions |
| **Siloed AR prototypes** | Often outdoor-only or localization-only; lack operational routing |
| **Single-campus custom apps** | Do not scale; every new site needs engineering |
| **Admin dashboards alone** | Do not help end users walk the path |

The result: visitors get lost; peak corridors clog; emergencies lack adaptive egress guidance; operators lack a live picture of movement and hazards; vendors cannot productize one codebase across customers.

## Platform vision (NaaS)

| Capability | Intent |
|------------|--------|
| **Organization workspaces** | Unlimited tenants; hard isolation |
| **Self-serve map editor** | Click-to-build nodes and paths |
| **QR + slug entry** | Guests land on the right org instantly |
| **Brandable shell** | Logo, theme, splash per org |
| **Positioning-agnostic routing** | GPS today; BLE / Wi‑Fi / SLAM / UWB later |
| **Industry templates** | University, corporate, hospital, mall, generic—data, not forks |

See [`multi-tenancy.md`](./multi-tenancy.md).

## Objectives

### Reference product (V1 — first tenant)
1. Enable authenticated and guest users to **search** places and **navigate** outdoor + near-building routes with turn-by-turn guidance.
2. Deliver **safety-aware** and **accessibility-aware** routing preferences.
3. Provide a usable **Web AR** guidance mode for mobile browsers.
4. Give administrators tools to manage graph data, hazards, simulated crowd inputs, and basic analytics.
5. Establish a **modular platform** ready for tenancy, BLE/IoT, predictive models, and native AR without rewriting the core.

### Platform (NaaS — strategic)
6. Make **Organization** the root entity; scope all domain data by tenant.
7. Let org admins **visually edit** navigation graphs without developers.
8. Support **public org URLs and QR codes** for frictionless guest navigation.
9. Apply **per-organization branding** dynamically.
10. Onboard diverse site types via **templates**, one application binary.

## Success metrics (vision-level)

| Metric | Target (directional) |
|--------|----------------------|
| Median time-to-destination for first-time visitors vs static map | ≥ 15% reduction in guided sessions |
| Route computation latency (p95) | < 200 ms for site-scale graphs |
| AR session completion (start → usable first instruction) | ≥ 60% of started AR sessions |
| SUS (guided navigation task) | ≥ 75 |
| Admin hazard publish → live route effect | < 5 minutes |
| Time for org admin to create first navigable OD pair (editor) | < 30 minutes |
| Cross-tenant data access incidents | **Zero** |
| Guest sessions started via QR | Primary acquisition signal per org |
| System uptime (staging/prod) | ≥ 99.5% monthly |

Detailed KPIs: [success-metrics.md](./success-metrics.md).

## Value proposition

**For visitors:** “Scan the QR at reception—open the map, allow location, and walk there. No account.”

**For organization operators:** “Own your wayfinding: brand it, edit the map visually, watch analytics, manage safety—without filing an engineering ticket.”

**For CampusAR (platform):** “One product that sells to any private site; isolation and self-serve keep delivery costs low.”

**Differentiation:** Org-scoped graph + safety/accessibility + AR + operator tools + self-serve editor + QR entry—not a generic city map overlay, not a one-off campus build.

## Target audience

| Segment | Priority | Need |
|---------|----------|------|
| Site visitors (guests, patients, attendees, candidates) | Primary | First-visit orientation via QR |
| Students / employees / regulars | Primary | Daily facility navigation |
| Org admins / facilities | Primary (B2B buyer) | Graph stewardship, branding, analytics |
| Security / safety officers | Secondary | SOS awareness, hazard publication |
| Platform operators (CampusAR) | Internal | Tenant lifecycle, support, billing |

Vertical examples: universities, corporate campuses, hospitals, airports (landside), malls, industrial/tech parks, exhibition centers, government buildings.

## Positioning

CampusAR sits between **consumer maps** (too coarse, no tenant ownership) and **heavy enterprise IPS** (often overkill to start). The product ships **software-first** outdoor/near-building navigation with simulated IoT hooks; hardware localization and deep indoor are roadmap capabilities per organization readiness.

V1 may still run as a **single reference campus**; the strategic architecture and roadmap treat that campus as **tenant zero** of the NaaS platform.

## Assumptions (documented)

1. Early production may run **one active organization**; schema and APIs are designed for many.
2. Primary client is a **web application** (responsive); native apps are later.
3. Indoor room-level accuracy without BLE is **approximate**; marketing must not claim centimeter IPS prematurely.
4. Crowd and sensor feeds may be **simulated** until IoT is installed per org.
5. Visitor **guest mode** is default on public org URLs; accounts are for staff/admins (and optional saved trips later).
6. Discovery is primarily **QR / shared slug**, not a global public org marketplace (marketplace optional later).
