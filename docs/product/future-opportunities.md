# 14. Future Opportunities — CampusAR

Ideas beyond V1, aligned to the research vision. Each notes **why** and **dependency**.

---

## BLE indoor positioning

**Why:** GPS fails indoors; room-level guidance needs RF or similar.  
**Dependency:** Beacon survey, calibration app, hybrid fusion service.  
**Product angle:** “Find Room 4.12” reliably.

---

## MQTT / real IoT fleet

**Why:** Replace simulator with truth from cameras, people counters, air quality, door sensors.  
**Dependency:** Broker, device identity, sensor health, campus network policy.  
**Product angle:** Facilities trust + automated hazard hints.

---

## LSTM / deep occupancy forecasting

**Why:** Better than EWMA for class-change surges and events.  
**Dependency:** Months of labeled edge occupancy; training pipeline; monitoring for drift.  
**Product angle:** “Leave 8 minutes early — corridor peaks at :05.”

---

## Digital Twin enhancements

**Why:** Twin becomes planning tool, not only 3D map.  
**Ideas:** Floor LOD, what-if closures, construction staging, crowd playback scrubber, BIM import.  
**Dependency:** Stronger geometry pipeline; role-based twin edit.

---

## Indoor mapping & multilevel graphs

**Why:** Real campuses are vertical.  
**Dependency:** Floor plans, vertical connectors (stairs/lifts) modeled consistently with accessibility.

---

## Voice navigation & AI assistant

**Why:** Hands-free and inclusive; natural language destinations.  
**Dependency:** Speech STT, campus entity linker, confirmation UX in noisy outdoors.  
**Product angle:** “Take me to the quietest library entrance.”

---

## Native AR (ARKit / ARCore / Unity)

**Why:** Stable world tracking beyond browser limits.  
**Dependency:** Mobile release train, store compliance, parity with web features.

---

## Smart parking

**Why:** Drivers are campus users too; reduces circling congestion.  
**Dependency:** Lot sensors or camera counts; parking policy rules; not walking-graph-only.

---

## Predictive navigation packages

**Why:** Combine calendar (class schedule), prediction, and notifications.  
**Dependency:** Optional SIS/LMS integration; privacy consent.

---

## Analytics & campus intelligence

**Why:** Sell to CIO/facilities: bottleneck heatmaps, wayfinding ROI, event planning.  
**Dependency:** Clean event taxonomy; privacy review; export/BI.

---

## Accessibility expansions

**Why:** Beyond avoid-stairs — sensory-friendly routes, induction loop POIs, captioned guidance.  
**Dependency:** Rich POI taxonomy; partnerships with disability services.

---

## Safety platform upgrades

**Why:** Move from SOS log to coordinated response.  
**Ideas:** SMS/push to security, live share, geofenced alerts, integration with existing campus safety apps.  
**Dependency:** Legal, vendors, SLA, trained operators.

---

## Multi-campus SaaS

**Why:** Venture-scale productization.  
**Dependency:** Tenancy, onboarding tooling, billing, support.

---

## Prioritization hint

Advance opportunities that **reuse V1 loop**: MQTT → better crowd → better routing → better metrics.  
Defer opportunities that **fork the product** (parking, social) until navigation retention is proven.
