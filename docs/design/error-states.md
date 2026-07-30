# 17. Error States — CampusAR

Errors use the shared **ErrorState** / inline alert / toast patterns. Prefer **recoverable** messaging. Pair with API `error.code` when present.

---

## GPS denied

| | |
|--|--|
| **Code / cause** | Permission denied |
| **Surface** | Banner + sheet |
| **Title** | Location permission off |
| **Body** | Enable location in browser settings, or pick your start on the map. |
| **Actions** | Pick start · Browser help link |
| **Severity** | Warning |

---

## Location unavailable

| | |
|--|--|
| **Cause** | Timeout / position error |
| **Title** | Can’t get a GPS fix |
| **Body** | Move outdoors or select your location manually. |
| **Actions** | Retry · Pick start |
| **Severity** | Warning |

---

## Authentication expired

| | |
|--|--|
| **Code** | `UNAUTHORIZED` |
| **Title** | Session expired |
| **Body** | Sign in again to continue. Your guest navigation still works for public routes. |
| **Actions** | Sign in · Continue as guest |
| **Where** | Toast + redirect barrier on admin; soft on public |

---

## Network timeout

| | |
|--|--|
| **Title** | Request timed out |
| **Body** | Check your connection and try again. |
| **Actions** | Retry |
| **Severity** | Danger/info toast on non-critical; panel on route calculate |

---

## Route failed

| | |
|--|--|
| **Codes** | `NO_ROUTE`, `VALIDATION_ERROR`, `INVALID_NODE` |
| **Title** | Couldn’t build a route |
| **Body** | Map code → human reason (see empty No Route variants). |
| **Actions** | Edit endpoints · Relax prefs · View hazards |
| **Severity** | Warning panel (not silent toast only) |

---

## Server unavailable

| | |
|--|--|
| **Codes** | `INTERNAL`, `SERVICE_UNAVAILABLE` |
| **Title** | Something went wrong on our side |
| **Body** | Try again. If it continues, check status with campus IT. |
| **Actions** | Retry |
| **Severity** | Danger |
| **Note** | Include `requestId` in small caption for support |

---

## Admin-specific errors

| Case | UI |
|------|-----|
| Validation | Inline field errors; focus first invalid |
| Forbidden | Full page 403 — “You don’t have access” → Map |
| Conflict | Toast + refresh form |
| IoT control fail | Toast; leave prior running state truthful |

---

## SOS errors

| Case | UI |
|------|-----|
| Offline | Dialog error: use phone contacts listed beneath |
| Server fail | “Couldn’t record alert — call security” + contacts |
| Rate limit | “Alert already sent — contact security if you still need help” |

Never imply success when persistence failed.

---

## AR errors

| Case | UI |
|------|-----|
| getUserMedia fail | Permission empty → map CTA |
| WebGL doll fail | Hide doll; keep HUD; silent |
| Orientation fail | Banner compass unavailable |

---

## Presentation matrix

| Severity | Component |
|----------|-----------|
| Inline field | Form error text |
| Recoverable page | ErrorState / Banner |
| Transient | Toast |
| Blocking auth | Dialog / dedicated page |
| Safety critical fail | Dialog + contacts |

---

## Copy principles

- No stack traces in UI  
- No “Unexpected error” without Retry  
- Prefer verbs: “Try again”, “Pick start”, “Sign in”  
- Match product honesty on safety  
