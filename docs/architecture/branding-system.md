# Branding System (Per-Organization)

**Purpose:** Dynamic white-label shell so each organization presents its own identity inside one application binary.

---

## 1. Goals

- Logo, colors, splash, and welcome copy per org.  
- No redeploy to change brand.  
- Visitor and admin shells respect tenant tokens.  
- Fallback to CampusAR defaults when assets missing.  
- Safe: no arbitrary script injection via branding fields.

---

## 2. Brand token model

| Token | Usage |
|-------|-------|
| `logoUrl` / `logoUrlDark` | Header, splash |
| `faviconUrl` | Browser tab |
| `colorPrimary` | CTAs, key chrome |
| `colorAccent` | Highlights, route line option |
| `colorSurface` / `colorText` | Optional overrides |
| `splashImageUrl` | Guest entry momentary screen |
| `welcomeTitle` / `welcomeBody` | First paint copy |
| `mapMarkerStyle` | Optional pin palette |
| `categoryIconOverrides` | Map icons per category |

Tokens map to **CSS variables** on a root wrapper (`data-org-slug`).

---

## 3. Resolution pipeline

```text
Resolve Organization
  → Fetch public brand payload (cacheable CDN)
  → Apply CSS variables
  → Show splash (optional, ≤2s or until map ready)
  → Render Map / Navigate with branded chrome
```

Admin preview: live theme picker writes draft tokens; publish swaps public payload.

---

## 4. Storage

| Asset | Location |
|-------|----------|
| Images | Object storage `orgs/{orgId}/branding/...` |
| Tokens | DB row `OrganizationBranding` |
| Cache | CDN + short TTL; invalidate on publish |

Max sizes and MIME allowlists enforced at upload.

---

## 5. Frontend application

- Single design system (existing atlas components).  
- Branding = **tokens**, not forked component trees.  
- Forbidden: org-supplied custom HTML/JS in V1.  
- Optional later: constrained custom CSS subset.

Dark mode: prefer explicit `logoUrlDark`; else desaturate/fallback.

---

## 6. Admin UX

Org Admin → Branding settings:

1. Upload logo  
2. Pick primary / accent (with contrast warnings)  
3. Welcome message  
4. Splash toggle  
5. Preview on sample map chrome  
6. Publish  

Entitlements may lock advanced tokens to higher plans.

---

## 7. Accessibility

- Contrast check against WCAG for primary text on surfaces.  
- Do not rely on brand color alone for hazard/route states.  
- Splash must be skippable and not block navigation if GPS slow.

---

## 8. Isolation

Public brand endpoint is org-scoped and non-sensitive.  
Never return other orgs’ assets in listing APIs.

---

## 9. Related

- [`organization-domain.md`](./organization-domain.md)  
- [`qr-navigation.md`](./qr-navigation.md)  
- Design system: [`../design/design-system.md`](../design/design-system.md) (tokens extend, do not replace)  
