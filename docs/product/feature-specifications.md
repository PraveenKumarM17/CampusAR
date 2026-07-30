# 6. Feature Specifications — CampusAR V1

Specifications for Must Have and Should Have features. Could Have items are summarized at the end.

**Assumption:** One campus tenant; walking-only; GPS + graph nodes for positioning; IoT via simulator in V1.

---

## F-01 Authentication & sessions

### Purpose
Separate **guest navigation** (majority) from **organization administrator** configuration access.

### Description
Primary entry: **Continue as Guest** on an organization URL/QR—no account.  
Secondary: **Administrator login** with email + password for Admin Dashboard only.  
Sessions: guest token (org-bound, navigation APIs) vs admin JWT/refresh (membership-scoped).  
Visitor self-registration is not part of the primary product path (optional “save trips” later).

Canonical docs: [login-experience.md](./login-experience.md), [role-permissions.md](./role-permissions.md), [../architecture/authentication-authorization.md](../architecture/authentication-authorization.md).

### Business Rules
- Guests may use navigation features only; may not access admin or mutate org graph/branding.
- Email/password accounts are for **Organization Admins** (and future Super Admins), not general visitors.
- Passwords stored hashed; admin tokens expire per security policy.
- Admin role + org membership required for `/admin` APIs and UI.
- Guest preferences (a11y, map style) may persist in local storage without an account.

### Edge Cases
- Invalid admin credentials → clear error; no guest elevation.
- Expired admin token mid-edit → re-auth; guest navigation unaffected.
- Guest opens `/admin` → login challenge or redirect + “Administrators only.”
- Removed membership → refresh revoked; immediate 403 on admin APIs.

### Permissions
| Action | Guest | Org Admin | Super Admin (future) |
|--------|-------|-----------|----------------------|
| Continue as Guest | Y | Y (preview) | Y |
| Admin email/password login | N | Y | Y (platform) |
| Navigate / AR / SOS | Y | Y | Y |
| Admin Dashboard CRUD | N | Y (own org) | Y (audited) |

### Dependencies
User + membership store; auth middleware; guest session; web auth store.

### Acceptance Criteria
- [ ] Guest can reach Navigate without account after org resolve.
- [ ] Guest CTA is primary on org landing; admin sign-in is secondary.
- [ ] Valid admin login returns usable session; invalid shows message.
- [ ] Non-admin cannot open admin tools successfully (UI + API).
- [ ] Logout clears admin session and sensitive UI state.

### Future Enhancements
SSO (SAML/OIDC) for admins; MFA for admins/Super Admin; optional visitor save-trips accounts.

---

## F-02 Destination search & discovery

### Purpose
Let users find places without knowing internal IDs or graph topology.

### Description
Text search over buildings/rooms/POIs by name, code, aliases; category filters; results show on map and selectable as destination (and optionally source).

### Business Rules
- Search is case-insensitive; prefer exact code matches then fuzzy name.
- Inactive/hidden places excluded from public search.
- Search events logged for analytics (anonymized where required).

### Edge Cases
- Empty query → show popular / categories, not all nodes.
- No results → helpful empty state + category browse.
- Ambiguous names → show distinguishing metadata (building, floor).

### Permissions
Public (guest+) for read; admin for place CRUD.

### Dependencies
Campus place repository; map UI; analytics logger.

### Acceptance Criteria
- [ ] Query returns ranked relevant places.
- [ ] Selecting a result sets destination and focuses map.
- [ ] Category filter restricts list and map markers coherently.

### Future Enhancements
Voice search, synonyms from campus glossary, “near me” ranking.

---

## F-03 Interactive campus map

### Purpose
Provide spatial context: where am I, what exists, what is crowded/hazardous.

### Description
2D map showing buildings, walkable edges, user position (GPS or selected node), source/destination markers, optional crowd coloring, hazard overlays. Tap to set source/destination.

### Business Rules
- Default center/bounds = campus geofence.
- Source defaults to nearest graph node to GPS when available.
- Crowd colors use defined thresholds (low/med/high).

### Edge Cases
- GPS outside campus → warn; allow manual source.
- GPS denied → manual node selection required before route.
- Overlapping markers → z-order and hit-testing clear.

### Permissions
Read: all; mutate graph: admin.

### Dependencies
Map SDK/lib; campus GeoJSON/graph APIs; optional WebSocket crowd.

### Acceptance Criteria
- [ ] Map loads campus geometry within performance budget.
- [ ] Source/destination selection is visually unambiguous.
- [ ] Live crowd updates edges without full reload when connected.

### Future Enhancements
Indoor floor plans, 3D tilt, offline tiles.

---

## F-04 Route calculation

### Purpose
Compute an optimal walking path under distance, safety, crowd, and accessibility constraints.

