# QR-Driven Organization Navigation

**Purpose:** Architecture for frictionless guest entry via organization QR codes and public slugs.

---

## 1. Problem

Visitors should not search a global directory or type org names. Physical spaces (reception, gates, parking) distribute **QR codes** that open the correct tenant immediately.

---

## 2. Entry flows

### 2.1 Primary: QR → Guest → org map

```text
Reception QR
  → Open CampusAR deep link
  → Resolve organization
  → Apply branding / splash
  → Select "Continue as Guest"   ← primary CTA (no account)
  → Allow Location (GPS)
  → Locate + snap to graph
  → Show org map
  → Search / pick destination
  → Navigate
```

Admin email/password is a **secondary** link on the org landing, not part of this visitor flow.  
Product: [`../product/login-experience.md`](../product/login-experience.md), [`../product/guest-experience.md`](../product/guest-experience.md).

### 2.2 Secondary: slug URL

`https://campusar.com/{orgSlug}`  
Equivalent bootstrap without scan analytics unless `?qr=` present.

### 2.3 Optional: destination QR

QR encodes org + destination node (e.g. “Conference Hall B”).  
After locate, route starts automatically or with one confirm.

---

## 3. URL & payload design

| Form | Example | Notes |
|------|---------|-------|
| Path slug | `/rnsit` | Canonical public entry |
| Nested app | `/rnsit/map`, `/rnsit/navigate` | After bootstrap |
| Opaque QR id | `/q/{qrToken}` | Resolves to slug + campaign metadata |
| Query | `?utm_source=reception&qr=gate-a` | Analytics |

**Assumption:** Prefer opaque `/q/{token}` on printed materials so campaigns can be rotated without reprinting if token remapped; slug URLs remain shareable.

Deep link contract (conceptual):

```text
{ baseUrl }/q/{token}
  → 302/client resolve → /{slug}?qr={token}&dest={optionalNodeId}
```

---

## 4. Guest session

| Property | Behaviour |
|----------|-----------|
| Account | Not required |
| Session | Anonymous guest bound to `organizationId` |
| Scope | Cannot access other orgs’ APIs |
| Persistence | Local storage for last dest; no PII required |
| Upgrade | Not required; optional future “save trips” is separate from admin login |

Guest mode is the **default** for public org routes. Guests cannot access Admin Dashboard or graph editing.

---

## 5. Backend responsibilities

| Component | Duty |
|-----------|------|
| `QrService.issue` | Create token, campaign, optional dest, print metadata |
| `QrService.resolve` | Token → org + payload; increment scan counter |
| `OrganizationResolver` | Slug → active org; reject suspended |
| Public graph API | Org-filtered public nodes only |
| Analytics | `qr_scan`, `guest_session_start`, `nav_start` |

---

## 6. Admin capabilities

- Generate org root QR (PNG/SVG download).  
- Generate per-location / per-campaign QRs.  
- Rotate or revoke tokens without deleting org.  
- View scan counts and conversion to navigation starts.

---

## 7. Security & abuse

- Rate-limit resolve endpoints.  
- Tokens unguessable (sufficient entropy).  
- Suspended org → friendly “unavailable” page, not data leak.  
- Destination ids in QR validated against same org.  
- No open redirects off-platform.

---

## 8. Physical deployment guidance (product)

| Placement | Suggested QR type |
|-----------|-------------------|
| Main gate / reception | Org root |
| Parking | Org root + parking category bias |
| Building lobby | Building-biased or dest QR |
| Event desk | Campaign + dest |

Printed materials should include short slug as fallback text.

---

## 9. Relation to map & GPS

QR only selects **tenant + optional destination**. Positioning and routing remain unchanged:

`Resolve org → PositionProvider → Snap → Route`

See [`gps-abstraction.md`](./gps-abstraction.md).

---

## 10. Related

- [`multi-tenant-architecture.md`](./multi-tenant-architecture.md)  
- [`branding-system.md`](./branding-system.md)  
- Product: [`../product/multi-tenancy.md`](../product/multi-tenancy.md)  
