# CampusAR Product Documentation

This folder contains the **product specification** for CampusAR, including the V1 single-campus (reference tenant) pack and the strategic **Navigation-as-a-Service (NaaS)** multi-tenant direction. It is intended for product, design, architecture, and engineering teams. It does **not** include application source code.

After reviewing these documents, engineering may proceed to system architecture, API contracts, data modeling, and implementation planning.

---

## Document index

| # | Document | Description |
|---|----------|-------------|
| 1 | [vision.md](./vision.md) | Vision, mission, problem, objectives, value proposition (incl. NaaS) |
| 2 | [prd.md](./prd.md) | Product Requirements Document (V1 reference tenant) |
| 3 | [personas.md](./personas.md) | User personas |
| 4 | [user-stories.md](./user-stories.md) | User stories by module |
| 5 | [feature-list.md](./feature-list.md) | MoSCoW feature prioritization |
| 6 | [feature-specifications.md](./feature-specifications.md) | Detailed feature specs |
| 7 | [user-journeys.md](./user-journeys.md) | End-to-end journeys + Mermaid flows |
| 8 | [navigation-workflow.md](./navigation-workflow.md) | Navigation lifecycle & failure cases |
| 9 | [safety-workflow.md](./safety-workflow.md) | Safety, SOS, hazards, accessibility |
| 10 | [ai-routing-logic.md](./ai-routing-logic.md) | Routing behaviour (not algorithms) |
| 11 | [roadmap.md](./roadmap.md) | V1–V5 roadmap (campus → NaaS platform) |
| 12 | [multi-tenancy.md](./multi-tenancy.md) | **NaaS product vision** — orgs, editor, QR, branding |
| 13 | [risks.md](./risks.md) | Risks and mitigations |
| 14 | [success-metrics.md](./success-metrics.md) | KPIs and success metrics |
| 15 | [future-opportunities.md](./future-opportunities.md) | Longer-horizon opportunities |

Related architecture pack (Phase 2): [`../architecture/README.md`](../architecture/README.md).  
Related design pack (Phase 3 UX/UI): [`../design/README.md`](../design/README.md).  
Legacy single-file notes (if present): [`../ARCHITECTURE.md`](../ARCHITECTURE.md), [`../API.md`](../API.md), [`../DATABASE.md`](../DATABASE.md), [`../DEPLOYMENT.md`](../DEPLOYMENT.md) — prefer `docs/architecture/` and `docs/design/` when they diverge.

---

## Product snapshot

| Field | Value |
|-------|--------|
| **Product name** | CampusAR |
| **Category** | Navigation-as-a-Service (NaaS) / private-site wayfinding |
| **Primary platforms (V1)** | Progressive Web App (desktop + mobile browser) |
| **Secondary (later)** | Native Android AR (Unity/ARCore), optional iOS |
| **Primary users** | Visitors (guest), members, org admins, security; platform ops |
| **Core value** | Org-scoped, brandable, QR-first navigation with self-serve map editing, AR guidance, and operational visibility |
| **Tenancy** | Multi-org platform; V1 reference campus = first tenant |

---

## How to use this pack

1. **Product / stakeholders** — start with `vision.md`, `multi-tenancy.md`, and `prd.md`.
2. **Design / UX** — use `personas.md`, `user-journeys.md`, `feature-specifications.md`; NaaS UX in architecture map-editor / QR / branding docs.
3. **Engineering leads** — use `feature-list.md`, workflows, `ai-routing-logic.md`, then [`../architecture/multi-tenant-architecture.md`](../architecture/multi-tenant-architecture.md).
4. **Program management** — use `roadmap.md`, `risks.md`, `success-metrics.md`.

---

## Document control

| Version | Date | Author role | Notes |
|---------|------|-------------|-------|
| 1.0 | 2026-07-30 | Product + Architecture | Initial V1 specification pack |
| 1.1 | 2026-07-31 | Product + Architecture | NaaS / multi-tenancy vision; roadmap dual-track |

**Assumptions** are documented inside each file where they affect scope. When reality differs (e.g., tenancy timeline or industry template needs), update `multi-tenancy.md` / PRD and cascade to stories and roadmap.
