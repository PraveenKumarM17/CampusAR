# Role Permissions — Guest, Org Admin, Super Admin

**Status:** Product + authorization contract for NaaS  
**Related:** [`login-experience.md`](./login-experience.md), [`../architecture/authentication-authorization.md`](../architecture/authentication-authorization.md), [`../architecture/multi-tenant-architecture.md`](../architecture/multi-tenant-architecture.md)

---

## 1. Roles in scope

| Role | Who | Auth |
|------|-----|------|
| **Guest** | Visitors navigating a site | None (org-bound guest session) |
| **Organization Admin** | People who configure one org’s NaaS workspace | Email + password (+ future SSO) |
| **Super Admin** (future) | CampusAR platform operators | Separate privileged auth; MFA policy |

**Note:** Optional future roles (`org_operator`, `org_viewer`) may refine safety ops; they are not required for the guest-first / admin-login model. Until introduced, safety configuration is owned by Organization Admin.

---

## 2. Permission matrix

Legend: **Y** allowed · **N** denied · **R** read-only public/published · **F** future

| Capability | Guest | Org Admin | Super Admin (F) |
|------------|-------|-----------|-----------------|
| Continue without account | Y | — | — |
| Email/password login | N (not for visitors) | Y | Y (platform) |
| View org map (public) | Y | Y | Y (support) |
| Search / route / navigate / AR | Y | Y (test) | Y (support) |
| Accessibility prefs (client) | Y | Y | Y |
| Emergency nav / SOS create | Y | Y | Y |
| Share location / report issue | Y | Y | Y |
| Read org info / hours / notices | R | Y | Y |
| Admin Dashboard | N | Y (own org) | Y (any / impersonate audited) |
| Organization profile & branding | N | Y | Y |
| Buildings / floors | N | Y | Y |
| Map editor (nodes/edges) | N | Y | Y |
| Categories / landmarks / zones | N | Y | Y |
| Navigation policies (default / restricted / accessible / emergency routes) | N | Y | Y |
| Hazards / closures / exits / assembly points | N | Y | Y |
| QR generate / download / regenerate | N | Y | Y |
| Analytics | N | Y (own org) | Y (platform rollups + support) |
| Invite/remove admins, assign roles | N | Y (own org) | Y |
| Audit logs | N | Y (own org) | Y |
| Announcements / events / notices / emergency alerts (write) | N | Y | Y |
| Create / suspend / delete organizations | N | N | Y |
| Billing / entitlements | N | N (view own plan F) | Y |
| Cross-org data access | N | N | Y (audited) |
| BLE / IoT / MQTT / Twin / AI prediction **admin config** | N | Y (when entitled) | Y |

---

## 3. Guest — can / cannot (summary)

**Can:** Org-scoped navigation features only (map, GPS, search, routes, AR, safety *use*, share, report, map style, org info).  

**Cannot:** Any configuration, IAM, analytics, QR ops, content authoring, or platform controls.

Full list: [`guest-experience.md`](./guest-experience.md).

---

## 4. Organization Admin — can / cannot (summary)

**Can:** Everything required to run the org workspace—profile, branding, map/graph editor, safety, QR, analytics, org users, content, map settings—**only for organizations where they hold membership**.

**Cannot:**
- Access another organization’s data  
- Create platform-wide tenants (unless also Super Admin)  
- Bypass audit for destructive deletes (product may require confirm + log)  
- Elevate self to Super Admin  

Full dashboard catalog: [`admin-dashboard-features.md`](./admin-dashboard-features.md).

---

## 5. Super Admin (future) — can / cannot (summary)

**Can:**
- Provision, suspend, archive organizations  
- Support access into a tenant (impersonation or break-glass) with **mandatory audit**  
- Platform analytics (aggregated)  
- Entitlements / plan assignment  
- Abuse and security response  

**Cannot (policy):**
- Silent unaudited access to tenant PII or SOS details  
- Use Super Admin as a substitute for day-to-day org graph editing (prefer org admin accounts)

---

## 6. Enforcement rules

1. **UI hide ≠ security** — every admin mutation checked server-side.  
2. **Org context required** — `organizationId` from slug resolution (guest) or membership (admin), never trusted alone from client body.  
3. **Guest tokens** cannot be upgraded to admin without password (or SSO) login.  
4. **Admin sessions** expire; refresh revocation on password change / remove membership.

---

## 7. Related architecture

Detailed authn/authz flows: [`../architecture/authentication-authorization.md`](../architecture/authentication-authorization.md).  
