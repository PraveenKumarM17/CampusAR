# Measure & Link Backend Implementation

## Overview

The Measure & Link feature allows administrators to capture GPS paths, create measurement points, and eventually link them to the indoor navigation graph. This document describes the complete backend implementation.

## Architecture

### Database Layer
- **measurement_paths**: Main table for measurement paths
- **measurement_points**: Individual GPS points along a path
- **measurement_edges**: Automatically generated segments between consecutive points
- **Views**: `measurement_paths_with_geometry` for efficient path retrieval
- **Functions**: `create_measurement_edges_for_path()` for automatic edge generation
- **Triggers**: Auto-update edges when points are added/modified/deleted

### Repository Layer
**File**: `apps/api/src/infrastructure/repositories/measurementPathRepository.ts`

Provides low-level database access:
- Path CRUD operations
- Point CRUD operations
- Bulk point creation
- Edge retrieval and regeneration

### Service Layer
**File**: `apps/api/src/application/measurementPathService.ts`

Business logic and validation:
- Path management with map version checks
- GPS point handling and validation
- Path statistics calculation
- GeoJSON export
- Future: Snapping to indoor graph nodes

### API Layer
**File**: `apps/api/src/interfaces/http/routes/measurementRoutes.ts`

RESTful API endpoints (all require admin/map-editor auth):

#### Path Endpoints
- `POST /api/measurements/paths` - Create a new measurement path
- `GET /api/measurements/paths` - List paths (with filters)
- `GET /api/measurements/paths/:pathId` - Get path with details
- `PATCH /api/measurements/paths/:pathId` - Update path
- `DELETE /api/measurements/paths/:pathId` - Delete path

#### Point Endpoints
- `POST /api/measurements/paths/:pathId/points` - Add single GPS point
- `POST /api/measurements/paths/:pathId/points/bulk` - Bulk add GPS points
- `GET /api/measurements/paths/:pathId/points` - Get all points for a path
- `PATCH /api/measurements/points/:pointId` - Update a point
- `DELETE /api/measurements/points/:pointId` - Delete a point

#### Edge Endpoints
- `GET /api/measurements/paths/:pathId/edges` - Get all edges (segments)

#### Utility Endpoints
- `GET /api/measurements/paths/:pathId/statistics` - Get path statistics
- `GET /api/measurements/paths/:pathId/export/geojson` - Export as GeoJSON
- `POST /api/measurements/paths/:pathId/snap` - Snap points to indoor graph (future)

## Database Schema

### measurement_paths
```sql
- id (UUID, PK)
- site_id (UUID, FK → sites)
- building_id (UUID, FK → buildings, nullable)
- floor_id (UUID, FK → floors, nullable)
- map_version_id (UUID, FK → site_map_versions)
- name (TEXT)
- description (TEXT, nullable)
- path_type (TEXT: indoor/outdoor/mixed)
- status (TEXT: draft/active/archived)
- created_by (UUID, FK → users, nullable)
- created_at (TIMESTAMPTZ)
- updated_at (TIMESTAMPTZ)
- metadata (JSONB)
```

### measurement_points
```sql
- id (UUID, PK)
- path_id (UUID, FK → measurement_paths)
- ordinal (INT, unique per path)
- latitude (DOUBLE PRECISION)
- longitude (DOUBLE PRECISION)
- altitude (DOUBLE PRECISION, nullable)
- floor_level (INT, nullable)
- accuracy_m (DOUBLE PRECISION, nullable)
- label (TEXT, nullable)
- recorded_at (TIMESTAMPTZ)
- metadata (JSONB)
- geom (GEOGRAPHY(POINT), computed)
- snapped_x, snapped_y, snapped_z (DOUBLE PRECISION, nullable)
- snapped_to_node_id (UUID, FK → indoor_nodes, nullable)
```

### measurement_edges
```sql
- id (UUID, PK)
- path_id (UUID, FK → measurement_paths)
- from_point_id (UUID, FK → measurement_points)
- to_point_id (UUID, FK → measurement_points)
- ordinal (INT, unique per path)
- length_m (DOUBLE PRECISION, computed)
- heading_deg (DOUBLE PRECISION, computed)
- elevation_change_m (DOUBLE PRECISION, nullable)
- geom (GEOGRAPHY(LINESTRING))
- metadata (JSONB)
```

## TypeScript Types

**File**: `packages/shared/src/types/measurement.ts`

Shared types exported from `@campusar/shared`:
- `MeasurementPath`
- `MeasurementPoint`
- `MeasurementEdge`
- `MeasurementPathWithDetails`
- `GpsPoint`
- `CreateMeasurementPathDto`
- `UpdateMeasurementPathDto`
- `MeasurementPathStatistics`

## Setup Instructions

### 1. Run Database Migration

```powershell
# Using Docker
docker-compose exec api npm run db:migrate

# Or run the SQL directly
docker exec -i campusar-db psql -U campusar -d campusar < apps/api/src/infrastructure/db/migrations/20260903_measurement_paths.sql
```

