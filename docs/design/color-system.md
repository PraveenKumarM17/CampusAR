# 4. Color System — CampusAR

All values are design intent. Contrast must meet WCAG AA for text/UI components on their intended surfaces.

**Brand north star:** Deep teal wayfinding accent on cool paper neutrals. Avoid purple/indigo glow themes.

---

## Core brand

| Token | Light hex | Dark hex | Role |
|-------|-----------|----------|------|
| `color-primary` | `#0F6B63` | `#2AA89C` | Primary buttons, links, active nav, focus |
| `color-primary-hover` | `#0C5751` | `#3BBBAD` | Hover |
| `color-primary-muted` | `#D8EDEA` | `#143D39` | Soft fills, selected rows |
| `color-secondary` | `#3D4F5F` | `#A7B4C0` | Secondary actions, neutral emphasis |
| `color-accent` | `#0F6B63` | `#2AA89C` | Same family as primary (single accent product) |

Optional secondary accent for charts only: `#4A6FA5` (slate blue) — not for marketing purple.

---

## Feedback semantics

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `success` | `#1B7A4E` | `#3DC770` | Arrival, save OK |
| `success-bg` | `#E6F5ED` | `#143528` | Banners |
| `warning` | `#A15C07` | `#E5A53B` | Accuracy poor, soft hazard |
| `warning-bg` | `#FFF4E5` | `#3A2A12` | Banners |
| `danger` | `#C0352B` | `#F07167` | Errors, fire, SOS |
| `danger-bg` | `#FDECEA` | `#3A1614` | Banners |
| `info` | `#2166A8` | `#6BB0E8` | Tips, live status |
| `info-bg` | `#E8F2FB` | `#142838` | Banners |

---

## Surfaces & text

| Token | Light | Dark |
|-------|-------|------|
| `bg-canvas` | `#EEF1F3` | `#12171C` |
| `bg-surface` | `#FFFFFF` | `#1A2228` |
| `bg-surface-raised` | `#FFFFFF` | `#232C34` |
| `bg-surface-sunken` | `#E4E9ED` | `#0E1317` |
| `text-primary` | `#1A2228` | `#E8EEF2` |
| `text-secondary` | `#5C6B76` | `#9AA8B3` |
| `text-tertiary` | `#82919C` | `#6B7882` |
| `text-inverse` | `#FFFFFF` | `#12171C` |
| `border-subtle` | `#D4DCE6` | `#2E3943` |
| `border-strong` | `#B7C3CF` | `#44515C` |
| `focus-ring` | `#0F6B63` | `#2AA89C` |

On `primary` buttons: text always `text-inverse` / white with sufficient contrast.

---

## Map colors

| Element | Color intent |
|---------|--------------|
| Basemap water / park | Muted cool (provider style; CampusAR overlay dominates) |
| Campus buildings fill | `#C5D0D8` @ 80% / dark `#2A3540` |
| Building stroke | `#8A9AAB` |
| Selected building | Primary stroke 2–3px |
| Walkable path default | `#6B7C8A` |
| Active route | `primary` `#0F6B63`, width 5–6px, white casing |
| Alternate ghost route | Primary @ 35% |
| Source pin | Primary filled |
| Destination pin | Ink filled with primary ring |
| User location | Primary pulse ring + white center |
| Blocked path | `#9AA5B0` dashed + hazard hatch |

---

## Crowd heat colors

Encode **band + label**, not color alone.

| Band | Color (path) | Label |
|------|--------------|-------|
| Low | `#7A9E8E` | Quiet |
| Medium | `#D4A017` | Busy |
| High | `#C0352B` | Crowded |

Legend always visible when crowd layer on. Patterns: medium = soft dots overlay optional; high = denser hatch optional for color-blind.

---

## Safety & hazard colors

| Type | Fill / stroke | Icon |
|------|---------------|------|
| Fire / emergency | `#C0352B` strong | Flame / alert |
| Construction | `#D97706` | Cone |
| General danger | `#B45309` | Triangle |
| Info advisory | `#2166A8` | Info |
| Emergency exit | `#1B7A4E` | Exit |

Hazard polygons: 20–30% fill + solid stroke. Never rely on red vs green alone for exit vs danger — use icons + text.

---

## Accessibility routing UI colors

| Meaning | Treatment |
|---------|-----------|
| Accessible route badge | Primary muted fill + accessibility icon + “Step-free” text |
| Stairs excluded | Caption note, not a scary danger color |
| Preference toggle on | Primary border + check |

---

## AR HUD colors

| Element | Color |
|---------|-------|
| Arrow / chevron | White with primary glow/outline for camera contrast |
| Instruction plate | `bg-surface` @ 92% opacity |
| Warning chip | `warning` / `danger` per severity |
| Doll unlit silhouette | Avoid neon; natural materials; readable against camera |

---

## Digital twin colors

Match map crowd/hazard semantics exactly so operators build one mental model. Building meshes: neutral gray; selected: primary emissive subtle (no bloom spam).

---

## Data visualization (analytics)

Palette (categorical, color-blind friendly intent):

1. `#0F6B63`  
2. `#4A6FA5`  
3. `#D4A017`  
4. `#8B5E3C`  
5. `#6B7C8A`  

Sequential: teal scale low→high. Never rainbow.

---

## Forbidden

- Pure `#000` large backgrounds in light mode  
- Neon purple gradients  
- Red text on green backgrounds for critical status without icons  
- Low-contrast gray-on-gray captions for instructions during navigation  
