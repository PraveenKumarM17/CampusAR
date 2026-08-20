# Indoor AR mapping — coordinate system

Indoor graphs **do not use GPS / WGS84**.

## Frames

| System | Used by | Units | Origin |
|--------|---------|-------|--------|
| WGS84 lat/lng | Outdoor `/map`, `/navigate`, outdoor A* | degrees | Earth |
| AR local meters v1 (`ar-local-meters-v1`) | Indoor mapper + indoor A* | meters | QR / floor origin for **one published map** |

Unity / AR Foundation convention (Y-up, right-handed):

- **+X** right
- **+Y** up
- **+Z** forward (away from the mapper at session start, after QR alignment)

Positions stored as `{ localX, localY, localZ }` relative to the map’s **origin QR anchor**.

## Relocalization (required)

A mapping session origin on admin phone A is **not** valid on user phone B.

To start indoor navigation:

1. Scan a physical QR (`indoor_anchors.anchor_code`)
2. Resolve `nodeId` + `mapId` + local pose of that marker
3. Treat that node as the current graph location
4. Drive A* in the **saved graph**, not live AR world tracking across devices

Recalibrate at junction QR markers if tracking drifts. Waypoint arrival uses proximity (`INDOOR_WAYPOINT_PROXIMITY_M`), not exact coordinate match.

## Accuracy

This system is **tolerance-aware**, not centimeter-perfect. Mapping quality metadata (`trackingQuality`, `accuracyM`, `confidence`) is stored with sessions/nodes. Poor AR tracking must block new points in the Unity mapper.
