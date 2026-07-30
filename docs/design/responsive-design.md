# 10. Responsive Design — CampusAR

## Breakpoints

| Token | Width | Target |
|-------|-------|--------|
| `sm` | ≥ 640px | Large phones landscape / small tablet |
| `md` | ≥ 768px | Tablet |
| `lg` | ≥ 1024px | Laptop |
| `xl` | ≥ 1280px | Desktop |
| `2xl` | ≥ 1536px | Wide |

Design primarily for: **390×844** (mobile), **768×1024** (tablet), **1440×900** (desktop).

---

## Navigation changes

| Viewport | Pattern |
|----------|---------|
| &lt; lg | Bottom tab bar (5) + More sheet; no persistent left rail |
| ≥ lg | Left rail; collapsible icon mode |
| Immersive Map/AR/Twin | Hide or translucent chrome; tabs may auto-hide on AR scroll-less fullscreen with edge exit |

Safe areas: respect iOS notch / home indicator insets for tabs, SOS, AR toolbar.

---

## Layout adaptation by page

### Landing
- Mobile: stacked brand → copy → CTAs over full-bleed visual  
- Desktop: brand dominant; CTAs grouped; still one composition, not split marketing columns of cards  

### Map
- Mobile: search top floating; results as sheet; OD sheet bottom  
- Tablet: split optional 40% list  
- Desktop: right or left panel 360–400px + map flex  

### Navigate
- Mobile: map 45–55% height; instructions below OR sheet over map  
- Desktop: map dominant; instruction card bottom-left; actions bottom-right  

### AR
- Always portrait-first; landscape supported with doll reposition  
- Controls thumb-zone bottom; instruction plate top or bottom above controls  

### Twin
- Mobile: full viewport + compact toolbar; legend as expandable  
- Desktop: toolbar top; legend corner; optional side facts — keep sparse  

### Admin / Analytics
- Mobile: single column stacked cards/tables horizontal scroll if needed  
- Desktop: 12-col; filters row; tables full width max 1440  

### Safety
- Mobile: SOS full-width top; lists below  
- Desktop: SOS column + lists two-column  

---

## Touch vs pointer

- Touch targets ≥ 44×44  
- Map long-press (optional) vs click for select — **V1:** single tap select with mode Source/Dest toggle  
- Hover tooltips desktop only; mobile uses explicit legend  

---

## Typography & spacing fluid

- Display sizes scale down ~20% on mobile  
- Body stays ≥ 16px for nav instructions  
- Reduce panel padding 24→16 on mobile  

---

## Images / 3D / map performance

- Disable twin shadows on low-end mobile if FPS drops (progressive)  
- AR: prefer lower doll poly on mobile  
- Map: fewer concurrent markers; cluster not required V1 for campus scale  

---

## Orientation

| Page | Lock? |
|------|-------|
| AR | Prefer portrait; allow landscape |
| Others | Both |

Show rotate hint only if AR critically broken in landscape (avoid nagging).
