# 15. Navigation Experience — CampusAR

Map-based turn-by-turn (non-AR). Must be fully sufficient alone.

---

## Entry states

1. **Setup** — OD incomplete → prompt complete on Map  
2. **Preview** — route returned, not started  
3. **Active** — guiding  
4. **Arrival** — success  
5. **Ended** — cancelled  

---

## Route preview

**Shows:**

- Polyline on map (fit bounds)  
- Distance (e.g. `650 m`)  
- ETA (e.g. `8 min`)  
- Badges: Accessible · Crowd-aware · Prediction on · Avoiding construction  
- Primary CTA: **Start**  
- Secondary: Edit prefs · Open in AR (after start or from preview OK)  

**Sheet order (mobile):** summary → steps list expandable → Start.

---

## ETA & distance

- Always paired  
- Update on recalc  
- If prediction/crowd changes ETA materially, toast optional once  

---

## GPS tracking UI

- User puck with accuracy ring  
- Recenter button when map panned away  
- Heading cone if available  
- Accuracy banner when poor  

---

## Step list

- Current step emphasized (larger, primary left border)  
- Upcoming collapsed preview (next 2)  
- Completed muted  
- Each: icon + instruction + distance  

`aria-live` on current instruction change.

---

## Deviation

- Detect off-route → banner “You’re off the route”  
- Actions: **Recalculate** (primary), Dismiss  
- Auto-recalc per product assumption with toast “Route updated”  

---

## Re-routing

| Trigger UI | Feedback |
|------------|----------|
| Manual button | Loading on button |
| Auto | Toast + brief polyline pulse |
| Fail | Danger toast; keep previous steps; suggest Safety if NO_ROUTE |

During recalc: don’t blank the entire UI — dim CTA only.

---

## Destination arrival

- Hysteresis prevents flicker  
- Success panel: destination name, Done, Go elsewhere  
- Stop voice  
- Clear session on Done  

---

## Voice guidance UI

- Toggle in toolbar: Voice on/off  
- When on: speaker icon filled; optional “speaking…” subtle  
- Settings: default voice preference  
- System TTS voice; no custom voice branding V1  
- Mute on SOS dialog open  

---

## Chrome while walking

- Large instruction type (≥ 16–18px)  
- High contrast plate  
- SOS accessible but not accidental (icon button → confirm)  
- Minimize settings clutter mid-nav  

---

## Prefs affecting nav (visible)

- Accessibility summary chip if active  
- Prediction chip if on  
- Link “Change” → Settings or inline sheet  

---

## Do / Don’t

| Do | Don’t |
|----|-------|
| Keep map glanceable | Tiny instruction fonts |
| Explain badges | Fake traffic like city maps without data |
| Allow End anytime | Force AR upsell modal loops |
