# 6. Frontend Architecture — CampusAR

## Goals

- Feature isolation matching product modules
- Map-first navigation with AR as progressive enhancement
- Single API + WS client surface
- Performance budgets for mobile browsers
- Extension hooks for BLE pose and Unity deep links later

---

## Recommended folder structure

```text
apps/web/
  index.html
  src/
    main.tsx                 # bootstrap
    App.tsx                  # router shell
    index.css                # tokens / global
    vite-env.d.ts
    components/              # shared presentational (shell, errors)
      AppShell.tsx
      ErrorBoundary.tsx
    features/
      auth/
      map/
      navigate/
      ar/
      twin/
      safety/
      admin/
      analytics/
    lib/
      api/                   # HTTP client, error mapping
      ws/                    # WebSocket client + reconnect
      geo/                   # snap helpers, smoothing (pure)
      position/              # PositionProvider implementations
    stores/                  # Zustand: auth, theme, prefs, nav session
    hooks/                   # cross-feature hooks (useCampusLive)
    routes/                  # route objects / lazy imports
    types/                   # UI-only types (prefer shared package)
  public/
```

**Rule:** `features/X` may import `lib/*`, `stores/*`, `components/*`, `packages/shared`. Features must not import other features’ internals (only shared events/stores).

---

## Feature modules

| Feature | Owns | Out of scope |
|---------|------|--------------|
| auth | Landing, login/register, guest CTA | Admin RBAC logic (server) |
| map | MapLibre view, filters, pick OD, crowd colors | Pathfinding |
| navigate | Turn list, recalc, TTS, arrival (map mode) | Camera AR scene |
| ar | Camera, compass cue, doll, AR HUD | Route authority |
| twin | Three scene, live heat | Mutating campus data |
| safety | Hazards list UX, SOS, contacts | Dispatch SLA |
| admin | Forms for weights/entities/sim | Domain cost math |
| analytics | Charts/tables | Event ingestion |

---

## Routing (client)

- React Router (or equivalent) with lazy-loaded feature routes.
- Guards: `RequireAuth`, `RequireAdmin`.
- Deep links: `/navigate?from=&to=`, `/ar?...`, `/twin`.

```text
/                 landing / auth
/map              discovery
/navigate         turn-by-turn
/ar               Web AR
/twin             digital twin
/safety           safety
/admin            admin (role)
/analytics        analytics (role)
```

---

## State management

| Store | Persistence | Contents |
|-------|-------------|----------|
| authStore | session/local per security decision | tokens, user, role, guest flag |
| themeStore | local | theme preference |
| prefsStore | local + server when logged in | accessibility, prediction toggle, doll gender, voice |
| navSessionStore | memory | active route, step index, nav phase |
| liveStore (or hook cache) | memory | last crowd/hazard snapshot |

**Principles:** Server is source of truth for routes/graph. Client stores are UX + session. Avoid duplicating graph in multiple stores — cache via React Query (optional) or module-level cache with TTL.

**Assumption:** Zustand is the V1 default; React Query optional for server cache.

---

## Authentication (client)

1. Login → store access token (memory preferred) + refresh (httpOnly cookie ideal).
2. API client attaches `Authorization: Bearer`.
3. 401 → refresh once → retry; else guest/login redirect.
4. Admin routes check `role === admin` client-side **and** rely on server 403.
5. Guest: no admin; navigation allowed.

---

## Error handling

- **ErrorBoundary** around feature routes (especially AR/WebGL).
- API errors mapped to user copy via stable `code` from API envelope.
- GPS/camera permission denials → inline recovery CTAs (manual source / map mode).
- Never swallow errors without logging (`console` in dev; telemetry hook later).

---

## Offline strategy (V1)

| Capability | V1 behaviour |
|------------|--------------|
| App shell | Optional PWA cache for static assets |
| Graph / routes | Online required for authoritative route |
| Active navigation | If reconnect fails mid-trip, keep last route + warn |
| SOS | Fail clearly if offline (queue is Could Have) |

Do not claim full offline campus packs in V1 (product Won’t Have).

---

## Caching

- HTTP: short TTL or ETag for places list; no long cache for hazards/crowd.
- In-memory: last search results, last route response.
- WS snapshot replaces stale crowd overlays on reconnect.

---

## Lazy loading

- Lazy routes for `ar`, `twin`, `admin`, `analytics` (heavy Three/Map admin).
- Dynamic `import()` for Three.js / doll assets on AR/twin entry only.
- MapLibre loaded with map feature.

---

## Performance

| Budget | Guidance |
|--------|----------|
| TTI map | Avoid blocking on twin/AR bundles |
| AR | Throttle orientation handlers; rAF for render |
| Re-renders | Prefer local state for high-frequency GPS; don’t push every fix into global store |
| Lists | Virtualize only if place lists grow huge |
| Images/assets | Compress doll textures; Draco optional later |

---

## Position provider port

```text
interface PositionProvider {
  start(): void
  stop(): void
  onUpdate(cb: (fix: Pose) => void): unsubscribe
  // Pose: { lat, lng, accuracy, heading?, source: 'gps' | 'ble' | 'manual' | 'fused' }
}
```

V1: `BrowserGpsProvider` + `ManualNodeProvider`.  
Future: `BleProvider`, `FusedProvider` without changing navigate/AR.

---

## Testing (frontend)

- Unit: geo snap, step advancement, permission state machines
- Component: critical forms and empty/error states
- E2E smoke: guest search → route → navigate (CI optional against staging)

---

## Accessibility (UI)

- Instructions available as text (not doll-only)
- Respect `prefers-reduced-motion` for doll animations
- Focus order on admin forms; sufficient contrast per design tokens
