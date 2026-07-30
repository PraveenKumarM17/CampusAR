# 12. Accessibility — CampusAR

Target: **WCAG 2.2 Level AA** for core journeys (auth, search, route, navigate, safety, settings, admin forms).

Map/AR canvases have accessible **alternatives** (lists, text instructions).

---

## Keyboard navigation

| Area | Behaviour |
|------|-----------|
| App nav | Tab through; Enter activates; `aria-current` |
| Search combobox | Arrows, Enter, Escape |
| Forms / admin | Logical tab order; visible focus ring |
| Dialogs / sheets | Focus trap; Escape closes |
| Map | Cannot fully keyboard-pan V1; provide list selection of places/nodes as equal path |
| AR | Exit control focusable; do not require gesture-only for End |

Skip link: “Skip to main content” on non-immersive pages.

---

## Screen readers

- Landmarks: `header`, `nav`, `main`, `complementary` (sheets)  
- Live regions: instruction changes `aria-live="polite"`; SOS confirm assertive  
- Route step announcements sync with voice toggle (don’t double-shout if TTS on — coordinate)  
- Decorative icons `aria-hidden`  
- StatusChip text readable (“Live connection simulated”)  

---

## Color blindness

- Crowd bands: color + label + optional hatch  
- Route vs blocked: dash pattern + legend  
- Charts: patterns/shapes in addition to hue  
- Never success/error by color alone on icons without text  

---

## Reduced motion

When `prefers-reduced-motion: reduce`:

- Disable arrow float, doll walk loops, map easing (instant), twin idle  
- Keep state changes (show celebrate frame static OK)  
- Toasts may appear without slide  

Expose in Settings: “Reduce motion” override.

---

## High contrast

- Support OS high contrast where possible  
- Ensure focus ring 2px non-color-only (offset)  
- Primary buttons maintain 4.5:1 text contrast  
- Provide stronger border mode token if OS requests  

---

## Font scaling

- Layout must tolerate **200%** zoom browser text without clipping primary CTAs  
- Prefer rem-based type  
- Instruction card grows; map can shrink  
- Avoid fixed-height text boxes that truncate critical errors  

---

## Touch & motor

- 44×44 minima  
- SOS confirmation prevents mis-taps  
- Spacing between destructive and primary admin actions  

---

## Cognitive / situational

- Plain language errors  
- One primary CTA  
- Arrival unambiguous  
- Simulated data labeled  
- Safety: no jargon implying dispatch  

---

## AR-specific a11y

- Full text instructions always visible  
- Avatar optional; never sole cue  
- Voice guidance available  
- Permission denials explain alternative path  

---

## Testing checklist (design QA)

- [ ] Contrast audit primary UI  
- [ ] Keyboard admin hazard create  
- [ ] Screen reader navigate step change  
- [ ] Reduced motion AR session  
- [ ] 200% zoom login + navigate instruction  
- [ ] Color-blind simulation on crowd legend  
