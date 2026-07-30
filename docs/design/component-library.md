# 5. Component Library — CampusAR

Reusable components for UI engineers. No implementation code — behaviour and variants only.

---

## Button

**Purpose:** Primary interactive affordance.  
**Variants:** `primary`, `secondary`, `ghost`, `danger`, `link`  
**Sizes:** `sm`, `md`, `lg` (md default; lg for Start Navigation / SOS confirm)  
**States:** default, hover, active, focus-visible, disabled, loading (spinner + disabled)  
**Accessibility:** real `<button>`; `aria-busy` when loading; danger actions name the consequence  
**Usage:** One primary per view region. Do not use pill-full radius as default.

---

## IconButton

**Purpose:** Compact toolbar actions (voice mute, recenter, layers).  
**States:** same as Button + `pressed` for toggles  
**A11y:** `aria-label` required; min 44×44 hit target  

---

## Card

**Purpose:** Group related content in admin/analytics/settings — **not** on map hero or AR.  
**Variants:** `plain`, `outlined`, `interactive` (hover border)  
**Usage:** Prefer outlined over heavy shadow. If removing border/shadow doesn’t hurt understanding, don’t use a card.

---

## SearchInput

**Purpose:** Place search.  
**Features:** Leading search icon, clear button, loading, keyboard ↓↑ Enter  
**States:** empty, typing, loading, results open, no results  
**A11y:** `role="combobox"` + listbox pattern  
**Usage:** Map page header; also command-style on desktop (`/` focus optional Could Have)

---

## Sidebar / AppNav

**Purpose:** Global app navigation.  
**Desktop:** Left rail 240px, icon + label; collapse to icon rail 72px  
**Mobile:** Bottom tab bar (primary destinations) + overflow “More”  
**Items:** Map, Navigate, AR, Twin, Safety, Admin*, Analytics*  
**States:** active, disabled (no permission), badge (optional SOS unread admin later)  
**A11y:** `nav` landmark; `aria-current="page"`

\*Admin/Analytics visible only with role.

---

## TopBar

**Purpose:** Context title, live status chip, account menu.  
**Slots:** left (back or title), center (optional search), right (live chip, theme, avatar)  
**Usage:** Non-immersive pages; Map/AR/Twin use floating chrome instead of heavy top bar.

---

## Dialog (Modal)

**Purpose:** Blocking confirmations (logout, delete hazard, SOS confirm).  
**Anatomy:** title, body, primary + secondary actions  
**States:** open, closing  
**A11y:** focus trap, Escape closes, return focus, `role="dialog"`  
**Usage:** Destructive or irreversible; prefer sheets for mobile filters.

---

## Sheet (Bottom / Side)

**Purpose:** Route preview, place details, filters on mobile.  
**Variants:** peek (summary), half, full  
**States:** collapsed, expanded, dragging  
**A11y:** labelled; focus moves into sheet on expand  

---

## Dropdown / Menu

**Purpose:** Account menu, sort, layer toggles overflow.  
**A11y:** arrow key navigation, typeahead optional  
**Usage:** Not for primary navigation.

---

## Forms

| Component | Notes |
|-----------|-------|
| TextField | Label, hint, error text; `required` indicator |
| TextArea | Admin notes |
| Select | Native or custom listbox |
| Checkbox / Switch | Prediction, accessibility prefs, voice |
| RadioGroup | Guide avatar gender |
| Slider | Admin weights (distance/safety/crowd) with live value |
| FormFieldError | Inline, tied via `aria-describedby` |

**States:** default, focus, error, disabled.  
**Usage:** Stack vertically; one column on mobile.

---

## Table

**Purpose:** Admin entity lists, SOS logs.  
**Features:** sticky header, row hover, empty row, sort indicators, row actions  
**A11y:** proper table headers; don’t use div grids for tabular data  
**Density:** compact in admin  

---

## Charts

**Purpose:** Analytics summaries.  
**Types:** bar (popular destinations), line (searches over time), stat spark optional  
**Rules:** tooltip with text value; legend; no rely on color alone  
**Empty:** see empty states  

---

## Toast

**Purpose:** Non-blocking feedback (“Route updated”, “Saved”).  
**Variants:** info, success, warning, danger  
**Behaviour:** stack bottom-center mobile / bottom-right desktop; auto-dismiss 4–6s; pause on hover; action optional  
**A11y:** `role="status"`; polite live region  

---

## Badge / Chip

**Purpose:** Prediction on, Accessible, Simulated IoT, Live, Crowded  
**Variants:** neutral, primary, success, warning, danger  
**Usage:** Meta near titles/routes; not decorative spam  

---

## StatusChip (system)

**Purpose:** Connection truthfulness.  
**Values:** `Live`, `Live · Simulated`, `Reconnecting`, `Offline`  
**Placement:** TopBar or map floating corner  

---

## Map components

| Component | Purpose |
|-----------|---------|
| MapCanvas | Full-bleed map |
| MapControls | Zoom, recenter, layers |
| LayerToggle | Crowd, hazards, buildings |
| RoutePolyline | Active path |
| NodeMarker | Source / dest / user |
| PlaceCallout | Name + Go |
| Legend | Crowd + hazard keys |
| AccuracyBanner | Poor GPS |

**States:** loading tiles, interaction, error basemap  

---

## AR Controls

| Component | Purpose |
|-----------|---------|
| ArViewport | Camera + overlays |
| ArInstructionPlate | Text step |
| ArArrow | Bearing cue |
| DistancePill | meters to turn |
| TurnBadge | Left/right/straight |
| AvatarStage | Guide doll |
| ArToolbar | Mute, exit AR, recenter attitude, gender (settings) |
| PermissionGate | Camera/motion CTAs |
| AccuracyWarning | GPS poor |
| ArrivalOverlay | Success |

---

## Digital Twin widgets

| Widget | Purpose |
|--------|---------|
| TwinViewport | 3D canvas |
| TwinToolbar | Reset camera, heat toggle, hazard toggle |
| TwinLegend | Same bands as map |
| TwinFilterBar | Building categories / floors later |
| TwinLiveBadge | WS status |
| TwinEmptyWebGL | Fallback CTA |

---

## Admin widgets

| Widget | Purpose |
|--------|---------|
| WeightsEditor | Three sliders + save |
| EntityForm | Building/edge/hazard forms |
| HazardMapPicker | Draw/select radius |
| CrowdOverride | Set edge crowd |
| IoTSimControls | Start / stop / tick + status |
| AuditMeta | Updated by / at |
| ConfirmDelete | Dialog pattern |

---

## Feedback / misc

| Component | Purpose |
|-----------|---------|
| Spinner / Skeleton | Loading |
| EmptyState | Illustration + title + action |
| ErrorState | Title + message + retry |
| Banner | Page-level warning |
| Tabs | Admin sections |
| Breadcrumbs | Admin deep pages |
| AvatarMenu | Profile, settings, logout |
| GuestBanner | Soft CTA to register |

---

## Composition rules

1. Immersive pages compose Map/AR/Twin + floating Toolbars + Sheets — not Card grids.  
2. Admin composes Table + Forms + Tabs inside AppShell.  
3. Always pair Map legend with crowd layer.  
4. SOS uses Dialog confirm, never toast-only.  
