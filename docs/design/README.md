# CampusAR Design Documentation

This folder is the **Phase 3 UX / UI design specification** for CampusAR. Product requirements ([`../product/`](../product/)) and architecture ([`../architecture/`](../architecture/)) are sources of truth for *what* and *how the system works*. These documents define *how it looks, feels, and behaves* so UI engineers can implement without inventing design decisions.

**Out of scope for this pack:** Figma files, raster mockups, React/HTML/CSS source.

---

## Design philosophy

CampusAR should feel like a **trusted spatial utility**, not a novelty AR demo or a cluttered admin portal.

| Inspiration | Borrow |
|-------------|--------|
| **Google / Apple Maps** | Map-first hierarchy, clear route chrome, calm failure recovery |
| **Linear** | Dense but quiet controls, keyboard-friendly, precise typography |
| **Arc** | Confident whitespace, distinctive brand without noise |
| **Notion** | Predictable surfaces, soft elevation, readable content density |
| **Modern SaaS dashboards** | Admin/analytics clarity, table/form consistency |

**Brand character:** Campus atlas — institutional trust + contemporary product craft.  
**Accent:** Deep teal (wayfinding / campus), never generic purple-glow AI aesthetics.  
**Default theme:** Light (outdoor readability). Dark mode is a first-class system mode for night walking and operator preference.

**Core UX promise:** *Find a place → trust the route → follow guidance → arrive — with AR as optional enhancement and safety always one tap away.*

---

## Document map

| # | Document | Purpose |
|---|----------|---------|
| 1 | [README.md](./README.md) | Philosophy & index |
| 2 | [design-principles.md](./design-principles.md) | Visual, usability, a11y, motion, consistency |
| 3 | [design-system.md](./design-system.md) | Type, space, grid, radius, elevation, icons, themes |
| 4 | [color-system.md](./color-system.md) | Semantic + map + crowd + hazard palettes |
| 5 | [component-library.md](./component-library.md) | Reusable UI inventory |
| 6 | [information-architecture.md](./information-architecture.md) | Nav & hierarchy |
| 7 | [wireframes.md](./wireframes.md) | Low-fi Mermaid wireframes |
| 8 | [user-flows.md](./user-flows.md) | Persona flows + alts + failures |
| 9 | [page-specifications.md](./page-specifications.md) | Per-page behaviour & states |
| 10 | [responsive-design.md](./responsive-design.md) | Breakpoints & layout adaptation |
| 11 | [motion-design.md](./motion-design.md) | Motion language |
| 12 | [accessibility.md](./accessibility.md) | WCAG AA programme |
| 13 | [ar-experience.md](./ar-experience.md) | AR UI details |
| 14 | [digital-twin-experience.md](./digital-twin-experience.md) | Twin UI details |
| 15 | [navigation-experience.md](./navigation-experience.md) | Navigate mode UX |
| 16 | [empty-states.md](./empty-states.md) | Empty / missing capability |
| 17 | [error-states.md](./error-states.md) | Error patterns |
| 18 | [portfolio-checklist.md](./portfolio-checklist.md) | Launch-quality bar |

---

## Reading order

1. **Product / eng leads** — principles → IA → page specs  
2. **UI engineers** — design system → color → components → page specs → empty/error  
3. **Interaction / motion** — principles → motion → AR / navigation / twin  
4. **QA** — flows → empty/error → accessibility → checklist  

---

## Non-negotiables (aligned to product)

- Map navigation works without AR, camera, or compass  
- Guest path is first-class  
- Safety copy never implies live emergency dispatch in V1  
- Simulated IoT must be labeled when shown  
- Text instructions remain available when avatar motion is on  

---

## Document control

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-07-30 | Initial UX design pack |
