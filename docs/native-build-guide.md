# CampusAR mobile — native build guide

React Native CLI app (no Expo): `apps/mobile`.

| Component | Version / note |
|-----------|----------------|
| React Native | 0.77.3 |
| Node | ≥ 20 (22 verified) |
| JDK (Android) | 17 |
| iOS deployment target | 15.1 |
| Android min SDK | 24 (ARCore) |

## Environment variables

| Variable | Purpose | Default (dev) |
|----------|---------|----------------|
| `API_URL` | REST base URL | Android emulator: `http://10.0.2.2:4000/api` |

For a physical device, use your machine LAN IP, e.g. `http://192.168.1.10:4000/api`.

## JavaScript

From repo root (after `npm install`):

```bash
npm run dev:api
npm run dev:mobile
```

In another terminal:

```bash
npm run android:mobile
```

## Android (Windows / Linux / macOS)

1. Install Android Studio, SDK 35, NDK per RN 0.77 docs.
2. Set `ANDROID_HOME` and add `platform-tools` to `PATH`.
3. Use an **ARCore-supported** device or emulator image with Google Play + AR.
4. Grant camera permission when prompted.
5. Build: `cd apps/mobile && npx react-native run-android`.

ARCore meta-data is `required` in the manifest; unsupported devices should fail gracefully with an error event (verify on hardware).

## iOS (macOS + Xcode only)

**Not buildable on Windows.** Steps for Mac developers:

1. Xcode 15+ and CocoaPods (`gem install cocoapods`).
2. `cd apps/mobile/ios && pod install`
3. Open `CampusARMobile.xcworkspace`.
4. Set signing team and bundle identifier.
5. `NSCameraUsageDescription` and ARKit capability are configured in `Info.plist`.
6. Run on a **physical** ARKit device (simulator AR is limited).
7. `npx react-native run-ios --device`

Native AR sources:

- `ios/CampusARMobile/CampusARMeasure*.swift`
- Bridge: `CampusARMeasureBridge.m`

## Physical device acceptance tests (required before “done”)

Run on real iPhone and ARCore phone:

1. Start AR in a lit area with textured floors.
2. Place point A, walk several metres, return — A should stay aligned within ARKit/ARCore expectations.
3. Place B, verify distance.
4. Background app, resume session.
5. Reset session clears anchors.
6. Admin sign-in saves points via `/api/measurements/...`.

Record device model, OS version, and observed drift — do not claim sub-centimetre accuracy.

## Known gaps (2026-10-24)

- Android OpenGL point markers (lines/spheres) not yet drawn; anchors and distances work in JS HUD.
- Full campus map, indoor QR, map builder, Cesium twin: **web only** until migrated.
- iOS/Android builds **not verified** in CI from this Windows environment.
