# CampusAR Product Documentation

This folder contains the complete **Version 1.0 product specification** for CampusAR. It is intended for product, design, architecture, and engineering teams. It does **not** include application source code.

After reviewing these documents, engineering may proceed to system architecture, API contracts, data modeling, and implementation planning.

---

## Document index

| # | Document | Description |
|---|----------|-------------|
| 1 | [vision.md](./vision.md) | Vision, mission, problem, objectives, value proposition |
| 2 | [prd.md](./prd.md) | Product Requirements Document |
| 3 | [personas.md](./personas.md) | User personas |
| 4 | [user-stories.md](./user-stories.md) | User stories by module |
| 5 | [feature-list.md](./feature-list.md) | MoSCoW feature prioritization |
| 6 | [feature-specifications.md](./feature-specifications.md) | Detailed feature specs |
| 7 | [user-journeys.md](./user-journeys.md) | End-to-end journeys + Mermaid flows |
| 8 | [navigation-workflow.md](./navigation-workflow.md) | Navigation lifecycle & failure cases |
| 9 | [safety-workflow.md](./safety-workflow.md) | Safety, SOS, hazards, accessibility |
| 10 | [ai-routing-logic.md](./ai-routing-logic.md) | Routing behaviour (not algorithms) |
| 11 | [roadmap.md](./roadmap.md) | V1–V5 product roadmap |
| 12 | [risks.md](./risks.md) | Risks and mitigations |
| 13 | [success-metrics.md](./success-metrics.md) | KPIs and success metrics |
| 14 | [future-opportunities.md](./future-opportunities.md) | Post-V1 opportunities |

Related architecture pack (Phase 2): [`../architecture/README.md`](../architecture/README.md).  
Related design pack (Phase 3 UX/UI): [`../design/README.md`](../design/README.md).  
Legacy single-file notes (if present): [`../ARCHITECTURE.md`](../ARCHITECTURE.md), [`../API.md`](../API.md), [`../DATABASE.md`](../DATABASE.md), [`../DEPLOYMENT.md`](../DEPLOYMENT.md) — prefer `docs/architecture/` and `docs/design/` when they diverge.

---

## Product snapshot

| Field | Value |
|-------|--------|
| **Product name** | CampusAR |
| **Category** | Smart campus navigation / wayfinding |
| **Primary platforms (V1)** | Progressive Web App (desktop + mobile browser) |
| **Secondary (later)** | Native Android AR (Unity/ARCore), optional iOS |
| **Primary users** | Students, visitors, faculty, security, campus admins |
| **Core value** | Faster, safer, crowd-aware campus navigation with AR guidance and operational visibility |

---

## How to use this pack

1. **Product / stakeholders** — start with `vision.md` and `prd.md`.
2. **Design / UX** — use `personas.md`, `user-journeys.md`, `feature-specifications.md`.
3. **Engineering leads** — use `feature-list.md`, workflows, `ai-routing-logic.md`, then architecture docs.
4. **Program management** — use `roadmap.md`, `risks.md`, `success-metrics.md`.

---

## Document control

| Version | Date | Author role | Notes |
|---------|------|-------------|-------|
| 1.0 | 2026-07-30 | Product + Architecture | Initial V1 specification pack |

**Assumptions** are documented inside each file where they affect scope. When reality differs (e.g., multi-campus vs single campus), update the PRD and cascade changes to stories and roadmap.
