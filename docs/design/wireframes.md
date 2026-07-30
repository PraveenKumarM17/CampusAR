# 7. Wireframes — CampusAR (Low-Fidelity)

Mermaid block diagrams represent regions, not pixels. Chrome = UI; Canvas = map/AR/3D.

---

## Landing

```mermaid
flowchart TB
  subgraph L["Landing — full viewport"]
    BRAND[CampusAR wordmark — hero]
    LINE[One headline]
    SUB[One supporting sentence]
    CTA[Primary: Continue as guest | Secondary: Sign in]
    VIS[Full-bleed campus path visual / map atmosphere]
  end
  BRAND --> LINE --> SUB --> CTA
  VIS
```

No stats, no card grid, no promo chips on first viewport.

---

## Login

```mermaid
flowchart TB
  subgraph Login
    BACK[Back]
    TITLE[Sign in]
    EMAIL[Email field]
    PASS[Password field]
    SUBMIT[Sign in button]
    ALT[Create account · Continue as guest]
  end
```

---

## Register

```mermaid
flowchart TB
  subgraph Reg
    TITLE[Create account]
    EMAIL[Email]
    PASS[Password]
    CONF[Confirm password]
    SUBMIT[Register]
    ALT[Have an account? Sign in]
  end
```

---

## Dashboard (post-login home)

**Decision:** V1 has **no separate dashboard**. Successful auth → **Map**.  
Admin sees same Map with Admin/Analytics in rail.

```mermaid
flowchart LR
  AuthOK --> Map
```

---

## Map

```mermaid
flowchart TB
  subgraph MapPage
    direction TB
    TOP[Floating: Search + Category chips + StatusChip]
    CANVAS[Full-bleed MapCanvas]
    SIDE[Desktop: Place results / selection panel]
    FAB[Recenter · Layers]
    BOTTOM[Sheet peek: Source · Destination · Route CTA]
  end
  TOP -.-> CANVAS
  SIDE -.-> CANVAS
  BOTTOM -.-> CANVAS
```

---

## Navigation

```mermaid
flowchart TB
  subgraph NavPage
    MAP[Map with route]
    INSTR[Instruction card: Turn + distance]
    META[ETA · Distance · Badges]
    ACTIONS[Voice · Recalculate · Open AR · End]
    PROG[Step progress]
  end
```

---

## AR

```mermaid
flowchart TB
  subgraph ARPage
    CAM[Full-bleed camera]
    ARROW[Center / lower arrow]
    PLATE[Top/bottom instruction plate]
    DOLL[Guide avatar corner]
    TOOL[Exit · Mute · SOS]
    WARN[Accuracy / permission banners]
  end
```

---

## Digital Twin

```mermaid
flowchart TB
  subgraph TwinPage
    VIEW[3D TwinViewport]
    BAR[Toolbar: Heat · Hazards · Reset camera]
    LEG[Legend]
    STATUS[Live / Simulated chip]
    CTA[Optional: Navigate]
  end
```

---

## Analytics

```mermaid
flowchart TB
  subgraph Analytics
    TITLE[Analytics]
    STATS[Stat row: searches · routes · arrivals · SOS]
    CHART1[Popular destinations chart]
    CHART2[Activity over time]
  end
```

---

## Admin hub

```mermaid
flowchart TB
  subgraph Admin
    H[Admin]
    W[Weights]
    P[Places]
    G[Graph]
    HZ[Hazards]
    C[Crowd]
    I[IoT]
  end
```

---

## Admin — Weights (example detail)

```mermaid
flowchart TB
  subgraph Weights
    B[Breadcrumb Admin / Weights]
    S1[Slider distance]
    S2[Slider safety]
    S3[Slider crowd]
    SAVE[Save]
    HINT[Helper: affects next route]
  end
```

---

## Safety

```mermaid
flowchart TB
  subgraph Safety
    SOS[SOS button — prominent]
    HAZ[Active hazards list]
    EXIT[Emergency exits]
    CON[Contacts]
  end
```

---

## Settings

```mermaid
flowchart TB
  subgraph Settings
    T[Theme]
    A[Accessibility routing prefs]
    V[Voice guidance]
    D[Guide avatar gender]
    P[Crowd prediction default]
  end
```

---

## Profile

```mermaid
flowchart TB
  subgraph Profile
    EMAIL[Email read-only]
    ROLE[Role badge]
    OUT[Log out]
    GUEST[Guest: CTA create account]
  end
```

---

## Wireframe notes for engineers

- Landing = brand-first composition  
- Map/Navigate/AR/Twin = immersive canvas + overlays  
- Admin/Analytics/Settings = AppShell + content width  
- Always design **loading / empty / error** companions (see dedicated docs)  
