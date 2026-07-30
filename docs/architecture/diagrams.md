# 18. Architecture Diagrams — CampusAR

Consolidated Mermaid diagrams. Detail lives in topic docs; this file is the gallery.

---

## 18.1 System context

```mermaid
C4Context
  title CampusAR system context
  Person(student, "Student / Visitor / Faculty")
  Person(admin, "Campus Admin")
  System(campusar, "CampusAR", "Web nav, AR, twin, admin")
  System_Ext(gps, "Device GPS / future BLE")
  System_Ext(iot, "IoT sensors / MQTT future")
  SystemDb(db, "PostgreSQL PostGIS")

  Rel(student, campusar, "Navigate, AR, SOS")
  Rel(admin, campusar, "Operate graph & hazards")
  Rel(campusar, gps, "Read pose")
  Rel(campusar, iot, "Ingest crowd later")
  Rel(campusar, db, "Read/Write")
```

If C4 rendering is unavailable in a viewer, use:

```mermaid
flowchart LR
  Students --> WebApp
  Admins --> WebApp
  WebApp --> API
  API --> PostGIS
  WebApp --> DeviceGPS
  IoTFuture --> API
```

---

## 18.2 Sequence — login and route

```mermaid
sequenceDiagram
  actor U as User
  participant W as Web
  participant A as API
  participant D as DB
  U->>W: Login
  W->>A: POST auth/login
  A->>D: Verify user
  A-->>W: JWT
  U->>W: Choose destination
  W->>A: POST routes/calculate
  A->>D: Graph + hazards + crowd
  A->>A: Pathfind
  A-->>W: Steps + ETA
```

---

## 18.3 Component — modular monolith

```mermaid
flowchart TB
  subgraph Interfaces
    HTTP
    WS
  end
  subgraph Application
    AuthApp
    NavApp
    SafetyApp
    AdminApp
  end
  subgraph Domain
    Pathfinder
    CostModel
    Policies
  end
  subgraph Infrastructure
    Repos
    JwtAdapter
    IotAdapter
    PredictorImpl
  end
  HTTP --> AuthApp
  HTTP --> NavApp
  HTTP --> SafetyApp
  HTTP --> AdminApp
  WS --> AdminApp
  NavApp --> Pathfinder
  NavApp --> CostModel
  Pathfinder --> Policies
  AuthApp --> Repos
  NavApp --> Repos
  NavApp --> PredictorImpl
  IotAdapter --> Repos
  IotAdapter --> WS
```

---

## 18.4 Deployment

```mermaid
flowchart TB
  Internet --> Proxy
  Proxy --> WebNginx
  Proxy --> ApiService
  ApiService --> Postgres
  ApiService --> RedisOpt["Redis optional"]
```

---

## 18.5 Authentication

```mermaid
flowchart TD
  A[Request] --> B{Access token valid?}
  B -->|Yes| C{Role allowed?}
  B -->|No| D[Try refresh]
  D -->|OK| A
  D -->|Fail| E[401]
  C -->|Yes| F[Use case]
  C -->|No| G[403]
```

---

## 18.6 Navigation

```mermaid
flowchart TD
  Open --> GPS
  GPS --> Snap
  Snap --> Search
  Search --> Calculate
  Calculate --> Preview
  Preview --> Guide
  Guide --> RecalcLoop
  RecalcLoop --> Guide
  Guide --> Arrive
```

---

## 18.7 GPS flow

```mermaid
flowchart TD
  Perm{Permission} -->|grant| Watch
  Perm -->|deny| Manual
  Watch --> Smooth
  Smooth --> SnapNode
  SnapNode --> Consumers[Nav / AR / Map]
  Manual --> Consumers
```

---

## 18.8 AR flow

```mermaid
flowchart TD
  StartAR --> Cam{Camera?}
  Cam -->|no| MapFallback
  Cam -->|yes| Ori{Orientation?}
  Ori -->|no| RelativeHUD
  Ori -->|yes| CompassArrow
  RelativeHUD --> DollFSM
  CompassArrow --> DollFSM
  DollFSM --> ArriveCelebrate
```

---

## 18.9 Admin flow

```mermaid
flowchart TD
  AdminLogin --> RBAC
  RBAC --> Mutate[Create hazard / block / weights]
  Mutate --> DB
  Mutate --> InvalidateCache
  Mutate --> BroadcastWS
  BroadcastWS --> ClientsRefresh
  ClientsRefresh --> NextRouteUsesNewCosts
```

---

## 18.10 Clean Architecture dependency rule

```mermaid
flowchart LR
  Infra[Infrastructure] --> App[Application]
  Interface[Interfaces] --> App
  App --> Domain
  Infra -.->|implements ports| Domain
```

Dependencies point **inward** toward Domain.
