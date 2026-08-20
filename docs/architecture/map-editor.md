# Interactive Map Editor Architecture

**Purpose:** Define the visual navigation-graph editor as a first-class NaaS capability.  
**Phase 2.5A:** architecture only — do not ship drawing UI yet. Data model and site-scoped APIs are in [`site-tenancy.md`](./site-tenancy.md).  
**Product intent:** Admins build and maintain graphs without developer involvement or coordinate spreadsheets.

---

## 1. Why the editor is primary

Seed SQL and form-only CRUD do not scale to thousands of places across many organizations. The map editor is the **content system of record** for nodes and edges.

Primary admin loop:

```text
Open Map → Click → Create Node → Name + Category + metadata → Save
Select Node A → Select Node B → Create Path
```

**No manual coordinate entry.** Lat/lng come from the map click (and drag).  
Product field list: [`../product/node-management.md`](../product/node-management.md).

Inspector fields (create/edit): name, category, description, building, floor, icon, accessibility, search aliases (plus visibility/routable in advanced).

---

## 2. Scope (NaaS editor V1)

| In scope | Out of scope (later) |
|----------|----------------------|
| Place nodes on basemap (click) | Full CAD / BIM import |
| Create / edit / delete nodes | Automatic floorplan vectorization |
| Connect / disconnect edges | Multi-user realtime CRDT editing |
| Pan/zoom, snap helpers | 3D twin editing |
| Category, building, floor fields | Offline mobile editor |
| Undo last action (session) | Full version control UI |
| Org-scoped only | Cross-org copy without export |

**Assumption:** Early NaaS auto-publishes edits; draft/publish workflow is phase 2.

---

## 3. Personas & permissions

| Role | Editor access |
|------|----------------|
| `org_admin` | Full |
| `org_operator` | Optional: hazards + limited node notes (configurable) |
| `platform_admin` | Support access (audited) |
| Visitor | None |

---

## 4. UX architecture (conceptual screens)

1. **Editor shell** — basemap + toolbar + inspector panel + layer toggles.  
2. **Modes** — Select | Place node | Connect | Delete | Hazard annotate.  
3. **Inspector** — fields for selected node/edge (name, category, keywords, accessibility, visibility).  
4. **Validation strip** — disconnected components, orphan nodes, missing names.  
5. **Publish status** — live / pending (when drafts exist).

Design system: reuse admin atlas patterns; editor is a **tool surface**, not a marketing page.

---

## 5. Interaction model

### Create node
1. Enter Place mode.  
2. Click map → provisional pin (**coordinates from click only**).  
3. Inspector opens → name (required), category (required), description, building, floor, icon, accessibility, search aliases.  
4. Save → persistent node; cancel → discard pin.  
5. No latitude/longitude text fields in the default UI.

### Create path
1. Enter Connect mode.  
2. Select node A (source highlight).  
3. Select node B → edge preview (geodesic polyline).  
4. Confirm Create Path → edge created with distance derived from coordinates.  
5. Duplicate edge → no-op or update attributes.

### Edit
- Drag node → update coordinates; optionally recompute adjacent edge lengths.  
- Click edge → set bidirectional, closed, accessibility weight.

### Delete
- Soft-archive preferred (analytics integrity).  
- Cascading: warn if node has edges; offer delete edges + node.

---

## 6. Frontend module boundaries

```text
features/editor/
  ├── EditorPage          (route under /admin/:orgSlug/editor)
  ├── map/EditorMap       (basemap + overlays)
  ├── tools/              (mode machines)
  ├── inspector/          (forms)
  ├── validation/         (client checks)
  └── api/graphEditorApi  (org-scoped mutations)
```

State: local editor session (selected ids, mode, dirty set) + server truth after save.

Avoid coupling editor to visitor MapPage beyond shared map primitives (`RealBasemap`, geo helpers).

---

## 7. Backend / domain

Use cases:

| Use case | Notes |
|----------|-------|
| `CreateNode` | Validate org, category, bounds |
| `UpdateNode` | Coordinate + metadata |
| `ArchiveNode` | Soft delete |
| `CreateEdge` | Same-org endpoints; cycle OK |
| `UpdateEdge` / `ArchiveEdge` | |
| `ListGraphForEditor` | Includes hidden nodes |
| `ValidateGraph` | Connectivity report |

Invalidate or version **routing snapshots** after successful mutations so A* never races half-written graphs.

---

## 8. Consistency & concurrency

| Strategy | Choice |
|----------|--------|
| Concurrent admins | Last-write-wins + `updatedAt` conflict warning (V1) |
| Routing readers | Read published snapshot; short TTL cache per org |
| Audit | Append-only edit log: who/when/what (phase 1.5) |

---

## 9. Validation rules (product + domain)

- Name non-empty; unique per org (configurable).  
- Coordinates inside org bounding box (soft warn if outside).  
- Edges cannot cross orgs.  
- Public destinations must be `visibility=public`.  
- Warn on isolated destination nodes (no path from gates).  
- At least one “entry” category node recommended (Gate / Reception).

---

## 10. Layers & overlays

| Layer | Purpose |
|-------|---------|
| Basemap | Satellite / hybrid / streets |
| Nodes | By category icon |
| Edges | Paths |
| Buildings/floors | Filter subset |
| Hazards / exits | Safety editing |
| GPS debug | Admin-only accuracy circle |

Future: indoor floorplan underlay locked to building.

---

## 11. Accessibility & quality

- Keyboard: escape cancels mode; delete archives selection (with confirm).  
- Color not sole edge-state signal.  
- Large hit targets for touch tablets (security desks).

---

## 12. Success criteria

- New org admin creates a 10-node connected graph in under 30 minutes without engineering.  
- Zero cross-tenant graph mutations in isolation tests.  
- Visitor routing reflects editor changes within snapshot refresh SLA (e.g. under 60s).

---

## 13. Related

- Product node rules: [`../product/node-management.md`](../product/node-management.md)  
- Admin catalog: [`../product/admin-dashboard-features.md`](../product/admin-dashboard-features.md)  
- Auth gates: [`authentication-authorization.md`](./authentication-authorization.md)  
- [`organization-domain.md`](./organization-domain.md)  
- [`multi-tenant-architecture.md`](./multi-tenant-architecture.md)  
- Product: [`../product/multi-tenancy.md`](../product/multi-tenancy.md)  