### 2. Rebuild API Container (if needed)

```powershell
docker-compose build api
docker-compose up -d api
```

### 3. Rebuild Shared Package (for local development)

```powershell
cd packages/shared
npm run build
cd ../..
```

## API Usage Examples

### Create a Measurement Path

```bash
POST /api/measurements/paths
Authorization: Bearer <token>
Content-Type: application/json

{
  "siteId": "uuid",
  "buildingId": "uuid",
  "floorId": "uuid",
  "mapVersionId": "uuid",
  "name": "Building A Ground Floor Path",
  "description": "GPS measurement of main corridor",
  "pathType": "indoor",
  "status": "draft"
}
```

### Add GPS Points (Bulk)

```bash
POST /api/measurements/paths/:pathId/points/bulk
Authorization: Bearer <token>
Content-Type: application/json

{
  "points": [
    {
      "latitude": 37.7749,
      "longitude": -122.4194,
      "altitude": 10.5,
      "accuracy": 3.2,
      "timestamp": 1630540800000
    },
    {
      "latitude": 37.7750,
      "longitude": -122.4195,
      "altitude": 10.6,
      "accuracy": 2.8,
      "timestamp": 1630540810000
    }
  ]
}
```

### Get Path Statistics

```bash
GET /api/measurements/paths/:pathId/statistics
Authorization: Bearer <token>

Response:
{
  "pointCount": 25,
  "totalLengthM": 42.7,
  "averageAccuracyM": 3.1,
  "startPoint": { "latitude": 37.7749, "longitude": -122.4194 },
  "endPoint": { "latitude": 37.7760, "longitude": -122.4200 }
}
```

### Export as GeoJSON

```bash
GET /api/measurements/paths/:pathId/export/geojson
Authorization: Bearer <token>

Response:
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [-122.4194, 37.7749, 10.5]
      },
      "properties": {
        "id": "uuid",
        "ordinal": 1,
        "label": "Entrance",
        "accuracyM": 3.2
      }
    },
    // ... more points ...
    {
      "type": "Feature",
      "geometry": {
        "type": "LineString",
        "coordinates": [
          [-122.4194, 37.7749, 10.5],
          [-122.4195, 37.7750, 10.6],
          // ...
        ]
      },
      "properties": {
        "pathId": "uuid",
        "name": "Building A Ground Floor Path",
        "totalLengthM": 42.7
      }
    }
  ]
}
```

## Authorization

All measurement endpoints require:
1. **Authentication**: Valid JWT token
2. **Map Editor Role**: User must have map-editor permissions for the site

Middleware chain:
```typescript
authMiddleware → mapEditorAuth → controller
```

## Future Enhancements

### Phase 2: Indoor Graph Snapping
- Implement `snapPointsToIndoorGraph()` in service
- Find nearest indoor_nodes within configurable radius
- Update `snapped_x`, `snapped_y`, `snapped_z` fields
- Link to indoor navigation graph via `snapped_to_node_id`

### Phase 3: Auto-Pathing
- Analyze measurement paths to suggest optimal navigation graph
- Auto-create indoor nodes and edges from GPS traces
- Merge duplicate/overlapping paths

### Phase 4: Quality Metrics
- Path quality scores based on GPS accuracy
- Drift detection for indoor GPS
- Confidence intervals for measurements

## Testing

### Manual Testing with Docker

1. Start Docker containers:
   ```powershell
   docker-compose up -d
   ```

2. Run migration:
   ```powershell
   docker-compose exec api npm run db:migrate
   ```

3. Get auth token (via Swagger UI at https://localhost/api/docs):
   - POST /api/auth/login

4. Test endpoints using Postman or curl:
   ```bash
   curl -X POST https://localhost/api/measurements/paths \
     -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{"siteId":"uuid", "name":"Test Path", ...}'
   ```

### Unit Tests (Future)

Create test files:
- `apps/api/src/application/__tests__/measurementPathService.test.ts`
- `apps/api/src/infrastructure/repositories/__tests__/measurementPathRepository.test.ts`

## Files Changed/Created

### New Files
- `apps/api/src/infrastructure/db/migrations/20260903_measurement_paths.sql`
- `apps/api/src/infrastructure/repositories/measurementPathRepository.ts`
- `apps/api/src/application/measurementPathService.ts`
- `apps/api/src/interfaces/http/routes/measurementRoutes.ts`
- `packages/shared/src/types/measurement.ts`
- `MEASURE_LINK_BACKEND.md`

### Modified Files
- `apps/api/src/interfaces/http/app.ts` - Registered measurement routes
- `packages/shared/src/index.ts` - Exported measurement types

## Status

✅ **Completed**: Backend implementation for Measure & Link feature
- Database schema with PostGIS support
- Repository layer with CRUD operations
- Service layer with business logic
- RESTful API with proper authentication
- TypeScript types in shared package
- Comprehensive documentation

🚧 **Next Steps**: 
- Run database migration in Docker
- Test API endpoints
- Implement frontend UI
- Add snapping to indoor graph
