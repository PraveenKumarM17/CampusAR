# 18. Portfolio Quality Checklist — CampusAR

Use before calling the UX “launch ready.” Treat as a gate for design QA + UI implementation review.

---

## Consistency

- [ ] One button/input/toast language across student and admin  
- [ ] Crowd/hazard colors match Map ↔ Twin ↔ Legend  
- [ ] StatusChip vocabulary consistent (`Live` / `Simulated` / `Offline`)  
- [ ] Radius, spacing, type ramp from design system — no one-off values  
- [ ] Icon metaphors stable  

**Score target:** No unintentional unique controls per page.

---

## Professionalism

- [ ] Landing brand-first, uncluttered, not “college project” card spam  
- [ ] No purple-glow AI clichés; teal atlas identity holds  
- [ ] Safety copy does not overclaim dispatch  
- [ ] Simulated IoT labeled  
- [ ] Admin looks operable (Linear/Notion quiet), not skeuomorphic  

---

## Accessibility

- [ ] WCAG AA contrast on primary UI  
- [ ] Keyboard paths for auth, search list, admin forms, dialogs  
- [ ] Screen reader live updates for nav instructions  
- [ ] Reduced motion honored in AR/map  
- [ ] Text instructions always available beside avatar  
- [ ] 200% zoom usable on Navigate + Login  

---

## Responsiveness

- [ ] Mobile bottom nav + sheets; desktop rail  
- [ ] Map/AR/Twin full-bleed with safe-area insets  
- [ ] Admin tables usable on tablet  
- [ ] Touch targets ≥ 44px  
- [ ] Landscape AR doesn’t trap user  

---

## Visual hierarchy

- [ ] One primary CTA per decision moment  
- [ ] Instructions dominate during Navigate/AR  
- [ ] Map readable under chrome (scrims, not opaque walls)  
- [ ] Arrival unmistakable  
- [ ] Hazards visible without chart junk  

---

## Ease of use

- [ ] Guest completes search → route → arrive without account  
- [ ] GPS deny recoverable via manual start  
- [ ] AR deny recoverable via map nav  
- [ ] Prefs (access, voice, avatar) findable in Settings  
- [ ] Time-to-first-route feels under ~30s for familiar users  

---

## Trust

- [ ] Live vs simulated always honest  
- [ ] Errors offer next steps + requestId when server-side  
- [ ] SOS confirmation + honest success text  
- [ ] Privacy: no creepy live individual tracking on twin  
- [ ] Routing badges explain why path looks “not shortest”  

---

## Launch readiness verdict

| Area | Pass? | Notes |
|------|-------|-------|
| Consistency | | |
| Professionalism | | |
| Accessibility | | |
| Responsiveness | | |
| Visual hierarchy | | |
| Ease of use | | |
| Trust | | |

**Ship bar:** All seven areas pass with only minor noted exceptions; any Safety/Trust failure is a blocker.

---

## Sign-off

| Role | Name | Date |
|------|------|------|
| Product design | | |
| Eng UI lead | | |
| Accessibility review | | |
