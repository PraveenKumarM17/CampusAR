# 9. Page Specifications — CampusAR

For each page: purpose, actions, widgets, nav, permissions, and states.

---

## Landing

| | |
|--|--|
| **Purpose** | Brand entry; choose guest or auth |
| **Primary actions** | Continue as guest; Sign in |
| **Secondary** | Create account |
| **Widgets** | Wordmark, headline, one sentence, CTA group, full-bleed visual |
| **Navigation** | → Map (guest), → Login, → Register |
| **Permissions** | Public |
| **Loading** | Minimal splash brand |
| **Error** | N/A content; if app config fail → full-page unavailable |
| **Empty** | N/A |
| **Offline** | Banner: limited; guest explore may fail on data |

---

## Login

| | |
|--|--|
| **Purpose** | Authenticate |
| **Primary** | Sign in |
| **Secondary** | Register, Continue as guest, Back |
| **Widgets** | Email, password, submit, error alert |
| **Permissions** | Public |
| **Loading** | Button loading |
| **Error** | Inline invalid credentials |
| **Empty** | N/A |
| **Offline** | Disable submit + message |

---

## Register

Same structure as Login with confirm password; success → Map (session) or Login.

---

## Map

| | |
|--|--|
| **Purpose** | Discover places; set OD; see crowd/hazards |
| **Primary** | Search select destination; Route |
| **Secondary** | Category filter; set source; layers; open place; Twin link |
| **Widgets** | MapCanvas, Search, chips, Legend, StatusChip, OD sheet, MapControls |
| **Navigation** | Rail/tabs; → Navigate with session |
| **Permissions** | Guest+ |
| **Loading** | Skeleton map + shimmer search |
| **Error** | Basemap fail banner; search error toast |
| **Empty** | No results state in panel |
| **Offline** | Cached last frame if any; else empty map + offline |

---

## Navigate

| | |
|--|--|
| **Purpose** | Turn-by-turn guidance without requiring AR |
| **Primary** | Follow steps; End |
| **Secondary** | Voice toggle; Recalculate; Open AR; SOS |
| **Widgets** | Route map, Instruction card, ETA/distance, badges, progress |
| **Permissions** | Guest+; needs OD |
| **Loading** | Calculating route skeleton |
| **Error** | NO_ROUTE panel; recalc fail toast keep old |
| **Empty** | No active route → CTA go to Map |
| **Offline** | Continue with last route + offline chip; block recalc |

---

## AR

| | |
|--|--|
| **Purpose** | Camera-aligned guidance + avatar |
| **Primary** | Follow AR cues |
| **Secondary** | Exit to Navigate; mute; SOS; avatar prefs via settings |
| **Widgets** | See AR experience doc |
| **Permissions** | Guest+; camera optional |
| **Loading** | Permission gates then camera init |
| **Error** | Permission denied → Navigate CTA |
| **Empty** | No route → Map |
| **Offline** | Same as Navigate; HUD warns live stale |

---

## Digital Twin

| | |
|--|--|
| **Purpose** | Live 3D ops view |
| **Primary** | Orbit/inspect heat & hazards |
| **Secondary** | Toggle layers; reset camera; Navigate CTA |
| **Widgets** | TwinViewport, toolbar, legend, StatusChip |
| **Permissions** | Guest/user per flag; no mutations |
| **Loading** | 3D skeleton / progress |
| **Error** | WebGL fallback page |
| **Empty** | No campus geometry message |
| **Offline** | Stale twin + reconnect |

---

## Safety

| | |
|--|--|
| **Purpose** | Hazards visibility, contacts, SOS |
| **Primary** | SOS (confirm); Call contact (tel:) |
| **Secondary** | View hazard detail on map deep link |
| **Widgets** | SOS button, hazard list, exits, contacts |
| **Permissions** | Guest+ |
| **Loading** | List skeletons |
| **Error** | Load fail + retry |
| **Empty** | “No active hazards” (positive empty) |
| **Offline** | Show cached contacts if present; SOS fails clearly |

---

## Admin hub & subpages

| | |
|--|--|
| **Purpose** | Operate campus digital twin data |
| **Primary** | Enter section; Save entities |
| **Secondary** | Delete with confirm; Start/stop sim |
| **Widgets** | Admin widgets library |
| **Permissions** | Admin only |
| **Loading** | Table skeletons |
| **Error** | 403 page; validation inline; 500 toast |
| **Empty** | Empty tables with Create CTA |
| **Offline** | Read-only message; block saves |

---

## Analytics

| | |
|--|--|
| **Purpose** | Summaries for admins |
| **Primary** | Read charts |
| **Secondary** | Date range (if available) |
| **Permissions** | Admin |
| **Loading** | Chart skeletons |
| **Error** | Retry |
| **Empty** | Zero-state “No traffic yet” |
| **Offline** | Error |

---

## Settings

| | |
|--|--|
| **Purpose** | Theme, a11y routing, voice, avatar, prediction preference |
| **Primary** | Toggle prefs (auto-save or Save) |
| **Secondary** | Links to Safety |
| **Permissions** | Guest (local); User (persist) |
| **Loading** | Brief |
| **Error** | Save failed toast |
| **Empty** | N/A |
| **Offline** | Local prefs OK; server sync queues/fails |

---

## Profile

| | |
|--|--|
| **Purpose** | Identity + logout / register CTA |
| **Primary** | Log out / Create account |
| **Permissions** | All |
| **States** | Guest vs user layouts |

---

## Global chrome rules

- StatusChip on immersive + admin pages when live data matters  
- SOS reachable from Navigate, AR, Safety (not every admin form)  
- Back targets: AR → Navigate → Map  
