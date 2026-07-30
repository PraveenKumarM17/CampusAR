# Login Experience — Guest-First Entry

**Status:** Product refinement for NaaS  
**Related:** [`role-permissions.md`](./role-permissions.md), [`guest-experience.md`](./guest-experience.md), [`admin-dashboard-features.md`](./admin-dashboard-features.md), [`../architecture/authentication-authorization.md`](../architecture/authentication-authorization.md)

---

## Principle

CampusAR has **two entry modes**. They are not equal:

| Mode | Audience | CTA priority | Account required |
|------|----------|--------------|------------------|
| **Continue as Guest** | Visitors (majority) | **Primary** | No |
| **Administrator Login** | Organization admins only | Secondary (subtle) | Yes — email + password |

Email + password is **not** a general user registration path. Regular visitors, students, patients, and employees navigating a site use Guest.

---

## 1. Guest Access (primary)

### Intent
Frictionless wayfinding. Guests never create an account to navigate.

### Flow

```text
Scan QR (or open org slug URL)
  → Open Organization (branded shell)
  → Select "Continue as Guest"   ← primary CTA
  → Allow Location
  → Open Organization Map
  → Search Destination
  → Navigate
```

### Product rules
- Guest is the default path after org resolution.  
- No mandatory splash that forces login.  
- Admin login is a text link / secondary control (“Organization admin sign in”), never competing with Guest visually.  
- Guest access is limited to **navigation-related features** (see [`guest-experience.md`](./guest-experience.md)).  
- Guests cannot reach Admin Dashboard routes or APIs.

### Optional skip
If product policy sets “auto-guest on QR,” the explicit “Continue as Guest” tap may be one-tap confirm or auto-proceed after short branding splash—still without credentials.

---

## 2. Administrator Login (secondary)

### Intent
Authenticate people who **configure and manage** the organization’s navigation system.

### Flow

```text
Open Admin sign-in (from org page footer /admin path / platform invite)
  → Email + Password
  → Verify OrganizationMembership role = org_admin (or future elevated roles)
  → Organization Admin Dashboard
```

### Product rules
- Only authenticated org admins access the Admin Dashboard.  
- Failed login does not grant guest elevation.  
- Session is org-scoped (membership); multi-org admins pick active organization after login.  
- Future: SSO for enterprise admins without changing Guest path.

### What admins do after login
Full list: [`admin-dashboard-features.md`](./admin-dashboard-features.md).  
Node/path editing: visual map editor only—no manual coordinates ([`node-management.md`](./node-management.md)).

---

## 3. Entry UI composition (org landing)

First viewport after org resolve should contain:

1. Organization brand (logo / name)  
2. Short welcome (org-configured)  
3. **Continue as Guest** (primary)  
4. Secondary: Administrator sign in  

No register/sign-up for visitors on this screen.

---

## 4. Deep links

| Entry | Result |
|-------|--------|
| QR / `/{slug}` | Org landing → Guest path |
| `/{slug}/admin` or `/admin/{slug}` | Admin login gate (if unauthenticated) |
| Destination QR | Org resolve → Guest → optional preselected destination |

---

## 5. Out of scope for this model

- Public “Create account” for visitors (deferred; optional later for saved trips)  
- Social login for guests  
- Using admin credentials inside the guest map shell  

---

## 6. Acceptance (product)

- [ ] Majority of first-time visitors complete QR → Guest → Map without seeing a registration form.  
- [ ] Email/password screen is labeled for administrators.  
- [ ] Guest cannot open Admin Dashboard (UI + API).  
- [ ] Admin can reach Dashboard only after successful auth + membership check.  
