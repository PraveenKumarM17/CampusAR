# Positioning Abstraction (GPS and Beyond)

**Purpose:** Keep the routing engine independent of how the user pose is obtained. GPS is the first adapter; BLE, Wi‑Fi, visual SLAM, and UWB plug into the same port.

---

## 1. Principle

```text
PositionProvider (port)
        ↓
   UserPose { lat, lng, accuracy, floor?, heading?, source, ts }
        ↓
   SnapToGraph (org-scoped)
        ↓
   Routing / Recalculate / AR camera offset
```

The A* engine and edge costs **must not** import browser geolocation APIs or vendor BLE SDKs.

---

## 2. Port contract (conceptual)

| Method | Intent |
|--------|--------|
| `start()` / `stop()` | Lifecycle |
| `subscribe(onPose)` | Stream updates |
| `getLastPose()` | Sync read |
| `capabilities` | accuracy class, indoor/outdoor, floor support |

**UserPose** fields evolve; routing consumes coordinates + optional floor id.

---

## 3. Adapters (roadmap)

| Adapter | Phase | Notes |
|---------|-------|-------|
| Browser GPS (`Geolocation`) | Now | Outdoor default |
| Manual / demo pin | Dev | Testing without GPS |
| BLE beacons | Future | Indoor zones |
| Wi‑Fi RTT / fingerprint | Future | Building-specific models |
| Visual SLAM / VPS | Future | AR-centric |
| UWB | Future | High accuracy sites |

Org settings enable which providers are allowed; runtime selects best available (**fusion** is a later concern).

---

## 4. Snap & track (org-scoped)

1. Pose enters org bounding box check (warn if outside).  
2. Nearest **routable** node or edge projection within max snap distance.  
3. If accuracy poor, widen snap or ask user to confirm start node.  
4. On deviation beyond threshold → recalculate route from new snap.

All graph queries filtered by `organizationId`.

---

## 5. Indoor / floor

When pose includes `floorId`, snap and route prefer that floor’s subgraph; vertical edges (stairs/elevators) connect floors.

GPS alone rarely provides floor — BLE/Wi‑Fi/SLAM adapters will.

---

## 6. Frontend integration

- Hook/composable wraps `PositionProvider`.  
- Map / Navigate / AR consume pose identically.  
- Editor may show admin GPS debug overlay; visitors see minimal accuracy UX.

---

## 7. Privacy

- Poses stay on device unless user opts into analytics trails.  
- Server route requests send start node id or coarse start, not continuous raw GPS streams by default.  
- Org policy may disable live tracking features.

---

## 8. Testing

- Fake provider with recorded traces per org fixture.  
- Isolation: snap never considers foreign-org nodes.

---

## 9. Related

- Existing GPS UX docs / routing architecture  
- [`multi-tenant-architecture.md`](./multi-tenant-architecture.md)  
- [`map-editor.md`](./map-editor.md)  
