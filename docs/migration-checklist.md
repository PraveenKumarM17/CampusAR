# CampusAR migration checklist

| Feature | Web | Mobile iOS | Mobile Android | Notes |
|---------|-----|------------|----------------|-------|
| JWT auth / guest | ✅ | ✅ shell | ✅ shell | AsyncStorage persist |
| Site selection | ✅ | ✅ first site on login | ✅ | |
| Native AR measure | ❌ (sensor/WebXR) | ✅ source | ✅ source | **Not device-tested here** |
| Save measurement API | ✅ | ✅ admin + draft version | ✅ | |
| Outdoor map | ✅ | ⏳ | ⏳ | Leaflet/MapLibre rewrite |
| Navigate / GPS AR | ✅ | ⏳ | ⏳ | |
| Indoor QR | ✅ | ⏳ | ⏳ | vision-camera planned |
| Map builder | ✅ | ⏳ | ⏳ | Web remains editor |
| Digital twin (Cesium) | ✅ | ⏳ | ⏳ | |
| Unity client | scaffold | n/a | n/a | Reference only |
| Backend / PostGIS | ✅ | ✅ compatible | ✅ | Unchanged |

Legend: ✅ implemented · ⏳ pending · ❌ intentionally replaced on mobile
