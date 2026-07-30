# 16. Empty States — CampusAR

Pattern: **Illustration (optional) + Title + One sentence + Primary CTA (+ Secondary)**.  
Tone: calm, specific, actionable. No blame.

---

## No GPS

| | |
|--|--|
| **Where** | Map / Navigate setup |
| **Title** | Location unavailable |
| **Body** | Choose your starting point on the map to continue. |
| **Primary** | Pick start on map |
| **Secondary** | How to enable location |

---

## No Internet

| | |
|--|--|
| **Where** | Global banner + page |
| **Title** | You’re offline |
| **Body** | Connect to the internet to search and calculate routes. Mid-trip: we’ll keep your current directions when possible. |
| **Primary** | Retry connection |
| **Secondary** | View Safety contacts (if cached) |

---

## No Route

| | |
|--|--|
| **Where** | Preview / Navigate |
| **Title** | No walkable route |
| **Body** | Reason-specific: blocked paths, accessibility filters, or disconnected areas. |
| **Primary** | Change start/end |
| **Secondary** | Adjust accessibility prefs · View hazards |

Use `error.code` to pick body variant.

---

## No Results

| | |
|--|--|
| **Where** | Search panel |
| **Title** | No places found |
| **Body** | Try another name, code, or browse categories. |
| **Primary** | Clear search |
| **Secondary** | Browse categories |

---

## No Permissions (camera / motion)

| | |
|--|--|
| **Where** | AR gate |
| **Title** | Camera access needed for AR |
| **Body** | You can keep using map navigation with full turn-by-turn steps. |
| **Primary** | Enable camera |
| **Secondary** | Continue with map |

Motion-only missing: title “Compass unavailable” — still allow AR text mode or map.

---

## No Sensors / live data

| | |
|--|--|
| **Where** | Map crowd layer / Twin |
| **Title** | Live crowd unavailable |
| **Body** | Routing still works. Heat overlay will appear when live data connects. |
| **Primary** | Dismiss |
| **Chip** | Offline (not Simulated) |

If simulator off intentionally: “Live sensors paused” + Admin-only Start sim.

---

## Server Down

| | |
|--|--|
| **Where** | Full page or banner |
| **Title** | CampusAR is temporarily unavailable |
| **Body** | We’re having trouble reaching the server. Try again shortly. |
| **Primary** | Retry |
| **Secondary** | Safety contacts (static fallback list if bundled) |

---

## Positive empties

| Context | Copy |
|---------|------|
| No active hazards | “No active hazards — campus looks clear.” |
| Analytics zero | “No journeys yet — traffic will show up after people start navigating.” |
| Admin empty table | “Nothing here yet” + Create |

---

## Visual rules

- One simple line illustration max  
- Same EmptyState component  
- Never empty white void without CTA on critical flows  
