# Multi-Tenancy Product Vision — CampusAR as Navigation-as-a-Service (NaaS)

**Status:** Strategic product direction (extends V1 single-campus product pack)  
**Audience:** Product, architecture, engineering, GTM  
**Rule:** This document changes *product direction*. Existing V1 single-campus docs remain valid as the **first tenant / reference deployment**; NaaS is the long-term platform.

---

## 1. Vision statement (platform)

CampusAR becomes a **Navigation-as-a-Service** platform: any private organization can create an isolated wayfinding workspace—map, graph, branding, QR entry, safety, analytics—without changing the core application.

One product. Unlimited organizations. Strict data isolation.

---

## 2. Why NaaS (problem reframed)

Single-campus apps do not scale commercially:

| Pain | Consequence |
|------|-------------|
| Every site needs custom engineering | Slow sales, high delivery cost |
| Graphs edited only by developers | Stale maps, weak admin ownership |
| No org-scoped URL / QR | Visitors cannot “land” on the right place |
| Shared branding | Product feels like a student project, not B2B SaaS |

NaaS fixes this by making **Organization** the product boundary.

---

## 3. Target markets

| Segment | Example destinations | Entry pattern |
|---------|----------------------|---------------|
| Universities / colleges | Blocks, labs, halls | QR at gates / reception |
| Corporate campuses | Buildings, meeting rooms | Lobby QR / intranet |
| Hospitals | Wards, clinics, parking | Reception / parking QR |
| Airports | Gates, lounges (outdoor/landside first) | Terminal entry |
| Malls / retail | Stores, parking, food court | Directory QR |
| Industrial / tech parks | Plants, sheds, offices | Gate security |
| Exhibition centers | Halls, stalls | Entrance QR |
| Government buildings | Wings, counters | Public lobby |

**Assumption (platform V1 of NaaS):** Outdoor + near-building walking graphs first; indoor floor plans are a phased capability per organization.

---

## 4. Product principles

1. **Tenant isolation by default** — no cross-org reads/writes.  
2. **Admin self-serve** — graphs built visually; no deploy for node edits.  
3. **Guest-first visitors** — QR → Continue as Guest → map → navigate without accounts; email/password is for **organization admins only**.  
4. **Same app binary** — org resolved by URL slug / QR token / host.  
5. **Positioning-agnostic routing** — GPS today; BLE/Wi‑Fi/SLAM/UWB later via one pose port.  
6. **Brandable shells** — logo, colors, splash, copy per org.  
7. **Progressive depth** — start outdoor; add floors, twin, IoT per tenant readiness.

---

## 5. Organization as root entity

```text
Organization
  ├── Branding & settings
  ├── Members (admins, operators, optional staff)
  ├── Places / Nodes (real-world locations)
  ├── Edges (walkable connections)
  ├── Buildings & Floors
  ├── Safety (hazards, exits, contacts)
  ├── Live overlays (crowd / sensors — optional)
  ├── Analytics events
  └── Public access (slug URL + QR)
```

Everything queryable by visitors or admins is scoped by `organizationId`.

---

## 6. Access model (product)

**Login is dual-mode and guest-first.** See [`login-experience.md`](./login-experience.md) and [`role-permissions.md`](./role-permissions.md).

| Persona | Auth | Access |
|---------|------|--------|
| **Guest (primary)** | None — “Continue as Guest” | Org public URL/QR; navigation features only |
| **Organization Admin** | Email + password **only** (admins) | Full Admin Dashboard for own org |
| **Super Admin** (future) | Privileged platform auth | Tenant lifecycle, billing, audited support access |

Optional later: org operator/security role for hazards/SOS queue without full admin.

**Product rules:**
- Guest is the default CTA; visitors never need an account to navigate.  
- Email/password is **not** a general visitor registration path.  
- Guests never access administrative functionality.  

Visitors never browse a global org directory by default (**Assumption:** discovery is QR/URL/share; marketplace listing is optional later).

