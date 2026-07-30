# 12. Risks — CampusAR

---

## Technical risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| GPS inaccurate near tall buildings / indoors | Wrong node snap; failed trust | High | Snap UX + manual pick; V2 floors; V3 BLE |
| Web AR inconsistent across browsers/devices | Feature appears “broken” | High | Map-first fallback; support matrix; progressive enhancement |
| Graph data stale vs real campus | Bad routes | High | Admin tools; survey process; pilot feedback loop |
| Crowd simulator mistaken for production IoT | Buyer disappointment | Medium | Honest labeling in UI (“Simulated”); MQTT path in V2 |
| Prediction model poor / cold start | Routes worse than shortest-path | Medium | Toggle default off in prod; fallback to live; monitor |
| WebSocket scale at campus events | Stale twin/map | Medium | Snapshot + pub/sub; horizontal WS; degrade to polling |
| A* cost tuning unstable | Flickering routes | Medium | Hysteresis; weight validation; fixture tests |
| PII in analytics/SOS | Compliance incident | Medium | Minimize PII; retention policy; admin access control |
| Monorepo/delivery complexity | Slow releases | Low–Med | CI gates; clear package boundaries |

---

## Business risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Single-campus custom forever | Not a product | Medium | NaaS track V1.5–V2; org model + map editor; see [multi-tenancy.md](./multi-tenancy.md) |
| Cross-tenant data leak | Trust / legal catastrophe | Low–Med (impact Critical) | `organizationId` on all queries; isolation tests; audited platform admin |
| Editor UX too hard → stale graphs | Bad routes at scale | Medium | Click-to-create editor; templates; validation strip |
| Compared unfairly to Google Maps | Lost stakeholder buy-in | High | Position as **org-operated** private-site NaaS, safety/IoT/admin control |
| Scope creep (IoT/ML/native at once) | No shippable V1 | High | MoSCoW; Won’t Have list; phase roadmap |
| Privacy concerns (tracking users) | Adoption block | Medium | Transparent policy; guest default; aggregate analytics |
| Security liability over SOS expectations | Legal exposure | Medium | Explicit non-SLA copy; legal review before pilot |
| Weak champion at customer org | Pilot stalls | Medium | Admin persona value (editor, branding, analytics) for facilities/CIO |

---

## Operational risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| No owner for graph updates | Product decays | High | RACI: facilities + admin training |
| 24/7 expectations without staffing | Bad SOS response | Medium | Business hours policy; escalate to campus security phones |
| Demo env left open | Abuse | Medium | Auth on admin; rate limits; env separation |
| Sensor hardware delay | Roadmap slip | High | Simulator first; parallel vendor track |
| Train/exam peaks overload | Outage during critical moments | Medium | Load tests; caching; status page |

---

## Risk register usage

1. Review biweekly in product/eng sync.  
2. Any **High impact + High likelihood** needs an active mitigation owner.  
3. Pilot go-live checklist must include: support matrix, SOS disclaimer, graph owner named, incident contact tree.

---

## Top 5 watchlist (V1)

1. Graph accuracy ownership  
2. AR fallback quality  
3. SOS expectation management  
4. Scope creep into hardware ML  
5. Privacy messaging for live crowd
