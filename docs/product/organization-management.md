# Organization Management — Admin Product Surface

**Status:** Product specification for tenant profile & settings  
**Related:** [`admin-dashboard-features.md`](./admin-dashboard-features.md), [`../architecture/branding-system.md`](../architecture/branding-system.md), [`../architecture/organization-domain.md`](../architecture/organization-domain.md)

---

## 1. Scope

Organization Management covers everything that defines **who the tenant is** and how the guest shell looks and behaves—not the graph itself (see node/map editor docs).

Only **Organization Admins** (and future Super Admins) may change these settings.

---

## 2. Profile

| Setting | Guest impact |
|---------|----------------|
| Display name | Header, splash, share cards |
| About / description | Org info page |
| Public contacts | Safety / help |
| Address / location blurb | Context |
| Timezone | Hours, analytics buckets |
| Status | Suspended orgs show unavailable page |

Slug is set at creation; treat as immutable after publish (platform rename exception).

---

## 3. Branding

| Setting | Guest impact |
|---------|----------------|
| Logo | Header, splash, QR collateral |
| Theme / accent colors | Buttons, chrome, route accent |
| Splash screen | First paint after QR |
| Welcome message | Org landing (with Continue as Guest) |
| Favicon | Browser tab |

Guests never edit branding. Details: [`../architecture/branding-system.md`](../architecture/branding-system.md).

---

## 4. Map settings

| Setting | Intent |
|---------|--------|
| Default map center & zoom | First map view |
| Allowed styles | Satellite / hybrid / streets toggles for guests |
| Bounding box | GPS sanity / outside-campus warnings |
| Guest GPS policy | Soft prompt vs required to navigate |

---

## 5. Contact & hours

| Setting | Intent |
|---------|--------|
| Organization contact details | Public help |
| Security / emergency contact | Safety panel |
| Opening hours | Org-level and optionally per-node |

Guests may **view** published hours and contacts.

---

## 6. Relation to other admin areas

| Area | Doc |
|------|-----|
| Graph / nodes / paths | [`node-management.md`](./node-management.md) |
| Safety | [`admin-dashboard-features.md`](./admin-dashboard-features.md) § Safety |
| QR | [`../architecture/qr-navigation.md`](../architecture/qr-navigation.md) |
| Users / audit | [`admin-dashboard-features.md`](./admin-dashboard-features.md) § User management |

---

## 7. Acceptance

- [ ] Branding publish updates guest shell without redeploy.  
- [ ] Org Admin of A cannot change profile of B.  
- [ ] Guest landing shows welcome + primary Continue as Guest.  
