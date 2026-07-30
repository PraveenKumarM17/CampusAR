# Guest Experience — Visitor Navigation

**Status:** Product refinement for NaaS  
**Related:** [`login-experience.md`](./login-experience.md), [`role-permissions.md`](./role-permissions.md), [`../architecture/qr-navigation.md`](../architecture/qr-navigation.md)

---

## 1. Who is a guest

Anyone using an organization’s public URL or QR **without** administrator credentials. Includes visitors, students, employees, patients, and attendees. Guest is the **primary** product experience.

Guests are bound to one `organizationId` for the session. They never manage another organization’s data.

---

## 2. Guest journey (canonical)

```text
Scan QR → Open Organization → Continue as Guest → Allow Location
  → Organization Map → Search / Nearby → Route preview → Navigate
  → (optional) AR / Accessibility / Emergency path → Arrive
```

Account creation is never required.

---

## 3. Features guests CAN use

| Capability | Notes |
|------------|--------|
| Scan QR / open org slug | Lands on correct tenant |
| Continue as Guest | Primary entry |
| View organization map | Org-branded basemap |
| Live GPS locate & track | Snap to org graph |
| Search destinations | Name, category, aliases — public nodes only |
| Route preview | Multi-criteria preview before start |
| Turn-by-turn navigation | Map guidance |
| Nearby places | From current snap / pose |
| AR navigation | If org entitlement enables AR |
| Emergency navigation | Prefer exits / emergency routes when in emergency mode |
| Accessibility routes | Step-free / accessibility preference |
| Share current location | Link or native share sheet (coarse/org-safe) |
| Report map issue | Lightweight feedback to org (not admin UI) |
| Switch map style | Satellite / hybrid / streets (per org settings) |
| Organization information | About, contacts as published |
| Opening hours | If org/node provides them |
| Safety read | Exits, contacts, visible hazard notices |
| SOS / emergency alert | Create SOS event (org-scoped); no admin console |

---

## 4. Features guests MUST NOT access

| Forbidden | Why |
|-----------|-----|
| Admin Dashboard | Configuration privilege |
| Visual map editor | Graph mutation |
| Node / edge / building / floor CRUD | Tenant content ownership |
| Branding / logo / theme | Org identity |
| QR generate / regenerate | Ops control |
| Analytics dashboards | Operational data |
| User invite / roles / audit logs | IAM |
| Announcements/events/notices **authoring** | Content management (read-only of published items OK) |
| Emergency alert **broadcast authoring** | Admin/safety ops |
| Route weight / restricted-route configuration | Navigation management |
| IoT simulator / twin admin controls | Operator tools |
| Platform / super-admin surfaces | CampusAR operator only |

UI must hide these; API must reject with `403` / `FORBIDDEN_ORG`.

---

## 5. Session & privacy

| Topic | Behaviour |
|-------|-----------|
| Identity | Anonymous guest principal + `organizationId` |
| Persistence | Last destination, map style, a11y prefs in local storage — no PII required |
| Cross-org | Cannot switch to another org without new QR/URL |
| Upgrade | No forced registration; future optional “save trips” is separate |

---

## 6. Content guests may *read* (published)

- Public nodes and categories  
- Published announcements, events, notices  
- Active emergency alerts (display)  
- Org profile / opening hours / public contacts  

Draft or staff-only nodes remain invisible in search.

---

## 7. Acceptance

- [ ] Full navigate loop works with zero accounts.  
- [ ] Direct navigation to `/admin` while guest redirects or blocks.  
- [ ] Search never returns hidden/staff nodes.  
- [ ] Report-issue does not expose admin tooling.  