---

## 7. Public entry (URL + QR)

| Mechanism | Example |
|-----------|---------|
| Path slug | `campusar.com/rnsit` |
| Subdomain (optional later) | `rnsit.campusar.com` |
| QR payload | Deep link to slug + optional campaign/utm + version |

Flow: Scan → Load org shell/branding → **Continue as Guest** → GPS → Snap → Map → Destination → Navigate.

---

## 8. Admin map editor (product must-have for NaaS)

Admins build graphs by clicking the map (**source of truth**). No manual coordinate entry.

1. Click map → create node → name, category, description, building, floor, icon, accessibility, search aliases → save  
2. Select node A → select node B → create path  
3. Edit/delete nodes and edges visually  
4. Publish / draft (**Assumption:** auto-publish for early NaaS; draft/publish later)

See [`node-management.md`](./node-management.md) and [`../architecture/map-editor.md`](../architecture/map-editor.md).

Admin capability catalog: [`admin-dashboard-features.md`](./admin-dashboard-features.md).

---

## 9. Visitor experience (guest-first)

Visitors should not need an account. Primary CTA: **Continue as Guest**.

They should be able to scan QR, open map, allow location, search, navigate, use AR, accessibility and emergency paths, share location, report issues, switch map style, and view org info/hours.

They must **not** access Admin Dashboard or graph editing.

Detail: [`guest-experience.md`](./guest-experience.md) · [`login-experience.md`](./login-experience.md).

---

## 10. Nodes as real places

Nodes are **locations**, not opaque IDs in the UX. Required product fields:

- Name, category, coordinates  
- Building, floor (optional)  
- Description, icon, keywords  
- Accessibility flags, visibility (public/hidden)  

Search uses name + keywords + category within the org only.

---

## 11. What stays the same from CampusAR V1

- Map + hybrid/satellite basemaps  
- Multi-criteria routing behaviour  
- GPS snap + recalculate  
- Safety / SOS patterns  
- Optional AR guidance  
- Clean Architecture modular monolith  

## What changes

- Single implicit campus → **many orgs**  
- Seed-as-source-of-truth → **editor-as-source-of-truth**  
- Global admin → **org-scoped RBAC** + platform admin  
- Hardcoded branding → **tenant theme**  
- Entry via app home → **slug / QR-first**  

---

## 12. Success metrics (platform)

| KPI | Intent |
|-----|--------|
| Orgs with published graph ≥ N nodes | Activation |
| Time for admin to add first navigable OD pair | Self-serve quality |
| Guest sessions started via QR | Distribution |
| Successful arrivals / nav starts per org | Value |
| Cross-tenant data incidents | Must be **zero** |
| Support tickets “can’t edit map” | Editor UX health |

---

## 13. Related docs

- Login & roles: [`login-experience.md`](./login-experience.md), [`role-permissions.md`](./role-permissions.md), [`guest-experience.md`](./guest-experience.md)  
- Admin: [`admin-dashboard-features.md`](./admin-dashboard-features.md), [`organization-management.md`](./organization-management.md), [`node-management.md`](./node-management.md)  
- Architecture: [`../architecture/multi-tenant-architecture.md`](../architecture/multi-tenant-architecture.md)  
- Domain: [`../architecture/organization-domain.md`](../architecture/organization-domain.md)  
- Map editor: [`../architecture/map-editor.md`](../architecture/map-editor.md)  
- Auth: [`../architecture/authentication-authorization.md`](../architecture/authentication-authorization.md)  
- QR: [`../architecture/qr-navigation.md`](../architecture/qr-navigation.md)  
- Branding: [`../architecture/branding-system.md`](../architecture/branding-system.md)  
- Positioning: [`../architecture/gps-abstraction.md`](../architecture/gps-abstraction.md)  
- Roadmap: [`roadmap.md`](./roadmap.md)  
