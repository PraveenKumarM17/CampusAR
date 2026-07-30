# 1. Product Vision — CampusAR

## Vision statement

CampusAR will be the default wayfinding layer for university campuses: a trusted, real-time navigation product that gets people to the right building, floor, and room—safely, accessibly, and without friction—while giving campus operators live operational awareness.

## Mission

Help every person on campus reach their destination with confidence by combining map navigation, AI-assisted routing, Web AR guidance, safety context, and (over time) IoT and Digital Twin intelligence into one coherent product experience.

## Problem statement

University campuses combine outdoor open spaces with dense multi-story buildings. Existing tools fail in complementary ways:

| Approach | Limitation |
|----------|------------|
| **GPS / consumer maps** | Degrades indoors and near concrete; room-level guidance is impractical |
| **Static PDF / printed maps** | No crowds, closures, events, or safety conditions |
| **Siloed AR prototypes** | Often outdoor-only or localization-only; lack operational routing |
| **Admin dashboards alone** | Do not help end users walk the path |

The result: first-year students and visitors get lost; peak-hour corridors clog; emergencies lack adaptive egress guidance; operators lack a live picture of movement and hazards.

## Objectives (V1)

1. Enable authenticated and guest users to **search** campus places and **navigate** outdoor + near-building routes with turn-by-turn guidance.
2. Deliver **safety-aware** and **accessibility-aware** routing preferences.
3. Provide a usable **Web AR** guidance mode for mobile browsers.
4. Give administrators tools to manage campus graph data, hazards, simulated crowd inputs, and view basic analytics.
5. Establish a **modular platform** ready for BLE/IoT, predictive models, and native AR without rewriting the core product.

## Success metrics (vision-level)

| Metric | V1 target (directional) |
|--------|-------------------------|
| Median time-to-destination for first-time visitors vs static map | ≥ 15% reduction in guided sessions |
| Route computation latency (p95) | < 200 ms for campus-scale graphs |
| AR session completion (start → arrival or cancel) | ≥ 60% of started AR sessions get a usable first instruction |
| SUS (guided navigation task) | ≥ 75 |
| Admin ability to publish a hazard that affects routes | < 5 minutes from create to live effect |
| System uptime (staging/prod) | ≥ 99.5% monthly |

Detailed KPIs: [success-metrics.md](./success-metrics.md).

## Value proposition

**For campus users:** “Get to any lab, office, or hall without asking strangers—routes that avoid crowds, stairs (if needed), and closed paths, with AR guidance when you need it.”

**For campus operators:** “See and shape campus movement: publish hazards, tune routing priorities, and understand where people actually go.”

**Differentiation:** Campus-specific graph + safety/accessibility + AR + operator twin/admin—not a generic city map overlay.

## Target audience

| Segment | Priority (V1) | Need |
|---------|---------------|------|
| Undergraduate / postgraduate students | Primary | Daily class and facility navigation |
| Campus visitors (parents, guests, conference attendees) | Primary | First-visit orientation |
| Faculty / staff | Secondary | Efficient building-to-building trips |
| Security / safety officers | Secondary | SOS awareness, hazard publication |
| Campus IT / facilities admins | Primary (B2B buyer) | Data stewardship, ops visibility |

## Positioning

CampusAR sits between **consumer maps** (too coarse) and **enterprise indoor IPS** (too heavy for many campuses in V1). V1 ships a **software-first** campus navigation product with simulated IoT hooks; hardware localization is a roadmap capability, not a V1 blocker.

## Assumptions (documented)

1. Initial deployment is a **single campus** (or single demo campus graph).
2. V1 primary client is a **web application** (responsive); native apps are later.
3. Indoor room-level accuracy without BLE is **approximate** (entrance/corridor level); marketing copy must not claim centimeter IPS in V1.
4. Crowd and sensor feeds in V1 may be **admin-simulated or software-simulated** until IoT is installed.
