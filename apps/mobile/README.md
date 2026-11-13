# CampusAR Mobile (React Native CLI)

Cross-platform **native** CampusAR client (same features as web, no in-app browser). Native ARKit / ARCore measurement. No Expo.

Full parity roadmap: [`docs/mobile-full-parity.md`](../../docs/mobile-full-parity.md).

## Quick start

Use **one** API — not Docker and `dev:api` on the same port (4000).

**If Docker already runs the API** (`campusar-api`, port 4000 — common after `docker compose up`):

```bash
npm install
# Terminal 1
npm run dev:mobile
# Terminal 2
npm run android:mobile
```

**If you run the API locally** (no Docker api on 4000):

```bash
docker compose up -d db
npm run db:migrate
npm run db:seed

npm install
# Terminal 1
npm run dev:api
# Terminal 2
npm run dev:mobile
# Terminal 3
npm run android:mobile
```

Android emulator API URL default: `http://10.0.2.2:4000/api` (see `src/config/env.ts`).

**Monorepo:** run `npm install` from the **repo root** (not only inside `apps/mobile`). Android Gradle resolves `react-native` from hoisted `node_modules` via `android/monorepo_node_modules.gradle`.

### Windows: `JAVA_HOME is set to an invalid directory`

Your shell may point at **Eclipse Adoptium** even when only **Microsoft OpenJDK** is installed.

This repo **forces Microsoft OpenJDK 17** for Android builds (`campusar-jdk.bat`, `gradle.properties`, `npm run android`). You do not need a correct system `JAVA_HOME`, but remove the old **Eclipse Adoptium** entry if it still appears in Windows **Environment Variables** (User or System) so other tools are not confused.

Optional cleanup — PowerShell:

```powershell
[Environment]::SetEnvironmentVariable('JAVA_HOME', $null, 'User')
[Environment]::SetEnvironmentVariable(
  'JAVA_HOME',
  'C:\Program Files\Microsoft\jdk-17.0.16.8-hotspot',
  'User'
)
```

Restart the terminal after changing system env vars.

### No emulators / `UNAUTHORIZED` / `No online devices found`

The APK **built successfully**; install failed because ADB has no **authorized** target.

Check status:

```powershell
npm run android:devices -w @campusar/mobile
adb devices
```

**Physical phone (your log showed `RZ8R91MSWKM unauthorized`):**

1. Unlock the phone; use **File transfer (MTP)** USB mode, not charge-only.
2. **Developer options → USB debugging** ON.
3. Accept **Allow USB debugging?** on the phone (enable **Always allow from this computer**).
4. If there is no prompt: **Developer options → Revoke USB debugging authorizations**, unplug/replug USB, accept again.
5. On PC:

```powershell
adb kill-server
adb start-server
adb devices
```

The last line must show `device`, not `unauthorized`. Then:

```powershell
npm run android:mobile
```

**Emulator instead:** Android Studio → **Device Manager** → Create Virtual Device (Google Play image) → **Run** the AVD, then `npm run android:mobile`.

See [`docs/native-build-guide.md`](../../docs/native-build-guide.md) for Xcode, signing, and device testing.

### Metro: `Unable to resolve module ./useNavigation.js`

Monorepo Metro must keep **hierarchical lookup enabled** so packages like `@react-navigation/core` resolve their own relative files. This repo configures that in `metro.config.js`.

After changing Metro or navigation dependencies, **restart Metro with a clean cache** (stop the existing `dev:mobile` terminal first):

```powershell
cd apps/mobile
npx react-native start --reset-cache
```

Or from the repo root: `npm run dev:mobile -- --reset-cache`

## Native module API

**View:** `CampusARMeasureView`  
**Module:** `CampusARMeasureModule`

TypeScript facade: `src/ar/nativeCampusARMeasure.ts`  
Shared types: `src/ar/types.ts`

Events (`onMeasureEvent`):

- `{ type: 'tracking', quality, reason? }`
- `{ type: 'surface', detected }`
- `{ type: 'points', points, segmentDistanceM, totalDistanceM }`
- `{ type: 'error', message }`

Commands return promises; raycasting and anchor updates run on the native render thread (not bridged per frame).

## Coordinate note

API persistence uses `worldPosition` in **millimetres** (`@campusar/shared` spatial types), converted from native metres at save time in `ArMeasurementScreen`.
