import { pool } from '../db/pool';
import type { QueryResult } from 'pg';
import type {
  Matrix4x4,
  RaycastTargetType,
  TrackingState,
  Vector3D,
} from '@campusar/shared';

export interface MeasurementPath {
  id: string;
  siteId: string;
  buildingId: string | null;
  floorId: string | null;
  mapVersionId: string;
  name: string;
  description: string | null;
  pathType: 'indoor' | 'outdoor' | 'mixed';
  status: 'draft' | 'active' | 'archived';
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, unknown>;
  pointCount?: number;
  totalLengthM?: number;
}

export interface MeasurementPoint {
  id: string;
  pathId: string;
  ordinal: number;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  floorLevel: number | null;
  accuracyM: number | null;
  label: string | null;
  recordedAt: Date;
  metadata: Record<string, unknown>;
  snappedX: number | null;
  snappedY: number | null;
  snappedZ: number | null;
  snappedToNodeId: string | null;
  worldPosition: Vector3D | null;
  worldTransform: Matrix4x4 | null;
  raycastTarget: { type: RaycastTargetType; confidence: number } | null;
  trackingState: TrackingState | null;
  featureDensity: number | null;
  depthAvailable: boolean | null;
  estimatedAccuracyMM: number | null;
  revisitCount: number;
}

export interface MeasurementEdge {
  id: string;
  pathId: string;
  fromPointId: string;
  toPointId: string;
  ordinal: number;
  lengthM: number;
  headingDeg: number | null;
  elevationChangeM: number | null;
  metadata: Record<string, unknown>;
}

export interface CreatePathInput {
  siteId: string;
  buildingId?: string | null;
  floorId?: string | null;
  mapVersionId: string;
  name: string;
  description?: string | null;
  pathType?: 'indoor' | 'outdoor' | 'mixed';
  status?: 'draft' | 'active' | 'archived';
  createdBy?: string | null;
  metadata?: Record<string, unknown>;
}

export interface CreatePointInput {
  pathId: string;
  ordinal: number;
  latitude: number | null;
  longitude: number | null;
  altitude?: number | null;
  floorLevel?: number | null;
  accuracyM?: number | null;
  label?: string | null;
  recordedAt?: Date;
  metadata?: Record<string, unknown>;
  worldPosition?: Vector3D | null;
  worldTransform?: Matrix4x4 | null;
  raycastTarget?: { type: RaycastTargetType; confidence: number } | null;
  trackingState?: TrackingState | null;
  featureDensity?: number | null;
  depthAvailable?: boolean | null;
  estimatedAccuracyMM?: number | null;
  revisitCount?: number;
}

function rowToPath(row: any): MeasurementPath {
  return {
    id: row.id,
    siteId: row.site_id,
    buildingId: row.building_id,
    floorId: row.floor_id,
    mapVersionId: row.map_version_id,
    name: row.name,
    description: row.description,
    pathType: row.path_type,
    status: row.status,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    metadata: row.metadata || {},
    pointCount: row.point_count ? parseInt(row.point_count, 10) : undefined,
    totalLengthM: row.total_length_m ? parseFloat(row.total_length_m) : undefined,
  };
}

function rowToPoint(row: any): MeasurementPoint {
  return {
    id: row.id,
    pathId: row.path_id,
    ordinal: row.ordinal,
    latitude: row.latitude == null ? null : parseFloat(row.latitude),
    longitude: row.longitude == null ? null : parseFloat(row.longitude),
    altitude: row.altitude ? parseFloat(row.altitude) : null,
    floorLevel: row.floor_level,
    accuracyM: row.accuracy_m ? parseFloat(row.accuracy_m) : null,
    label: row.label,
    recordedAt: new Date(row.recorded_at),
    metadata: row.metadata || {},
    snappedX: row.snapped_x ? parseFloat(row.snapped_x) : null,
    snappedY: row.snapped_y ? parseFloat(row.snapped_y) : null,
    snappedZ: row.snapped_z ? parseFloat(row.snapped_z) : null,
    snappedToNodeId: row.snapped_to_node_id,
    worldPosition:
      row.world_x_mm == null || row.world_y_mm == null || row.world_z_mm == null
        ? null
        : { x: parseFloat(row.world_x_mm), y: parseFloat(row.world_y_mm), z: parseFloat(row.world_z_mm) },
    worldTransform: row.world_transform ?? null,
    raycastTarget: row.raycast_target ?? null,
    trackingState: row.tracking_state ?? null,
    featureDensity: row.feature_density == null ? null : parseFloat(row.feature_density),
    depthAvailable: row.depth_available ?? null,
    estimatedAccuracyMM:
      row.estimated_accuracy_mm == null ? null : parseFloat(row.estimated_accuracy_mm),
    revisitCount: Number(row.revisit_count ?? 0),
  };
}

