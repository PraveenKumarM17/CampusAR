# Mobile full parity with web (no browser shell)

## Goal

One **native** CampusAR app with the same workflows as `apps/web`: auth, map, navigate, AR, indoor, safety, twin, admin — **without** opening Safari/Chrome or embedding the Vite site in a WebView.

## Current status (native)

| Web route | Mobile | Notes |
|-----------|--------|--------|
| `/` landing | ✅ `LandingScreen` | Same guest + admin flow |
| `/map` | ✅ `MapScreen` | Google Maps + campus graph overlay |
| `/navigate` | ✅ `NavigateScreen` | Search + route polyline (simpler UI than web) |
| `/ar` | 🟡 `ArScreen` + native measure | Outdoor doll AR not ported yet |
| `/indoor` | ✅ `IndoorScreen` | Anchor + search + route (no camera QR yet) |
| `/safety` | ✅ `SafetyScreen` | Zones, exits, SOS |
| `/digital-twin` | 🟡 `TwinScreen` | Building list; Cesium 3D pending |
| `/admin` | 🟡 `AdminScreen` | Read-only building list |
| `/admin/map-builder` | ⏳ | Terra-draw / MapLibre editor — large port |
| `/analytics` | ⏳ | Charts (recharts) — port pending |

## Why not “same pixels” overnight

The web UI uses **HTML + Tailwind + Leaflet/MapLibre + Cesium + Three.js**. Mobile uses **React Native + native maps + native AR**. Feature logic and APIs are shared (`@campusar/shared`, same REST backend); **screens are being rewritten** to match behavior and campus branding, not iframed HTML.

## Next engineering priorities

1. Camera QR scanner (`react-native-vision-camera`) for indoor anchors  
2. Map builder (admin) with `@rnmapbox/maps` or MapLibre RN  
3. Outdoor AR navigate (compass + GPS HUD; optional native 3D doll)  
4. Cesium twin → native 3D or simplified 2.5D twin  
5. Extract `packages/client-api` from web `api.ts` for one API client  

## Backend

Unchanged: `npm run dev:api` or Docker `campusar-api` on port **4000**. Mobile `API_URL` for physical devices = `http://<PC_LAN_IP>:4000/api`.
