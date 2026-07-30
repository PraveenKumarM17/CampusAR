# Node Management — Visual Source of Truth

**Status:** Product rules for org graph places  
**Related:** [`../architecture/map-editor.md`](../architecture/map-editor.md), [`../architecture/organization-domain.md`](../architecture/organization-domain.md), [`admin-dashboard-features.md`](./admin-dashboard-features.md)

---

## 1. Principle

The **visual map editor** is the source of truth for navigation nodes and paths.  
Admins do **not** enter latitude/longitude manually.

Coordinates are captured from the map click (and optional drag-to-adjust).

---

## 2. Create node workflow

```text
Open Map (Editor)
  → Click anywhere on the map
  → Create Node
  → Enter fields
  → Save
```

### Fields on create / edit

| Field | Required | Purpose |
|-------|----------|---------|
| Name | Yes | Real-world label (Library, Room 204, Gate) |
| Category | Yes | Taxonomy for search & icons |
| Description | Optional | Visitor-facing detail |
| Building | Optional | Structure association |
| Floor | Optional | Level within building |
| Icon | Optional | Override category default |
| Accessibility | Optional | Step-free, wheelchair, etc. |
| Search aliases | Optional | Keywords / synonyms (“CSE”, “CS block”) |

Visibility (public / staff / hidden) and routable flags belong in inspector advanced settings.

---

## 3. Connect locations (paths)

```text
Select Node A
  → Select Node B
  → Create Path
```

| Action | Result |
|--------|--------|
| Create Path | Edge between A and B; length derived from geometry |
| Remove Path | Archive/delete edge |
| Edit Path | Bidirectional, restricted, accessibility weight, temporary closed |

No coordinate typing for edges.

---

## 4. Edit & delete

- Select node → edit fields in inspector → save  
- Drag node on map → update coordinates; recompute adjacent edge lengths  
- Delete/archive node → warn if edges exist; confirm  

Soft-archive preferred so analytics history remains coherent.

---

## 5. Naming & search product rules

- Nodes represent **places**, not opaque technical IDs in the UI.  
- Search uses **name + aliases + category** within the organization only.  
- Guests only see **public** nodes in search and nearby.

---

## 6. Who can manage nodes

| Role | Access |
|------|--------|
| Guest | None (read public graph via map/search only) |
| Organization Admin | Full CRUD in own org |
| Super Admin (future) | Support access, audited |

---

## 7. Acceptance

- [ ] Admin can create a named, categorized node with one map click + form — no lat/lng fields.  
- [ ] Admin can connect two nodes with two clicks + Create Path.  
- [ ] Guest search reflects saved public nodes after snapshot refresh.  
