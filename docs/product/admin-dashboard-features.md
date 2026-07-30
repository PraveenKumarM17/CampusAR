# Admin Dashboard Features — Organization Administrator

**Status:** Product catalog for NaaS org admins  
**Entry:** Email + password only ([`login-experience.md`](./login-experience.md))  
**Permissions:** [`role-permissions.md`](./role-permissions.md)

---

## 1. Purpose

The Admin Dashboard is the **configuration surface** for one organization’s navigation system. Guests never see it. Admins manage graph, brand, safety, QR, users, content, and analytics without developer involvement.

---

## 2. Organization management

| Feature | Description |
|---------|-------------|
| Organization profile | Display name, description, address, timezone |
| Logo upload | Light/dark variants |
| Branding / theme colors | Primary, accent, surfaces (CSS tokens) |
| Splash / welcome message | Guest landing copy |
| Contact details | Public phone, email, security desk |
| Map settings | Default center/zoom, allowed basemap styles, bounding box |
| Opening hours (org-level) | Optional published hours |

Detail: [`organization-management.md`](./organization-management.md).

---

## 3. Map management

| Feature | Description |
|---------|-------------|
| Visual node editor | Click map → create/edit/delete nodes (no manual coordinates) |
| Edge / path editor | Select two nodes → create/remove path |
| Category manager | Define place types and default icons |
| Landmark manager | Highlight landmarks (may be node subtype or overlay) |
| Zone manager | Safety zones, geofenced regions |
| Building manager | Create/edit buildings |
| Floor manager | Floors per building; future floorplan attach |

Workflows: [`node-management.md`](./node-management.md), [`../architecture/map-editor.md`](../architecture/map-editor.md).

---

## 4. Navigation management

| Feature | Description |
|---------|-------------|
| Default routes | Preferred OD hints or weight presets for normal mode |
| Restricted routes | Edges/nodes disallowed for general guests (staff corridors) |
| Accessible routes | Tag step-free network; drive accessibility preference |
| Emergency routes | Prefer exits / assembly connectivity under emergency mode |

Guests **consume** these policies; only admins **configure** them.

---

## 5. Safety management

| Feature | Description |
|---------|-------------|
| Hazards | Typed, severity, geometry/time window |
| Blocked paths | Hard-block edges |
| Construction zones | Temporary high-cost or blocked regions |
| Temporary closures | Scheduled open/close |
| Emergency exits | Marked egress |
| Safe assembly points | Muster locations for emergency nav |

---

## 6. QR management

| Feature | Description |
|---------|-------------|
| Generate QR | Org root and optional destination |
| Download QR | PNG/SVG for print |
| Regenerate QR | Rotate token; remap campaigns |
| Department-specific QR | **Future** — per building/dept campaigns |

Architecture: [`../architecture/qr-navigation.md`](../architecture/qr-navigation.md).

---

## 7. Analytics

| Metric / view | Intent |
|---------------|--------|
| Visitor count | Guest sessions / unique rough counts |
| Popular destinations | Top chosen nodes |
| Navigation heatmaps | Edge/node usage intensity |
| Frequently searched locations | Search funnel |
| Peak hours | Temporal load |
| Route usage statistics | Completed vs abandoned nav |

Org-scoped only. No cross-tenant raw data.

---

## 8. User management

| Feature | Description |
|---------|-------------|
| Invite admins | Email invite → membership |
| Assign roles | Org admin (and future operator/viewer) |
| Remove admins | Revoke membership; invalidate sessions |
| Audit logs | Who changed graph, branding, safety, IAM |

Guests are not “users” in this list.

---

## 9. Content management

| Feature | Description |
|---------|-------------|
| Organization announcements | Guest-visible banners |
| Events | Time-bounded notices / map hints |
| Notices | General published info |
| Emergency alerts | High-priority guest-facing alerts |

Guests read published items; admins author them.

---

## 10. Future integrations (admin configuration hooks)

| Integration | Admin expectation (when entitled) |
|-------------|-------------------------------------|
| BLE | Beacon zones / calibration entry points |
| IoT sensors | Enable ingest, health status |
| MQTT | Broker mapping (platform-assisted) |
| Digital Twin | Twin visibility / layer toggles |
| AI crowd prediction | Enable predictive routing toggle for guests |

These do not change the Guest vs Admin login model.

---

## 11. Capabilities checklist (admin must be able to)

Manage organization profile · Upload logo · Configure branding · Manage buildings · Manage floors · Create / edit / delete navigation nodes · Create / remove paths · Name nodes · Assign categories · Configure search keywords/aliases · Configure accessibility · Add landmarks · Add safety zones · Add hazards · Configure emergency exits · Generate QR codes · View analytics · Manage organization users · Configure map settings · (plus navigation policies, content, audit as above)

---

## 12. Acceptance

- [ ] Unauthenticated requests to dashboard APIs fail.  
- [ ] Admin of Org A cannot mutate Org B.  
- [ ] Guest feature set remains available for “preview as guest” from dashboard (optional).  
