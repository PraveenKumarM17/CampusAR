# CampusAR Unity AR Client

Unity **2022.3 LTS** + **AR Foundation** mobile client that consumes the CampusAR REST API.

## Setup

1. Open this folder in Unity Hub (2022.3 LTS).
2. Install packages via Package Manager:
   - AR Foundation
   - ARCore XR Plugin (Android) and/or ARKit XR Plugin (iOS)
   - Text Requests (or use included `ApiClient` with `UnityWebRequest`)
3. Create an AR scene:
   - AR Session
   - AR Session Origin / XR Origin
   - AR Camera
4. Attach scripts from `Assets/Scripts/` to an empty `CampusAR` GameObject.
5. Set `ApiBaseUrl` to your API (e.g. `https://your-host/api`).

## Indoor admin mapper (AR Measure → graph)

Scripts live in `Assets/Scripts/Indoor/`. This is a **separate mapping module**; it does not replace outdoor GPS scripts.

1. Install AR Foundation + ARCore (Android) / ARKit (iOS).
2. Scene: AR Session, XR Origin, AR Camera, AR Plane Manager, AR Raycast Manager, AR Anchor Manager.
3. Add `IndoorMapperController`, `ARReticle`, `IndoorGraphEditor`, `IndoorApiClient`.
4. Admin logs in, selects building + floor, starts mapping.
5. Walk the building. **Add Point** only on button press (never every frame).
6. Connect any two nodes to create branches/loops. Mark destinations/places. Create QR codes at entrances/junctions.
7. Publish the map via `PUT /api/indoor/maps/:id` `{ "status": "published" }`.

User indoor guidance: scan QR → `GET /api/indoor/anchors/:code` → `POST /api/indoor/route` → `IndoorGuidanceController`.

Indoor coordinates are local meters. See `docs/architecture/indoor-ar-mapping.md`.

## Scripts

| Script | Role |
|--------|------|
| `ApiClient.cs` | Guest/login + `POST /navigation/route` |
| `RouteFollower.cs` | Advances along route steps |
| `ArrowGuide.cs` | Floating direction arrow |
| `VoiceGuide.cs` | Turn-by-turn speech |
| `Indoor/IndoorApiClient.cs` | Indoor map/node/edge/place/QR/route REST |
| `Indoor/ARReticle.cs` | Plane raycast reticle with smoothing |
| `Indoor/IndoorGraphEditor.cs` | Add/connect/undo graph (not linear-only) |
| `Indoor/IndoorMapperController.cs` | Admin mapping + tracking gates |
| `Indoor/IndoorGuidanceController.cs` | User AR arrows after QR |

## Demo positioning

MVP uses GPS / mock world offsets relative to the first route coordinate. BLE / visual localization can replace `RouteFollower.UpdatePose` later without changing the API contract.

## Build

- Android: min SDK 24, ARCore required
- iOS: ARKit capable device

Do **not** couple this client to MQTT/BLE hardware for MVP — keep localization swappable behind `IPoseProvider`.
