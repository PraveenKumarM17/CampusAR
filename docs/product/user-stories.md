# 4. User Stories — CampusAR V1

Format: **As a … I want … So that …**  
Each story includes a short **Why** and suggested **Acceptance hint**.

---

## Module A — Authentication & onboarding

### US-A1 Guest access
**As a** visitor  
**I want** to continue without creating an account  
**So that** I can navigate immediately on my first visit  

**Why:** Friction kills first-use conversion.  
**Acceptance hint:** Guest session can search and route; admin features hidden.

### US-A2 Register / login
**As a** student  
**I want** to create an account and sign in  
**So that** my preferences and history can persist  

**Why:** Retention and personalization foundation.  
**Acceptance hint:** Valid credentials yield tokens; invalid show clear errors.

### US-A3 Role-based access
**As a** campus administrator  
**I want** admin tools restricted to admin accounts  
**So that** campus data cannot be altered by students  

**Why:** Security and operational integrity.  
**Acceptance hint:** Non-admin receives forbidden on admin APIs/UI.

---

## Module B — Discovery & map

### US-B1 Search destinations
**As a** student  
**I want** to search buildings and rooms by name or code  
**So that** I find destinations without knowing the graph  

**Why:** Primary entry to navigation.  
**Acceptance hint:** Relevant results within 300 ms perceived latency for typical queries.

### US-B2 Category filter
**As a** visitor  
**I want** to filter places by category (lab, library, cafeteria…)  
**So that** I can browse when I don’t know exact names  

**Why:** Supports exploratory discovery.  
**Acceptance hint:** Filter updates visible buildings/list correctly.

### US-B3 Set source and destination on map
**As a** user  
**I want** to tap map nodes to set start and end  
**So that** routing matches where I am and where I’m going  

**Why:** Spatial selection is faster than long dropdowns outdoors.  
**Acceptance hint:** Clear visual distinction for source vs destination.

### US-B4 See live crowd on paths
**As a** student  
**I want** to see which walkways look congested  
**So that** I can choose less crowded approaches before I start  

**Why:** Transparency builds trust in smart routing.  
**Acceptance hint:** Edge colors update when live crowd messages arrive.

---

## Module C — Routing & navigate

### US-C1 Compute route
**As a** user  
**I want** a walking route from source to destination  
**So that** I know how to get there  

**Why:** Core value proposition.  
**Acceptance hint:** Response includes steps, distance, ETA, or clear no-route error.

### US-C2 Accessibility preferences
**As a** faculty member (or student with mobility needs)  
**I want** to avoid stairs and prefer lifts/ramps  
**So that** routes are usable for my situation  

**Why:** Inclusion and institutional compliance posture.  
**Acceptance hint:** Stairs excluded when wheelchair/avoid-stairs enabled when alternatives exist.

### US-C3 Crowd-aware pathing
**As a** student  
**I want** routes that avoid heavily crowded corridors when possible  
**So that** I waste less time waiting in bottlenecks  

**Why:** Differentiator vs static maps.  
**Acceptance hint:** With high crowd on shortest path, system prefers alternate when available.

### US-C4 Predictive routing toggle
**As a** power user  
**I want** to enable/disable crowd prediction  
**So that** I can compare reactive vs proactive routing  

**Why:** Controllability and demos for stakeholders.  
**Acceptance hint:** Flag reflected in API response metadata.

### US-C5 Recalculate during navigation
**As a** user mid-route  
**I want** the path to update when conditions change  
**So that** I am not led into a newly blocked or congested area  

**Why:** Live campus conditions change every few minutes.  
**Acceptance hint:** Recalculate returns a valid path; UI refreshes instructions.

### US-C6 Voice instructions
**As a** student walking outdoors  
**I want** spoken turn instructions  
**So that** I need not stare at the screen constantly  

**Why:** Safety and convenience.  
**Acceptance hint:** Optional; can be muted; speaks current step.

---

## Module D — Web AR guidance

### US-D1 Camera AR overlay
**As a** student  
**I want** navigation cues over my live camera  
**So that** I can align guidance with the real world  

**Why:** AR reduces disorientation at junctions.  
**Acceptance hint:** Graceful fallback if camera denied.

### US-D2 Compass-aligned direction
**As a** user  
**I want** the arrow to point toward the next waypoint relative to my heading  
**So that** “turn left” matches physical reality  