### Description
User selects source, destination, preferences (accessibility, prediction on/off). Server computes path on campus graph; returns ordered steps, distance, ETA, applied costs metadata.

### Business Rules
- No path → explicit `NO_ROUTE` with reason (blocked, disconnected).
- Hazards of type fire/construction may hard-block or heavily penalize edges per policy.
- Accessibility: exclude stairs / prefer elevators when preference set and alternatives exist.
- Prediction flag applies predicted crowd to edge costs when enabled.

### Edge Cases
- Source == destination → zero-length success or friendly message.
- Only inaccessible path exists with accessibility on → explain failure; suggest relaxing prefs.
- Graph data stale → admin-visible health; user sees best effort.

### Permissions
Any authenticated or guest session may request routes; rate-limit abuse.

### Dependencies
Graph store; hazard/crowd/event services; routing engine; optional predictor.

### Acceptance Criteria
- [ ] Valid OD pair returns steps with distance and ETA.
- [ ] Blocked corridor does not appear in path when alternative exists.
- [ ] Accessibility preference changes path when alternatives exist.
- [ ] Response includes enough data for map polyline + turn list + AR.

### Future Enhancements
Multi-stop, outdoor bike, weather weights, learning from completed trips.

---

## F-05 Turn-by-turn navigation (non-AR)

### Purpose
Guide users when AR is unavailable or undesired.

### Description
Sequential instructions (distance, turn type, landmark if available), progress along route, recalculate control, mute/voice option, cancel navigation.

### Business Rules
- Advance step when user proximity to waypoint within threshold OR manual next (demo mode).
- Recalculate preserves destination; updates source to current position/node.
- Cancel returns to map/search without corrupting admin state.

### Edge Cases
- User walks off route → prompt recalculate.
- GPS jump → debounce; don’t thrash steps.
- Background tab → pause aggressive GPS if policy requires.

### Permissions
All navigators.

### Dependencies
F-04; geolocation; optional TTS.

### Acceptance Criteria
- [ ] User can follow route to arrival without AR.
- [ ] Recalculate refreshes instructions.
- [ ] Arrival triggers completion state.

### Future Enhancements
Lane-level / corridor-level instructions, photo landmarks.

---

## F-06 Web AR guidance

### Purpose
Overlay directional guidance on the live camera for spatial alignment.

### Description
Camera view + directional arrow/cue + optional 3D guide doll; device orientation when permitted; fallback to relative/timed cues if sensors denied.

### Business Rules
- Camera permission optional; deny → fallback UI with clear CTA to enable or use map nav.
- Orientation permission optional; deny → non-compass mode.
- Does not claim centimeter ARCore accuracy in V1 marketing.

### Edge Cases
- iOS Safari orientation quirks → document supported browsers.
- Low light / covered lens → still show HUD instructions.
- Rapid spinning device → smooth heading filter.

### Permissions
All users; camera is device permission.

### Dependencies
F-04/F-05; DeviceOrientation; WebGL/Three for doll.

### Acceptance Criteria
- [ ] With camera+orientation, cue roughly aligns to next waypoint bearing.
- [ ] Without permissions, user can still complete navigation via fallback.
- [ ] No hard crash on permission denial.

### Future Enhancements
VPS / marker anchors, native ARKit/ARCore apps.

---

## F-07 Guide doll (avatar)

### Purpose
Provide nonverbal motion cues (walk, pre-turn wave, arrival celebrate) and personalization.

### Description
User selects male/female presentation; avatar animates based on navigation state: walking on straight segments, waving before turns, celebrating on arrival.

### Business Rules
- Preference persisted for registered users; local storage for guests.
- Wave triggers within configurable distance/time before turn instruction.
- Does not replace textual/spoken instructions for accessibility of meaning.

### Edge Cases
- Missing 3D assets → hide doll, keep arrow/text.
- Reduced motion OS setting → simplify or disable animations.

### Permissions
All navigators.

### Dependencies
F-06; animation assets; preference store.

### Acceptance Criteria
- [ ] Gender choice switches avatar.
- [ ] Walk vs wave vs celebrate states observable at correct journey phases.
- [ ] Arrival shows celebrate + success UI.

### Future Enhancements
More outfits, campus mascot, signing gestures for Deaf users.

---

## F-08 Live crowd & IoT simulation

### Purpose
Demonstrate smart-campus sensing and feed routing/twin without physical sensors in V1.

### Description
Simulator (or future MQTT bridge) publishes crowd and sensor readings on an interval; clients subscribe via WebSocket; admin can start/stop/tick.

### Business Rules
- Simulator diurnal patterns are deterministic enough for demos.
- Live crowd updates edge costs used by routing when configured.
- Public read of aggregated crowd OK; raw admin controls restricted.