function rowToEdge(row: any): MeasurementEdge {
  return {
    id: row.id,
    pathId: row.path_id,
    fromPointId: row.from_point_id,
    toPointId: row.to_point_id,
    ordinal: row.ordinal,
    lengthM: parseFloat(row.length_m),
    headingDeg: row.heading_deg ? parseFloat(row.heading_deg) : null,
    elevationChangeM: row.elevation_change_m ? parseFloat(row.elevation_change_m) : null,
    metadata: row.metadata || {},
  };
}

export const measurementPathRepository = {
  // Paths
  async createPath(input: CreatePathInput): Promise<MeasurementPath> {
    const result = await pool.query<any>(
      `INSERT INTO measurement_paths (
        site_id, building_id, floor_id, map_version_id, name, description,
        path_type, status, created_by, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        input.siteId,
        input.buildingId ?? null,
        input.floorId ?? null,
        input.mapVersionId,
        input.name,
        input.description ?? null,
        input.pathType ?? 'indoor',
        input.status ?? 'draft',
        input.createdBy ?? null,
        JSON.stringify(input.metadata ?? {}),
      ]
    );
    return rowToPath(result.rows[0]);
  },

  async getPathById(id: string): Promise<MeasurementPath | null> {
    const result = await pool.query<any>(
      `SELECT * FROM measurement_paths_with_geometry WHERE id = $1`,
      [id]
    );
    return result.rows[0] ? rowToPath(result.rows[0]) : null;
  },

  async listPaths(filters: {
    siteId?: string;
    floorId?: string;
    buildingId?: string;
    status?: string;
    mapVersionId?: string;
  }): Promise<MeasurementPath[]> {
    const conditions: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (filters.siteId) {
      conditions.push(`site_id = $${paramCount++}`);
      values.push(filters.siteId);
    }
    if (filters.floorId) {
      conditions.push(`floor_id = $${paramCount++}`);
      values.push(filters.floorId);
    }
    if (filters.buildingId) {
      conditions.push(`building_id = $${paramCount++}`);
      values.push(filters.buildingId);
    }
    if (filters.status) {
      conditions.push(`status = $${paramCount++}`);
      values.push(filters.status);
    }
    if (filters.mapVersionId) {
      conditions.push(`map_version_id = $${paramCount++}`);
      values.push(filters.mapVersionId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query<any>(
      `SELECT * FROM measurement_paths_with_geometry ${whereClause} ORDER BY created_at DESC`,
      values
    );
    return result.rows.map(rowToPath);
  },

  async updatePath(id: string, updates: Partial<CreatePathInput>): Promise<MeasurementPath | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramCount++}`);
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      fields.push(`description = $${paramCount++}`);
      values.push(updates.description);
    }
    if (updates.status !== undefined) {
      fields.push(`status = $${paramCount++}`);
      values.push(updates.status);
    }
    if (updates.pathType !== undefined) {
      fields.push(`path_type = $${paramCount++}`);
      values.push(updates.pathType);
    }
    if (updates.metadata !== undefined) {
      fields.push(`metadata = $${paramCount++}`);
      values.push(JSON.stringify(updates.metadata));
    }

    if (fields.length === 0) {
      return this.getPathById(id);
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query<any>(
      `UPDATE measurement_paths SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );
    return result.rows[0] ? rowToPath(result.rows[0]) : null;
  },

  async deletePath(id: string): Promise<boolean> {
    const result = await pool.query(`DELETE FROM measurement_paths WHERE id = $1`, [id]);
    return result.rowCount !== null && result.rowCount > 0;
  },

  // Points
  async createPoint(input: CreatePointInput): Promise<MeasurementPoint> {
    const result = await pool.query<any>(
      `INSERT INTO measurement_points (
        path_id, ordinal, latitude, longitude, altitude, floor_level,
        accuracy_m, label, recorded_at, metadata,
        world_x_mm, world_y_mm, world_z_mm, world_transform, raycast_target,
        tracking_state, feature_density, depth_available, estimated_accuracy_mm, revisit_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING *`,
      [
        input.pathId,
        input.ordinal,
        input.latitude,
        input.longitude,
        input.altitude ?? null,
        input.floorLevel ?? null,
        input.accuracyM ?? null,
        input.label ?? null,
        input.recordedAt ?? new Date(),
        JSON.stringify(input.metadata ?? {}),
        input.worldPosition?.x ?? null,
        input.worldPosition?.y ?? null,
        input.worldPosition?.z ?? null,
        input.worldTransform ? JSON.stringify(input.worldTransform) : null,
        input.raycastTarget ? JSON.stringify(input.raycastTarget) : null,
        input.trackingState ?? null,
        input.featureDensity ?? null,
        input.depthAvailable ?? null,
        input.estimatedAccuracyMM ?? null,
        input.revisitCount ?? 0,
      ]
    );
    return rowToPoint(result.rows[0]);
  },

  async getPointsByPathId(pathId: string): Promise<MeasurementPoint[]> {
    const result = await pool.query<any>(
      `SELECT * FROM measurement_points WHERE path_id = $1 ORDER BY ordinal`,
      [pathId]
    );
    return result.rows.map(rowToPoint);
  },

  async updatePoint(id: string, updates: Partial<CreatePointInput>): Promise<MeasurementPoint | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (updates.ordinal !== undefined) {
      fields.push(`ordinal = $${paramCount++}`);
      values.push(updates.ordinal);
    }
    if (updates.latitude !== undefined) {
      fields.push(`latitude = $${paramCount++}`);
      values.push(updates.latitude);
    }
    if (updates.longitude !== undefined) {
      fields.push(`longitude = $${paramCount++}`);
      values.push(updates.longitude);
    }
    if (updates.altitude !== undefined) {
      fields.push(`altitude = $${paramCount++}`);
      values.push(updates.altitude);
    }
    if (updates.label !== undefined) {
      fields.push(`label = $${paramCount++}`);
      values.push(updates.label);
    }
    if (updates.worldPosition !== undefined) {
      fields.push(`world_x_mm = $${paramCount++}`, `world_y_mm = $${paramCount++}`, `world_z_mm = $${paramCount++}`);
      values.push(updates.worldPosition?.x ?? null, updates.worldPosition?.y ?? null, updates.worldPosition?.z ?? null);
    }

    if (fields.length === 0) {
      const result = await pool.query<any>(`SELECT * FROM measurement_points WHERE id = $1`, [id]);
      return result.rows[0] ? rowToPoint(result.rows[0]) : null;
    }

    values.push(id);
    const result = await pool.query<any>(
      `UPDATE measurement_points SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );
    return result.rows[0] ? rowToPoint(result.rows[0]) : null;
  },

  async deletePoint(id: string): Promise<boolean> {
    const result = await pool.query(`DELETE FROM measurement_points WHERE id = $1`, [id]);
    return result.rowCount !== null && result.rowCount > 0;
  },

  async bulkCreatePoints(points: CreatePointInput[]): Promise<MeasurementPoint[]> {
    if (points.length === 0) return [];

    const values: any[] = [];
    const placeholders: string[] = [];
    let paramCount = 1;

    points.forEach((point, idx) => {
      const offset = idx * 10;
      placeholders.push(
        `($${paramCount + offset}, $${paramCount + offset + 1}, $${paramCount + offset + 2}, $${paramCount + offset + 3}, $${paramCount + offset + 4}, $${paramCount + offset + 5}, $${paramCount + offset + 6}, $${paramCount + offset + 7}, $${paramCount + offset + 8}, $${paramCount + offset + 9})`
      );
      values.push(
        point.pathId,
        point.ordinal,
        point.latitude,
        point.longitude,
        point.altitude ?? null,
        point.floorLevel ?? null,
        point.accuracyM ?? null,
        point.label ?? null,
        point.recordedAt ?? new Date(),
        JSON.stringify(point.metadata ?? {})
      );
    });

    paramCount += points.length * 10;

    const result = await pool.query<any>(
      `INSERT INTO measurement_points (
        path_id, ordinal, latitude, longitude, altitude, floor_level,
        accuracy_m, label, recorded_at, metadata
      ) VALUES ${placeholders.join(', ')}
      RETURNING *`,
      values
    );
    return result.rows.map(rowToPoint);
  },

  // Edges
  async getEdgesByPathId(pathId: string): Promise<MeasurementEdge[]> {
    const result = await pool.query<any>(
      `SELECT * FROM measurement_edges WHERE path_id = $1 ORDER BY ordinal`,
      [pathId]
    );
    return result.rows.map(rowToEdge);
  },

  async regenerateEdges(pathId: string): Promise<void> {
    await pool.query(`SELECT create_measurement_edges_for_path($1)`, [pathId]);
  },
};
