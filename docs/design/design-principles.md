# 2. Design Principles — CampusAR

## Visual goals

1. **Atlas clarity** — The first viewport of branded surfaces should read as CampusAR, not a generic dashboard. Brand mark + product name are hero-level on landing; elsewhere brand is quiet chrome.
2. **One job per view** — Map finds; Navigate guides; AR enhances; Twin monitors; Admin operates; Analytics explains.
3. **Spatial honesty** — UI chrome never obscures the route more than necessary. Prefer translucent bars and sheets over opaque card stacks on the map.
4. **Quiet density** — Admin/analytics may be dense; walker-facing screens stay sparse (large type, few CTAs).
5. **No decorative noise** — No floating promo badges, pill clusters, or stat strips on hero/map first paint.

## Usability goals

1. **Time-to-route &lt; 30s** for familiar users (product KPI).
2. **Progressive disclosure** — Advanced toggles (prediction, weights) behind clear labels, not buried forever or dumped in the hero.
3. **Recoverable mistakes** — Every failure offers a next action (manual location, map mode, retry, contacts).
4. **Thumb-first mobile** — Primary nav actions within easy reach; SOS reachable but confirmation-gated.
5. **Guest parity** — Visitors complete the full navigate loop without account walls.

## Accessibility goals

1. **WCAG 2.2 AA** for core flows (search, route, navigate, safety, auth, admin forms).
2. **Meaning not color-only** — Crowd/hazard encoding uses color + pattern/label.
3. **Reduced motion** — Avatar and map flourishes simplify; guidance remains complete.
4. **Keyboard** — All non-map-canvas admin and form tasks operable; map has alternative list selection.
5. **Text over spectacle** — Doll/AR never replaces written/spoken instructions.

## Interaction principles

| Principle | Practice |
|-----------|----------|
| Direct manipulation | Tap map to set source/destination; drag twin orbit |
| Immediate feedback | Buttons show pressed/loading; route request shows progress |
| Reversible | Cancel navigation; undo SOS within confirm step |
| Consistent placement | Primary CTA bottom-right (desktop) / bottom sticky (mobile) for navigate start |
| Honest system status | Live / simulated / offline chips always accurate |

## Motion principles

1. **Presence, not noise** — 2–3 intentional motions per major surface (landing, AR, twin), not perpetual glitter.
2. **Spatial continuity** — Shared-element feel when moving Map → Navigate (route polyline persists).
3. **Functional motion** — Recalc toast, arrival celebrate, sheet expand — each teaches state change.
4. **Interruptible** — Animations cancel on user input; never block SOS.
5. **Respect OS** — Honor `prefers-reduced-motion`.

## Consistency principles

1. **One component vocabulary** across student and admin (same Button, Input, Toast).
2. **Semantic color** — Success/warn/danger mean the same in map legend and forms.
3. **Shared elevation & radius scale** — No one-off “special cards” without a system token.
4. **Icon metaphor stability** — Hazard, crowd, location, SOS icons never swap meaning.
5. **Copy tone** — Clear, calm, institutional; no slang in safety; no overclaiming AI.

## Anti-patterns (explicitly banned)

- Purple-on-white / indigo glow “AI product” look  
- Warm cream + terracotta “default AI landing” cliché  
- Newspaper broadsheet dense rules as primary chrome  
- Card grids in the landing hero  
- Detached floating stickers on map/AR camera  
- Dark mode as the only designed theme (light is default)