### Edge Cases
- Simulator off → UI shows stale/last-known or “live offline”.
- Burst reconnects → clients resync snapshot then diffs.

### Permissions
Status/sensors read: authenticated or public aggregate; start/stop: admin.

### Dependencies
WebSocket hub; edge crowd fields; admin IoT UI.

### Acceptance Criteria
- [ ] With simulator on, map/twin colors change within one tick.
- [ ] Admin can stop simulator; status reflects state.
- [ ] Routing can consume live crowd values.

### Future Enhancements
Real MQTT devices, calibration, sensor health dashboard.

---

## F-09 Predictive crowd (toggle)

### Purpose
Bias routes away from corridors predicted to become congested.

### Description
When `usePrediction` (or equivalent) is on, routing applies predicted occupancy weights in addition to live crowd; when off, use live/reactive only.

### Business Rules
- Prediction is advisory cost, not a hard block unless combined with hazard rules.
- Model version / method exposed in metadata for transparency (“EWMA schedule” in V1).
- Toggle default: off or on per campus policy (document choice: **default on for demos, off for conservative campuses** — **Assumption: default off for production V1, on for demo seed**).

### Edge Cases
- No history → fall back to live only; don’t fail route.
- Conflicting live vs predicted → weighting strategy in AI Routing doc wins.

### Permissions
All users may toggle; admin may set campus default later.

### Dependencies
Predictor service; F-04; F-08 optional.

### Acceptance Criteria
- [ ] Toggle changes response metadata and can change path on congested graphs.
- [ ] Failure of predictor does not hard-fail routing.

### Future Enhancements
LSTM/sequence models, event calendars as features.

---

## F-10 Digital Twin view

### Purpose
Give operators and stakeholders a live 3D operational picture.

### Description
3D campus representation (extruded/simple mesh buildings + path network) colored by live crowd; optional hazard markers; link from map/admin.

### Business Rules
- Twin is visualization, not a second source of truth — data from same APIs/WS as map.
- Performance: target interactive FPS on mid-tier laptop; degrade geometry if needed.

### Edge Cases
- WebGL unavailable → message + link to 2D map.
- Large graphs → LOD / hide labels until zoom.

### Permissions
Read: logged-in recommended; admin features separately. **Assumption: twin readable by any authenticated user in V1.**

### Dependencies
F-08; Three.js or equivalent; campus geometry.

### Acceptance Criteria
- [ ] Twin loads and shows buildings/paths.
- [ ] Live updates visible when WS connected.
- [ ] Navigation CTAs can deep-link to navigate with context where designed.

### Future Enhancements
Floor-level twin, what-if simulation, digital twin edit tools.

---

## F-11 Hazards, construction, blocked paths

### Purpose
Keep people out of unsafe or closed areas and keep the graph honest.

### Description
Admin creates hazards (type, geometry/radius, severity, active window). System marks edges blocked or high-cost. Construction and temporary closures supported. Map and routing honor state.

### Business Rules
- **Fire / active emergency:** hard avoid (infinite or extreme cost); prefer emergency egress routes when in emergency mode.
- **Construction:** hard block or strong penalty per type.
- **Crowding alone:** soft penalty, not hard block.
- Time-bounded hazards auto-expire or require admin clear.

### Edge Cases
- Hazard blocks all paths → NO_ROUTE + safety messaging.
- Overlapping hazards → take max severity.
- User already inside hazard → route out, don’t strand.

### Permissions
Create/update: admin (security role V2); read: all.

### Dependencies
Hazard store; routing cost layer; map/twin render.

### Acceptance Criteria
- [ ] Active construction removes/penalizes affected edges in routes.
- [ ] Hazards visible on map with type.
- [ ] Expired hazards stop affecting routes.

### Future Enhancements
Auto-ingest from work-order systems; geofenced push alerts.

---

## F-12 SOS & emergency contacts

### Purpose
Provide a panic pathway and discoverable help resources.

### Description
SOS control captures approximate location + user id (if any) + timestamp; stores alert; shows confirmation and emergency contacts / exits list. V1 does **not** guarantee SMS/dispatch SLA.

### Business Rules
- SOS always available during navigation and on Safety page.
- Duplicate SOS within short window → coalesce or rate-limit with message.
- Contacts are campus-configured, not hardcoded vendor numbers in client only.

### Edge Cases
- No GPS → still submit with last known / manual building.
- Offline → queue locally and warn “will send when online” if implemented; else fail clearly.

### Permissions
Any user may SOS; admin/security view alerts (V1: admin analytics/logs).

### Dependencies
Safety APIs; contacts/exits data; optional notification backend (future).

### Acceptance Criteria
- [ ] SOS creates durable alert record.
- [ ] User sees confirmation and contacts.
- [ ] Guest can SOS.

