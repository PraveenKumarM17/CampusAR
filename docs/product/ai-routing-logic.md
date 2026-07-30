# 10. AI Routing Logic — CampusAR V1

**Do not treat this as algorithm source code.** This document defines **system behaviour** engineers implement (A*, EWMA, or successors).

---

## Routing objectives

Primary objective: produce a **walkable path** from source node to destination node that minimizes a **composite cost** while respecting **hard constraints**.

Secondary objectives:
- Prefer safer corridors when policy weights say so.
- Reduce time lost to congestion (live and optionally predicted).
- Honor accessibility preferences.
- Remain explainable (return cost breakdown / flags).

Non-objectives (V1): global multi-agent traffic assignment; driving; guaranteed optimal human “pleasantness”.

---

## Optimization goals

| Goal | Meaning | V1 mechanism |
|------|---------|--------------|
| Shortness | Prefer shorter walk | Base edge length / time |
| Fluency | Avoid congested segments | Live crowd → cost multiplier |
| Foresight | Avoid soon-to-be congested | Prediction → cost multiplier |
| Safety | Avoid incidents / prefer safe | Hazard penalties / blocks + safety weight |
| Access | Step-free when requested | Edge exclusion |
| Stability | Don’t flicker routes every second | Recalc thresholds / hysteresis |

---

## Weighting strategy

Admin-configurable weights (example triad):

- `w_distance` — importance of physical length/time  
- `w_safety` — importance of safety score  
- `w_crowd` — importance of congestion (live + predicted blend)

**Effective edge cost (conceptual):**

```text
if edge is hard-blocked: cost = ∞ (exclude)
else if accessibility violated: cost = ∞ (exclude)
else:
  cost = w_distance * distanceCost
      + w_safety  * safetyCost
      + w_crowd   * crowdCost
```

### Normalization
Weights should be validated (e.g. each ≥ 0, sum > 0).  
**Assumption:** server normalizes weights to sum to 1.0 if admin enters arbitrary positives.

### distanceCost
Proportional to length (meters) or nominal walking time.

### safetyCost
Derived from hazard proximity/severity and optional lighting. Higher = worse.  
Unaffected edges → near 0.

### crowdCost
Blend:

```text
crowdCost = α * liveOccupancyPenalty + (1-α) * predictedOccupancyPenalty
```

- If prediction disabled: `α = 1`.
- If prediction enabled: **Assumption: α = 0.6** (trust live slightly more than forecast).

---

## Crowd prediction behaviour

### V1 approach
Schedule-aware exponential smoothing / EWMA over historical occupancy by edge and time-of-day bucket (simulator or ingested counts).

### Behavioural requirements
- Output per edge: predicted occupancy score in a bounded range (e.g. 0–1 or 0–100).
- On cold start: predicted = live or neutral mid value — **never block routing**.
- Expose `predictionMethod` / version in route metadata for demos and debugging.

### What prediction must not do
- Invent closed paths.
- Override fire hard-blocks.
- Fail the API if model missing.

---

## Safety scoring

| Input | Effect |
|-------|--------|
| Fire / emergency polygon | Hard exclude intersecting edges |
| Construction | Exclude or score → very high safetyCost |
| Active danger | safetyCost by severity tier |
| Soft advisory | small safetyCost |

Admin `w_safety` scales how much soft safetyCost matters relative to distance.

---

## Accessibility scoring

V1 uses **constraints**, not soft scores:
- `avoidStairs` / `wheelchair`: exclude `stairs` edges; allow `ramp`/`elevator`/`stepFree`.
- Optional future: soft penalty for long detours vs stair shortcut when user sets “prefer step-free but allow stairs if detour > X%”.

Emergency policy may additionally exclude elevators (see Safety Workflow).

---

## Live re-routing policy

Recalculate when:
- Periodic interval while navigating.
- Off-route.
- Hard hazard change.
- Crowd delta on current path exceeds threshold **Assumption: +30% occupancy or crosses “high” band**.

Apply new path if:
- New total cost improves by ≥ **Assumption: 10%**, OR
- Old path now infeasible.

Otherwise keep current path (stability).

---

## Explainability (product requirement)

Route response should allow UI to show chips such as:
- “Avoiding construction”
- “Crowd-aware”
- “Prediction on”
- “Accessible route”

Engineers map flags from which cost layers bound.

---

## Future model slots (no V1 dependency)

- LSTM/sequence models replacing EWMA.
- Bayesian fusion of Wi-Fi/BLE counts.
- Personalized weights from user history.
- Multi-objective Pareto alternatives (“fastest” vs “calmest”) presented to user.

---

## Acceptance criteria (behavioural)

- [ ] Changing weights changes path on a fixture graph designed for it.
- [ ] Fire excludes edges regardless of weights.
- [ ] Prediction off ≡ live-only crowd term.
- [ ] Predictor down ≡ successful live-only route.
- [ ] Accessibility exclusions enforced before soft costs.
