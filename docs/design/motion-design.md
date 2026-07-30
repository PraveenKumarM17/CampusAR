# 11. Motion Design — CampusAR

Motion communicates **state and space**, not decoration. Honor `prefers-reduced-motion: reduce` → crossfade or instant; keep functional toasts.

---

## Page transitions

| From → To | Motion |
|-----------|--------|
| Landing → Map | Fade 200ms |
| Map → Navigate | Keep polyline; sheet expands; 240ms |
| Navigate → AR | Fade through brief dark mask 200ms (camera handoff) |
| AR → Navigate | Instant chrome swap |
| Admin sections | Shared layout fade 160ms |

No heroic parallax on every route change.

---

## Map movement

- Recenter: ease camera 500ms to user  
- Fit route: pad bounds, 600ms ease  
- Select place: gentle pan 400ms  
- Live user marker: interpolate positions 200–300ms (no teleport jitter)  
- Crowd color: 300ms material tween on update  

Reduced motion: jump camera, instant color.

---

## Camera movement (Twin)

- Orbit damping on  
- Reset camera: 700ms ease to default  
- Do not auto-spin endlessly (optional subtle idle ≤ 3° only if not reduced-motion — **default off** for professionalism)

---

## AR animation

| Element | Motion |
|---------|--------|
| Arrow | Soft float 1.8s loop (disable if reduced motion) |
| Heading rotate | Smoothed follow; max angular velocity clamp |
| Doll walk | Loop while straight |
| Doll wave | Trigger within turn threshold; hold ~1.2s |
| Celebrate | Once on arrival; 1.5–2s then idle success UI |
| Instruction change | Plate crossfade 160ms |

Camera stream itself is live — no filters animation.

---

## Loading

- Buttons: spinner replace label  
- Panels: skeleton shimmer subtle (no rainbow)  
- Route calculate: progress on CTA + map dim 4%  
- Twin load: centered determinate if possible  

Avoid blocking full-screen spinners on map after first load.

---

## Microinteractions

| Action | Feedback |
|--------|----------|
| Toggle switch | 120ms thumb slide |
| Chip select | 120ms background |
| Add destination | Pin drop scale 200ms |
| Copy / save admin | Toast slide up |
| Route updated | Toast + brief polyline dash pulse once |
| SOS open | Dialog scale from 0.96 + fade |
| Arrival | Success overlay + optional confetti **none** — use doll + check (no party clutter) |

---

## Timing tokens

Reuse design-system `motion-fast|base|slow|map`.

---

## Performance rules

- Prefer transform/opacity  
- Cancel loops when view unmounts  
- One celebration per arrival  
- WS-driven updates coalesce — don’t restart animations every tick identically  

---

## Intentional motion budget (per surface)

| Surface | Count |
|---------|-------|
| Landing | Subtle path drift or light fade-in of CTAs (1–2) |
| Map | Pin drop + route fit |
| Navigate | Step change + recalc pulse |
| AR | Arrow float + doll states + arrival |
| Twin | Heat tween + camera reset |
