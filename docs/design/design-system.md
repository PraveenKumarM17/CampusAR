# 3. Design System — CampusAR

Token names are logical. Engineers map them to CSS variables / Tailwind theme — this doc does not include CSS.

---

## Brand name & voice

- **Product name:** CampusAR  
- **Voice:** Clear, confident, helpful, never playful with safety  
- **Wordmark:** “CampusAR” with AR in same weight as Campus (not a neon badge)

---

## Typography

| Role | Family | Weight | Size scale | Notes |
|------|--------|--------|------------|-------|
| **Display** | Bricolage Grotesque | 600–700 | 32–48 px | Landing title, page titles |
| **UI / body** | Public Sans | 400–600 | 14–16 px | Default interface |
| **Mono / data** | IBM Plex Mono or JetBrains Mono | 400–500 | 12–13 px | Analytics numbers, coords (sparse use) |

### Type ramp

| Token | Size | Line height | Use |
|-------|------|-------------|-----|
| `display-xl` | 48 | 1.1 | Landing brand/hero |
| `display-lg` | 36 | 1.15 | Section titles |
| `title-md` | 24 | 1.25 | Page titles |
| `title-sm` | 18 | 1.3 | Card/section headers |
| `body-md` | 16 | 1.5 | Body |
| `body-sm` | 14 | 1.45 | Secondary, forms |
| `caption` | 12 | 1.4 | Legends, meta |
| `overline` | 11 | 1.3 | Uppercase labels (sparingly) |

**Rules:** Max ~70 characters for instructional paragraphs. Avoid all-caps except short overlines. Minimum body 16px on mobile for navigation instructions.

---

## Spacing

Base unit **4 px**. Scale:

`0, 1 (4), 2 (8), 3 (12), 4 (16), 5 (20), 6 (24), 8 (32), 10 (40), 12 (48), 16 (64)`

| Context | Padding |
|---------|---------|
| Page margin desktop | 24–32 |
| Page margin mobile | 16 |
| Panel internal | 16–24 |
| Stack between form fields | 16 |
| Chip gap | 8 |
| Map chrome inset | 12–16 from safe area |

---

## Grid

| Viewport | Columns | Gutter | Margin |
|----------|---------|--------|--------|
| Mobile | 4 | 16 | 16 |
| Tablet | 8 | 16 | 24 |
| Desktop | 12 | 24 | 32 |

Map/AR/Twin pages: **fluid full-bleed canvas** with overlay chrome on a 12-col overlay for side panels (desktop 360–400px panel).

Admin/analytics: 12-col content with max width **1280–1440 px** centered.

---

## Corner radius

| Token | Value | Use |
|-------|-------|-----|
| `radius-sm` | 6 px | Inputs, chips, small buttons |
| `radius-md` | 10 px | Buttons, panels, dialogs |
| `radius-lg` | 16 px | Sheets, large cards |
| `radius-full` | 9999 | Avatar only — **avoid** pill CTAs as default |

Map pins may use custom shapes; keep hit targets ≥ 44×44.

---

## Elevation & shadows

Light mode shadows (soft, short):

| Level | Use |
|-------|-----|
| `elev-0` | Flat on paper background |
| `elev-1` | Panels resting on map/page |
| `elev-2` | Dropdowns, popovers |
| `elev-3` | Modals |

Prefer **border + subtle shadow** over heavy multi-layer glow. Dark mode: elevation via lighter surface steps more than shadow.

---

## Borders

| Token | Use |
|-------|-----|
| `border-subtle` | Dividers, panel edges |
| `border-strong` | Focused containers, active filters |
| `border-focus` | 2px accent ring (focus visible) |

Hairlines only for tables/admin; walker UI uses clearer separation.

---

## Icons

- Style: **2 px stroke**, rounded joins, 24×24 optical grid  
- Library: Lucide-compatible metaphor set (or equivalent)  
- Semantic icons must be paired with text for critical actions (SOS, hazard)  
- Map legend icons match chrome icons  

Key metaphors:

| Concept | Metaphor |
|---------|----------|
| Location | Crosshair / pin |
| Route | Path / corner-up-right |
| AR | Camera / viewfinder |
| Twin | Boxes / orbit |
| Crowd | Users / density |
| Hazard | Triangle alert |
| SOS | Siren / radio |
| Accessible | International accessibility |

---

## Illustration style

- Sparse; prefer **real campus map geometry** as the hero visual, not abstract blobs  
- Empty states: simple line illustrations in ink + teal, one focal object  
- No 3D glossy stock characters outside the AR guide avatar system  

---

## Light mode (default)

- Paper-like cool gray background (`bg-canvas`)  
- Raised white/off-white surfaces (`bg-surface`)  
- Ink text high contrast  
- Teal accent for primary actions and active wayfinding  

---

## Dark mode

- Deep blue-gray canvas (not pure black)  
- Elevated surfaces one step lighter  
- Teal accent slightly brightened for contrast on dark  
- Map basemap: dark style sibling; crowd/hazard hues revalidated for AA against basemap  
- Trigger: user preference in Settings; respect `prefers-color-scheme` as default suggestion  

---

## Animation philosophy

See [`motion-design.md`](./motion-design.md). System tokens:

| Token | Duration | Easing |
|-------|----------|--------|
| `motion-fast` | 120–160 ms | ease-out |
| `motion-base` | 200–240 ms | ease-in-out |
| `motion-slow` | 320–400 ms | ease-in-out |
| `motion-map` | 400–700 ms | maps ease (camera) |

---

## Z-index scale

| Layer | Range |
|-------|-------|
| Map/twin/ar canvas | 0 |
| Map chrome / sheets | 10–20 |
| Dropdowns | 30 |
| Toast | 40 |
| Modal | 50 |
| SOS confirm | 60 |

---

## Content density modes

| Mode | Where |
|------|-------|
| Comfortable | Auth, landing, safety |
| Compact | Admin tables, analytics |
| Immersive | Map, Navigate, AR, Twin (minimal chrome) |
