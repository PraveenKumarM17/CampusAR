# 3. User Personas — CampusAR

## Persona 1: Aisha — Undergraduate student

| Attribute | Detail |
|-----------|--------|
| **Age** | 19 |
| **Role** | First/second-year CS student |
| **Campus familiarity** | Low–medium; still mixes up buildings |
| **Goals** | Reach classes on time; find labs, library seats, cafeteria; avoid congested corridors between periods |
| **Pain points** | Confusing building codes; GPS pin drops on wrong side of building; peer directions are inconsistent |
| **Daily workflow** | Check timetable → walk/bus to campus → find classroom → move between lectures → library → leave |
| **Technical ability** | High smartphone literacy; expects consumer-app polish |
| **Device usage** | Mid-range Android/iPhone; uses browser and camera; headphones often on |
| **Success looks like** | Opens CampusAR, picks “SCI-201”, follows AR doll + turns, arrives without asking anyone |

**Why we design for Aisha:** Highest volume user; retention depends on daily reliability.

---

## Persona 2: Rohan — Campus visitor

| Attribute | Detail |
|-----------|--------|
| **Age** | 45 |
| **Role** | Parent / conference guest |
| **Campus familiarity** | None |
| **Goals** | Find admissions / auditorium / parking-adjacent entrance quickly |
| **Pain points** | Signage overload; fear of entering wrong buildings; no institutional login |
| **Daily workflow** | Arrive by car/taxi → ask guard → wander → late to appointment |
| **Technical ability** | Medium; will abandon complex flows |
| **Device usage** | Smartphone; may refuse app install; prefers web/guest |
| **Success looks like** | Guest mode → search destination → large clear map steps → optional AR |

**Why we design for Rohan:** Guest mode and clarity over feature depth.

---

## Persona 3: Dr. Mehta — Faculty

| Attribute | Detail |
|-----------|--------|
| **Age** | 38 |
| **Role** | Assistant professor |
| **Campus familiarity** | High for own building; low for new blocks |
| **Goals** | Efficient meetings across departments; accessible routes when with colleagues who need lifts |
| **Pain points** | Construction surprises; peak-hour delays; wants preferences remembered |
| **Daily workflow** | Office → lecture → another building → office hours |
| **Technical ability** | Medium–high |
| **Device usage** | Phone + laptop; AR occasional |
| **Success looks like** | Saved prefs (avoid stairs), fast recalculation when a path is closed |

**Why we design for Dr. Mehta:** Accessibility prefs and reliability build institutional trust.

---

## Persona 4: Kavya — Security staff

| Attribute | Detail |
|-----------|--------|
| **Age** | 32 |
| **Role** | Campus security officer |
| **Campus familiarity** | Very high |
| **Goals** | Respond to SOS; know hazard zones; guide evacuations |
| **Pain points** | Fragmented radio + paper maps; SOS without location; no live corridor status |
| **Daily workflow** | Patrol → desk → incident response → logging |
| **Technical ability** | Medium; needs simple ops UI |
| **Device usage** | Phone + desktop at control room |
| **Success looks like** | Sees SOS with coordinates; publishes temporary closure that immediately changes student routes |

**Why we design for Kavya:** Safety features must be operational, not decorative.

---

## Persona 5: Arjun — Campus administrator / facilities IT

| Attribute | Detail |
|-----------|--------|
| **Age** | 41 |
| **Role** | Facilities / smart-campus program owner |
| **Campus familiarity** | High (organizational) |
| **Goals** | Deploy CampusAR; keep graph accurate; tune routing; show analytics to leadership |
| **Pain points** | Vendor lock-in; demos that don’t survive real ops; no admin control |
| **Daily workflow** | Tickets → update floor plans → events → reports |
| **Technical ability** | High for IT; may not code |
| **Device usage** | Desktop primary; tablet for walkthroughs |
| **Success looks like** | Admin console for weights, buildings, hazards, twin view, analytics export narrative |

**Why we design for Arjun:** Buyer persona; determines renewal and expansion to IoT.

---

## Persona priority matrix (V1)

| Persona | UX priority | Admin tooling | Safety tooling |
|---------|-------------|---------------|----------------|
| Student | P0 | — | P1 |
| Visitor | P0 | — | P1 |
| Faculty | P1 | — | P1 |
| Security | P1 | P1 | P0 |
| Administrator | P1 | P0 | P1 |
