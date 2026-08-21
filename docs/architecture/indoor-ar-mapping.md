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

## Web admin measurement

The web Map Builder ports the Apache-2.0
[AR-Measure](https://github.com/lightlessdays/AR-Measure) point-to-point vector
distance workflow to WebXR hit-test:

1. The administrator opens Indoor Map Builder and selects a building/floor.
2. **AR Measure** requests the rear camera and an `immersive-ar` session.
3. Floor/corner taps are stored in AR-local meters and projected from X/Z into
   `floor-plan-meters-v1`.
4. Saving a room persists its polygon plus measured length, width, height,
   source, and timestamp in the versioned `rooms` row.
5. Graph nodes/edges and QR anchors are authored on top of that measured map.

A plain camera feed has no metric depth. Devices without WebXR hit-test can
preview the camera but must use the scaled floor-plan Measure tool (or the
native Unity mapper) for reliable dimensions.

## Visitor handoff

Outdoor AR routes to the selected building entrance. On arrival, the visitor
chooses a room/person scoped to that building, scans a mapped QR anchor, then
receives both:

- the measured floor-plan route overlay; and
- camera guidance using the saved indoor route bearings.

The web camera overlay advances explicitly between anchor-localized waypoints;
it does not claim cross-device world-locked SLAM. Additional QR anchors should
be installed at floor entrances and major junctions to control drift.
