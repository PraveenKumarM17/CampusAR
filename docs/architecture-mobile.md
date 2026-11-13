# CampusAR mobile architecture

## Layout

```
apps/mobile/
  src/
    api/           # fetch client (JWT, X-Site-Id)
    ar/            # TS facade + types for native AR
    config/        # API_URL
    features/      # auth, dashboard, ar-measurement
    navigation/    # shell navigator (pre–React Navigation)
    stores/        # zustand + AsyncStorage
  ios/             # ARKit CampusARMeasure native view + module
  android/         # ARCore CampusARMeasure native view + module
```

Monorepo packages:

- `@campusar/shared` — DTOs (measurement spatial points in millimetres)
- `@campusar/api` — unchanged Express backend
- `@campusar/web` — unchanged until feature parity

## Native AR interface (JavaScript)

Module: `CampusARMeasureModule`

| Method | Behavior |
|--------|----------|
| `startSession()` | World tracking + camera |
| `pauseSession()` / `resumeSession()` | Lifecycle |
| `placePoint()` | Raycast at view centre, anchor in world space |
| `undoLastPoint()` / `clearPoints()` | Edit chain |
| `resetSession()` | New tracking configuration |
| `getTrackingState()` | Quality enum |

View: `CampusARMeasureView` — emits `onMeasureEvent` with `tracking`, `surface`, `points`, `error` payloads (not per-frame camera frames).

## Coordinate systems

| Frame | Use |
|-------|-----|
| ARKit / ARCore session world | Live measurement (metres in native, mm in API) |
| Building local metres | Indoor graph (`docs/architecture/indoor-ar-mapping.md`) |
| WGS84 | Outdoor map |
| Graph nodes | Campus / indoor editor |

Never assume iOS world coordinates match Android or persist across sessions without `ARWorldMap` / relocalization strategy.

## Backend compatibility

Mobile uses the same JWT and measurement endpoints as `apps/web/src/lib/api.ts`. Saving paths requires:

- Admin role
- Draft `mapVersionId` from `/admin/map-builder/snapshot`
- Active `X-Site-Id`

Guests can measure locally without persistence.
