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

## Scripts

| Script | Role |
|--------|------|
| `ApiClient.cs` | Guest/login + `POST /navigation/route` |
| `RouteFollower.cs` | Advances along route steps |
| `ArrowGuide.cs` | Floating direction arrow |
| `VoiceGuide.cs` | Turn-by-turn speech |
| `DestinationMarker.cs` | Destination pin |

## Demo positioning

MVP uses GPS / mock world offsets relative to the first route coordinate. BLE / visual localization can replace `RouteFollower.UpdatePose` later without changing the API contract.

## Build

- Android: min SDK 24, ARCore required
- iOS: ARKit capable device

Do **not** couple this client to MQTT/BLE hardware for MVP — keep localization swappable behind `IPoseProvider`.
