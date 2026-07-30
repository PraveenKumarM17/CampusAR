# 5. Feature List (MoSCoW) — CampusAR V1

Prioritization principle: ship a **complete navigation loop** (discover → route → guide → arrive) with **operable admin** and **credible safety hooks**, without blocking on hardware IoT or native AR stores.

---

## Must Have (V1)

| Feature | Why Must Have |
|---------|----------------|
| Guest access (Continue as Guest) — primary CTA | Majority are visitors; no account wall |
| Organization admin login (email/password) | Only admins configure the system |
| Campus search & place listing | Top of funnel |
| Map with source/destination selection | Spatial mental model |
| A* / composite-cost routing | Core differentiator vs static maps |
| Accessibility preferences | Inclusion + institutional requirement posture |
| Navigate turn-by-turn UI | Completes guidance without AR dependency |
| Blocked edges & basic hazard impact | Safety credibility |
| Admin Dashboard + route weights + hazard CRUD | Product must be operable |
| REST API + auth | Multi-client foundation |
| Seeded demo campus | Sales/demo and QA without survey delay |
| Arrival confirmation | Journey closure |

---

## Should Have (V1)

| Feature | Why Should Have |
|---------|-----------------|
| Web AR camera mode | Flagship differentiator; paper alignment |
| Compass-aligned AR cues | Makes AR usable |
| Guide doll (gender + walk/wave/celebrate) | Engagement + nonverbal turn cues |
| Live crowd simulation + WebSocket | Proves “smart campus” without hardware |
| Predictive crowd toggle | Demoable AI story; LSTM-ready |
| Digital Twin page | Admin wow + ops narrative |
| SOS logging | Safety narrative (even if not full dispatch) |
| Analytics dashboard | Buyer metrics |
| Voice TTS | Hands-light walking |
| Periodic recalculation | Live campus behaviour |

---

## Could Have (V1 if capacity)

| Feature | Why Could Have |
|---------|----------------|
| Night-mode routing preference (prefer lit paths) | Valuable; needs richer lighting data |
| Multilingual UI/TTS | High value for diversity campuses; translation cost |
| Save favorite destinations | Convenience; not required for V1 loop |
| Share route link | Viral/visitor utility |
| Offline cached last map tiles | Resilience; complex |
| Advanced analytics exports (CSV) | Nice for admins |
| Richer building floor switcher UX | Helps indoor; graph may be thin in V1 |

---

## Won’t Have (V1)

| Feature | Why Won’t Have (yet) |
|---------|----------------------|
| Production BLE trilateration | Needs hardware survey & calibration |
| MQTT device fleet management | Ops product of its own |
| Production LSTM training pipeline | Needs weeks of labeled occupancy |
| Unity/ARCore Play Store release | Separate mobile program |
| Real emergency CAD/SMS SLA | Legal & vendor integrations |
| Multi-campus SaaS tenancy (full marketplace) | Platform track is specified; shipping tenancy is V1.5–V2 — see [multi-tenancy.md](./multi-tenancy.md) |
| Driving / transit multimodal | Walking-first campus product |
| Payment / bookings | Dilutes V1 focus |
| Social feeds / chat | Out of scope |

---

## Priority rationale summary

Must Have protects the **minimum lovable navigation product**.  
Should Have creates **demo differentiation** aligned to the research vision.  
Could Have improves polish if the critical path is green.  
Won’t Have prevents the classic campus-project failure mode: boiling the ocean with IoT/ML/mobile before the software loop works.