### Future Enhancements
Twilio/SMS, campus security console, silent SOS, share live location.

---

## F-13 Admin console & routing weights

### Purpose
Operate the organization’s navigation system without engineering deploys. Entry: **Administrator Login** only.

### Description
Organization Admin Dashboard: profile/branding, visual map editor (nodes/edges—no manual coordinates), buildings/floors, categories/landmarks/zones, navigation policies, safety, QR, analytics, user management, content (announcements/events/alerts), map settings, routing weights, IoT simulator (when enabled).

Catalog: [admin-dashboard-features.md](./admin-dashboard-features.md), [node-management.md](./node-management.md), [organization-management.md](./organization-management.md).

### Business Rules
- Guests cannot access any admin surface.
- All mutations org-scoped and audited (who/when) — **Assumption: audit log V1 minimal (DB timestamps + user id); full audit trail expands with NaaS.**
- Weights normalized or validated to sane ranges.
- Destructive deletes guarded (confirm).
- Nodes created via map click; paths via select A → select B → Create Path.

### Edge Cases
- Invalid geometry → reject with validation errors.
- Weight extremes (0 distance) → reject or warn.
- Admin of org A calling org B APIs → 403.

### Permissions
Organization Admin (own org) only; Super Admin future for support. See [role-permissions.md](./role-permissions.md).

### Dependencies
Auth + membership; repositories; analytics; branding storage.

### Acceptance Criteria
- [ ] Admin can adjust weights and observe route behaviour change.
- [ ] Visual CRUD for nodes/edges works without lat/lng text entry.
- [ ] Non-admin / guest forbidden on admin APIs.
- [ ] Branding and QR manageable from dashboard.

### Future Enhancements
Draft/publish workflow, operator role, department QR, change review.

---

## F-14 Analytics

### Purpose
Prove value and inform campus planning.

### Description
Aggregates: search volume, popular destinations, route counts, optional SOS counts, active sessions proxies.

### Business Rules
- PII minimized in aggregates.
- Admin-only dashboards.

### Edge Cases
- Empty campus → zeros, not errors.

### Permissions
Admin.

### Dependencies
Event logging from search/route/SOS.

### Acceptance Criteria
- [ ] Dashboard loads with summary metrics for seeded activity.
- [ ] Student cannot access analytics API.

### Future Enhancements
Funnels, cohort retention, heatmaps export, BI connect.

---

## F-15 Voice instructions

### Purpose
Reduce eyes-down walking.

### Description
Optional TTS of current/next instruction; mute control; respects OS voice settings where possible.

### Business Rules
- Off by default or last user preference.
- Does not speak over SOS confirmation critically — pause TTS on SOS.

### Edge Cases
- Browser without speechSynthesis → hide or disable gracefully.
- Language mismatch → English V1 default (**Assumption**).

### Permissions
All navigators.

### Dependencies
F-05; Web Speech API.

### Acceptance Criteria
- [ ] With voice on, step changes produce speech.
- [ ] Mute stops further utterances.

### Future Enhancements
Multilingual, Bluetooth headset optimizations, earcon for hazards.

---

## F-16 Arrival experience

### Purpose
Close the loop clearly so users stop navigating and feel success.

### Description
Detect arrival (near destination node / final step complete); show success UI; doll celebrate; offer done / new destination.

### Business Rules
- Arrival radius configurable (e.g. 15–25 m outdoors).
- Don’t auto-restart navigation.

### Edge Cases
- GPS oscillates across radius → hysteresis so success doesn’t flicker.

### Permissions
All.

### Dependencies
F-05/F-06/F-07.

### Acceptance Criteria
- [ ] Arrival shows success state once per journey.
- [ ] User can dismiss and search again.

### Future Enhancements
Check-in to class, rate route quality.

---

## Could Have (brief)

| ID | Feature | Spec note |
|----|---------|-----------|
| F-17 | Night mode routing | Prefer edges tagged well-lit after dusk; needs lighting attributes |
| F-18 | Favorites | Save places to profile |
| F-19 | Share link | Encoded destination deep link |
| F-20 | Offline cache | Last campus graph snapshot |

---

## Spec traceability

| Feature | Primary stories |
|---------|-----------------|
| F-01 | US-A1–A3 |
| F-02 | US-B1–B2 |
| F-03 | US-B3–B4 |
| F-04 | US-C1–C4 |
| F-05 | US-C5–C6 |
| F-06–F-07 | US-D1–D5 |
| F-08–F-10 | US-F1–F2, US-G4 |
| F-11–F-12 | US-E1–E4 |
| F-13–F-14 | US-G1–G5 |
| F-15–F-16 | US-C6, US-D5 |
