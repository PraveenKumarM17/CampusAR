# 13. Success Metrics — CampusAR

Metrics define whether V1 is working as a **product**, not only a demo.  
**Assumption:** Analytics events exist for search, route, navigate start, arrive, SOS, admin mutations.

---

## Users

| KPI | Definition | V1 target (pilot) |
|-----|------------|-------------------|
| WAU | Weekly active users (any session with ≥1 route or search) | Trend up week-over-week during term |
| Guest conversion | Guests who later register | Informational; no hard gate |
| D1 retention | Users who return next day | Baseline then +10% after UX fixes |
| Role coverage | ≥1 admin + student cohorts active | Required for pilot |

---

## Navigation

| KPI | Definition | V1 target |
|-----|------------|-----------|
| Route success rate | Routes returned OK / requests | ≥ 95% on seeded campus |
| Arrival rate | Arrivals / navigate starts | ≥ 70% (GPS noise tolerant) |
| Recalculate rate | Recalculates / navigate session | Monitor; spike may mean unstable costs |
| Accessible route success | OK routes with accessibility on | ≥ 90% for tagged accessible OD pairs |
| Time-to-first-route | Open → first route preview | < 30 s median for familiar users |

---

## Performance

| KPI | Definition | V1 target |
|-----|------------|-----------|
| Route API p95 latency | Server route compute | < 300 ms on pilot graph |
| Search p95 | Place search | < 200 ms |
| Map time-to-interactive | Campus map usable | < 3 s on mid phone / Wi-Fi |
| Twin interactive FPS | While idle orbit | ≥ 30 FPS laptop target |

---

## Reliability

| KPI | Definition | V1 target |
|-----|------------|-----------|
| API uptime (pilot window) | Successful health checks | ≥ 99% weekly |
| WS disconnect rate | Clients dropping unexpectedly | Investigate if > 5% sessions |
| Error rate 5xx | Server errors / requests | < 1% |
| Client crash-free sessions | Soft: no unhandled fatal | Improve toward 99% |

---

## Admin usage

| KPI | Definition | V1 target |
|-----|------------|-----------|
| Active admins | Admins with ≥1 mutation / month | ≥ 1 named owner |
| Hazard freshness | Open hazards with stale end dates | 0 overdue |
| Weight changes | Documented policy edits | As needed; audited |
| Twin sessions | Admin twin views / week | Used in weekly ops review |

---

## Safety

| KPI | Definition | V1 target |
|-----|------------|-----------|
| Hazard-aware diversion | Test OD diverted when corridor blocked | 100% on QA fixtures |
| SOS submit success | SOS persisted / attempts | ≥ 99% when online |
| Median SOS ack time | Admin ack – create (V2 console) | Define in V2 |
| False expectation incidents | Complaints that “security didn’t get SMS” | 0 — prevented by copy |
| Emergency route correctness | Fire QA scenarios | 100% hard-avoid |

---

## North-star (product)

**Successful guided arrivals per week** — users who started navigation and reached arrival confirmation.

This balances acquisition (searches) with value delivery (arrivals) better than raw downloads.

---

## Instrumentation notes

- Prefer event names stable across versions: `search`, `route_ok`, `route_fail`, `nav_start`, `nav_recalc`, `nav_arrive`, `sos`, `admin_mutation`.  
- Tag with `prediction_on`, `accessibility_on`, `client=ar|map`.  
- No precise continuous tracking trails in V1 analytics (**Assumption: store events, not full GPS polylines**).