**Why:** Absolute bearings without compass confuse users.  
**Acceptance hint:** When orientation unavailable, fall back to relative/timed steps.

### US-D3 Choose guide doll gender
**As a** user  
**I want** to pick a male or female 3D guide avatar  
**So that** the guide feels personal and clear  

**Why:** Engagement and clarity of mimicked gestures.  
**Acceptance hint:** Preference persists across sessions.

### US-D4 Avatar mimics motion
**As a** user  
**I want** the doll to walk and wave for upcoming turns  
**So that** I get an intuitive nonverbal cue  

**Why:** Reduces cognitive load vs text alone.  
**Acceptance hint:** Walk on straight segments; wave within threshold before turns.

### US-D5 Arrival success
**As a** user  
**I want** a clear “you’ve arrived” success state  
**So that** I know navigation is complete  

**Why:** Closure of the journey; reduces overshooting.  
**Acceptance hint:** Success UI + celebrate pose; option to replay.

---

## Module E — Safety

### US-E1 View hazards
**As a** user  
**I want** to see danger/construction zones on the map  
**So that** I am not surprised mid-walk  

**Why:** Transparency and trust.  
**Acceptance hint:** Active zones visible with type and radius.

### US-E2 Emergency contacts & exits
**As a** visitor  
**I want** to see security/medical contacts and exits  
**So that** I know where to go in trouble  

**Why:** Basic campus safety UX.  
**Acceptance hint:** Lists load without admin login.

### US-E3 SOS
**As a** student  
**I want** to trigger SOS with my location  
**So that** security is notified of an emergency  

**Why:** Critical safety pathway (V1: logged alert, not full CAD).  
**Acceptance hint:** Event stored; user sees confirmation message.

### US-E4 Hazard affects route
**As a** security officer  
**I want** published hazards to change student routes  
**So that** people are steered away from unsafe areas  

**Why:** Safety must couple to routing, not only display.  
**Acceptance hint:** Fire/construction rules applied per product policy.

---

## Module F — Digital Twin & live ops

### US-F1 Twin overview
**As a** campus administrator  
**I want** a 3D twin of campus with live crowd heat  
**So that** I can monitor conditions at a glance  

**Why:** Operational awareness / stakeholder demos.  
**Acceptance hint:** Buildings + paths + live colors without full page refresh.

### US-F2 Live updates
**As an** operator  
**I want** twin/map to update when sensors/simulator tick  
**So that** the view is trustworthy  

**Why:** Stale dashboards destroy credibility.  
**Acceptance hint:** WebSocket-connected indicator; colors change within one tick interval.

---

## Module G — Admin & analytics

### US-G1 Tune routing weights
**As an** administrator  
**I want** to adjust distance vs safety vs crowd weights  
**So that** campus policy is reflected in routes  

**Why:** Policy control without code deploys.  
**Acceptance hint:** Saved weights used on next route request.

### US-G2 Manage graph entities
**As an** administrator  
**I want** to manage buildings, edges, and blockages  
**So that** the digital campus stays accurate  

**Why:** Campuses change constantly.  
**Acceptance hint:** CRUD succeeds with validation.

### US-G3 Manage crowd & events
**As an** administrator  
**I want** to set crowd levels and campus events  
**So that** routing and twin reflect temporary conditions  

**Why:** Bridge until IoT hardware exists.  
**Acceptance hint:** Crowd syncs to edge scores; events with affects-routing apply.

### US-G4 IoT simulator control
**As an** administrator  
**I want** to start/stop the IoT simulator  
**So that** demos and tests are controllable  

**Why:** Determinism for demos and load tests.  
**Acceptance hint:** Status endpoint reflects running state.

### US-G5 Analytics
**As an** administrator  
**I want** summaries of searches and popular routes  
**So that** I can plan facilities and prove product value  

**Why:** Buyer justification and campus planning.  
**Acceptance hint:** Dashboard loads for admin only.

---

## Non-functional stories

### US-N1 Performance
**As a** user  
**I want** routes to feel instant  
**So that** I trust the product like consumer maps  

### US-N2 Clear errors
**As a** user  
**I want** understandable errors when location/camera/route fails  
**So that** I know what to do next  

### US-N3 Secure admin
**As a** campus  
**I want** admin actions authenticated and authorized  
**So that** we reduce abuse risk  
