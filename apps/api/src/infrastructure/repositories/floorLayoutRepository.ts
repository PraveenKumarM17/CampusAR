import type {
  Floor,
  FloorCorridor,
  FloorPoi,
  FloorPoiCategory,
  IndoorFloorLayoutSnapshot,
  LocalVec2,
  Room,
  RoomCategory,
} from '@campusar/shared';
import { query } from '../db/pool';
import { AppError } from '../../domain/errors';
import { campusRepository } from './campusRepository';
import { indoorRepository } from './indoorRepository';
import {
  validateLocalPoint,
  validateLocalPolygon,
  parseLocalGeometry,
} from '../../application/floorLayoutValidation';

function mapFloorRow(r: Record<string, unknown>): Floor {
  const updatedAt = r.updated_at as Date | string | undefined;
  return {
    id: r.id as string,
    buildingId: r.building_id as string,
    level: r.level as number,
    name: r.name as string,
    updatedAt:
      updatedAt instanceof Date
        ? updatedAt.toISOString()
        : typeof updatedAt === 'string'
          ? updatedAt
          : undefined,
  };
}

function mapRoomRow(r: Record<string, unknown>): Room {
  const updatedAt = r.updated_at as Date | string | undefined;
  return {
    id: r.id as string,
    floorId: r.floor_id as string,
    buildingId: r.building_id as string,
    name: r.name as string,
    code: r.code as string,
    category: r.category as RoomCategory,
    nodeId: r.node_id as string | null,
    wheelchairAccessible: r.wheelchair_accessible as boolean,
    localGeometry: parseLocalGeometry(r.local_geometry),
    updatedAt:
      updatedAt instanceof Date
        ? updatedAt.toISOString()
        : typeof updatedAt === 'string'
          ? updatedAt
          : undefined,
  };
}

function mapCorridorRow(r: Record<string, unknown>): FloorCorridor {
  const updatedAt = r.updated_at as Date | string | undefined;
  const geom = parseLocalGeometry(r.local_geometry);
  return {
    id: r.id as string,
    floorId: r.floor_id as string,
    buildingId: r.building_id as string,
    name: (r.name as string | null) ?? null,
    category: r.category as string,
    localGeometry: geom ?? [],
    updatedAt:
      updatedAt instanceof Date
        ? updatedAt.toISOString()
        : typeof updatedAt === 'string'
          ? updatedAt
          : undefined,
  };
}

function mapPoiRow(r: Record<string, unknown>): FloorPoi {
  const updatedAt = r.updated_at as Date | string | undefined;
  return {
    id: r.id as string,
    floorId: r.floor_id as string,
    buildingId: r.building_id as string,
    name: r.name as string,
    category: r.category as FloorPoiCategory,
    localX: r.local_x as number,
    localY: r.local_y as number,
    updatedAt:
      updatedAt instanceof Date
        ? updatedAt.toISOString()
        : typeof updatedAt === 'string'
          ? updatedAt
          : undefined,
  };
}

async function assertFloorBelongsToBuilding(floorId: string, buildingId: string): Promise<Floor> {
  const { rows } = await query(
    `SELECT id, building_id, level, name, updated_at FROM floors WHERE id = $1`,
    [floorId],
  );
  if (!rows[0]) throw new AppError('NOT_FOUND', 'Floor not found', 404);
  const floor = mapFloorRow(rows[0] as Record<string, unknown>);
  if (floor.buildingId !== buildingId) {
    throw new AppError('CROSS_BUILDING_REFERENCE', 'Floor does not belong to this building', 422);
  }
  return floor;
}

export const floorLayoutRepository = {
  async loadSnapshot(buildingId: string, siteId: string): Promise<IndoorFloorLayoutSnapshot> {
    const building = await campusRepository.getBuildingById(buildingId);
    if (!building) throw new AppError('NOT_FOUND', 'Building not found', 404);
    if (building.siteId !== siteId) {
      throw new AppError('CROSS_SITE_REFERENCE', 'Building does not belong to the active site', 422);
    }
    const [floors, rooms, corridors, pois] = await Promise.all([
      this.listFloors(buildingId),
      this.listRooms(buildingId),
      this.listCorridors(buildingId),
      this.listPois(buildingId),
    ]);
    return { buildingId, siteId, floors, rooms, corridors, pois };
  },

  async listFloors(buildingId: string): Promise<Floor[]> {
    const { rows } = await query(
      `SELECT id, building_id, level, name, updated_at FROM floors WHERE building_id = $1 ORDER BY level`,
      [buildingId],
    );
    return (rows as Array<Record<string, unknown>>).map(mapFloorRow);
  },

  async getFloorById(id: string): Promise<Floor | null> {
    const { rows } = await query(
      `SELECT id, building_id, level, name, updated_at FROM floors WHERE id = $1`,
      [id],
    );
    if (!rows[0]) return null;
    return mapFloorRow(rows[0] as Record<string, unknown>);
  },

  async createFloor(input: { buildingId: string; level: number; name: string }) {
    const { rows } = await query(
      `INSERT INTO floors (building_id, level, name, updated_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING id, building_id, level, name, updated_at`,
      [input.buildingId, input.level, input.name],
    );
    return mapFloorRow(rows[0] as Record<string, unknown>);
  },

  async updateFloor(
    id: string,
    input: Partial<{ level: number; name: string; expectedUpdatedAt?: string }>,
  ) {
    const expected = input.expectedUpdatedAt ? new Date(input.expectedUpdatedAt) : null;
    const { rows } = await query(
      `UPDATE floors SET
         level = COALESCE($2, level),
         name = COALESCE($3, name),
         updated_at = NOW()
       WHERE id = $1
         AND ($4::timestamptz IS NULL OR date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $4::timestamptz))
       RETURNING id, building_id, level, name, updated_at`,
      [id, input.level ?? null, input.name ?? null, expected],
    );
    if (!rows[0]) {
      const still = await this.getFloorById(id);
      if (still && input.expectedUpdatedAt) {
        throw new AppError('STALE_EDIT', 'This floor was modified elsewhere. Reload and try again.', 409);
      }
      return null;
    }
    return mapFloorRow(rows[0] as Record<string, unknown>);
  },

  async countFloorDependencies(floorId: string): Promise<{
    rooms: number;
    corridors: number;
    pois: number;
    indoorNodes: number;
    outdoorNodes: number;
  }> {
    const { rows } = await query<{
      rooms: string;
      corridors: string;
      pois: string;
      indoor_nodes: string;
      outdoor_nodes: string;
    }>(
      `SELECT
         (SELECT COUNT(*)::text FROM rooms WHERE floor_id = $1) AS rooms,
         (SELECT COUNT(*)::text FROM floor_corridors WHERE floor_id = $1) AS corridors,
         (SELECT COUNT(*)::text FROM floor_pois WHERE floor_id = $1) AS pois,
         (SELECT COUNT(*)::text FROM indoor_nodes WHERE floor_id = $1 AND active = TRUE) AS indoor_nodes,
         (SELECT COUNT(*)::text FROM nodes WHERE floor_id = $1 AND active = TRUE) AS outdoor_nodes`,
      [floorId],
    );
    const r = rows[0];
    return {
      rooms: Number(r?.rooms ?? 0),
      corridors: Number(r?.corridors ?? 0),
      pois: Number(r?.pois ?? 0),
      indoorNodes: Number(r?.indoor_nodes ?? 0),
      outdoorNodes: Number(r?.outdoor_nodes ?? 0),
    };
  },

  async deleteFloor(id: string): Promise<void> {
    const deps = await this.countFloorDependencies(id);
    const total =
      deps.rooms + deps.corridors + deps.pois + deps.indoorNodes + deps.outdoorNodes;
    if (total > 0) {
      throw new AppError(
        'FLOOR_HAS_DEPENDENCIES',
        `Floor has ${total} dependent resource(s) and cannot be deleted`,
        409,
      );
    }
    await query(`DELETE FROM floors WHERE id = $1`, [id]);
  },

  async listRooms(buildingId: string, floorId?: string): Promise<Room[]> {
    const params: unknown[] = [buildingId];
    let sql = `SELECT * FROM rooms WHERE building_id = $1`;
    if (floorId) {
      params.push(floorId);
      sql += ` AND floor_id = $${params.length}`;
    }
    sql += ` ORDER BY code`;
    const { rows } = await query(sql, params);
    return (rows as Array<Record<string, unknown>>).map(mapRoomRow);
  },

  async getRoomById(id: string): Promise<Room | null> {
    const { rows } = await query(`SELECT * FROM rooms WHERE id = $1`, [id]);
    if (!rows[0]) return null;
    return mapRoomRow(rows[0] as Record<string, unknown>);
  },

  async createRoom(input: {
    buildingId: string;
    floorId: string;
    name: string;
    code: string;
    category: RoomCategory;
    wheelchairAccessible?: boolean;
    localGeometry: LocalVec2[];
  }) {
    await assertFloorBelongsToBuilding(input.floorId, input.buildingId);
    validateLocalPolygon(input.localGeometry, 'Room');
    const { rows } = await query(
      `INSERT INTO rooms (floor_id, building_id, name, code, category, wheelchair_accessible, local_geometry, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())
       RETURNING *`,
      [
        input.floorId,
        input.buildingId,
        input.name,
        input.code,
        input.category,
        input.wheelchairAccessible ?? true,
        JSON.stringify(input.localGeometry),
      ],
    );
    return mapRoomRow(rows[0] as Record<string, unknown>);
  },

  async updateRoom(
    id: string,
    input: Partial<{
      name: string;
      code: string;
      category: RoomCategory;
      wheelchairAccessible: boolean;
      localGeometry: LocalVec2[];
      floorId: string;
      expectedUpdatedAt?: string;
    }>,
  ) {
    if (input.localGeometry) validateLocalPolygon(input.localGeometry, 'Room');
    if (input.floorId) {
      const existing = await this.getRoomById(id);
      if (existing) await assertFloorBelongsToBuilding(input.floorId, existing.buildingId);
    }
    const expected = input.expectedUpdatedAt ? new Date(input.expectedUpdatedAt) : null;
    const { rows } = await query(
      `UPDATE rooms SET
         name = COALESCE($2, name),
         code = COALESCE($3, code),
         category = COALESCE($4, category),
         wheelchair_accessible = COALESCE($5, wheelchair_accessible),
         floor_id = COALESCE($6, floor_id),
         local_geometry = CASE WHEN $7::boolean THEN $8::jsonb ELSE local_geometry END,
         updated_at = NOW()
       WHERE id = $1
         AND ($9::timestamptz IS NULL OR date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $9::timestamptz))
       RETURNING *`,
      [
        id,
        input.name ?? null,
        input.code ?? null,
        input.category ?? null,
        input.wheelchairAccessible ?? null,
        input.floorId ?? null,
        input.localGeometry !== undefined,
        input.localGeometry ? JSON.stringify(input.localGeometry) : null,
        expected,
      ],
    );
    if (!rows[0]) {
      const still = await this.getRoomById(id);
      if (still && input.expectedUpdatedAt) {
        throw new AppError('STALE_EDIT', 'This room was modified elsewhere. Reload and try again.', 409);
      }
      return null;
    }
    const updated = mapRoomRow(rows[0] as Record<string, unknown>);
    if (input.name) {
      const draft = await indoorRepository.getDraftMapByBuilding(updated.buildingId);
      const published = await indoorRepository.getPublishedMapByBuilding(updated.buildingId);
      const mapId = draft?.id ?? published?.id;
      if (mapId) await indoorRepository.syncPlaceNameForRoom(mapId, id, input.name);
    }
    return updated;
  },

  async countRoomDependencies(id: string): Promise<{ nodeLink: boolean; indoorPlaces: number }> {
    const room = await this.getRoomById(id);
    const { rows } = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM indoor_places ip
       WHERE ip.active = TRUE AND ip.metadata->>'roomId' = $1`,
      [id],
    );
    return {
      nodeLink: Boolean(room?.nodeId),
      indoorPlaces: Number(rows[0]?.count ?? 0),
    };
  },

  async deleteRoom(id: string): Promise<void> {
    const deps = await this.countRoomDependencies(id);
    if (deps.nodeLink || deps.indoorPlaces > 0) {
      throw new AppError(
        'ROOM_HAS_DEPENDENCIES',
        'Room is linked to navigation resources and cannot be deleted',
        409,
      );
    }
    await query(`DELETE FROM rooms WHERE id = $1`, [id]);
  },

  async listCorridors(buildingId: string, floorId?: string): Promise<FloorCorridor[]> {
    const params: unknown[] = [buildingId];
    let sql = `SELECT * FROM floor_corridors WHERE building_id = $1`;
    if (floorId) {
      params.push(floorId);
      sql += ` AND floor_id = $${params.length}`;
    }
    const { rows } = await query(sql, params);
    return (rows as Array<Record<string, unknown>>).map(mapCorridorRow);
  },

  async getCorridorById(id: string): Promise<FloorCorridor | null> {
    const { rows } = await query(`SELECT * FROM floor_corridors WHERE id = $1`, [id]);
    if (!rows[0]) return null;
    return mapCorridorRow(rows[0] as Record<string, unknown>);
  },

  async createCorridor(input: {
    buildingId: string;
    floorId: string;
    name?: string | null;
    category?: string;
    localGeometry: LocalVec2[];
  }) {
    await assertFloorBelongsToBuilding(input.floorId, input.buildingId);
    validateLocalPolygon(input.localGeometry, 'Corridor');
    const { rows } = await query(
      `INSERT INTO floor_corridors (floor_id, building_id, name, category, local_geometry, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
       RETURNING *`,
      [
        input.floorId,
        input.buildingId,
        input.name ?? null,
        input.category ?? 'corridor',
        JSON.stringify(input.localGeometry),
      ],
    );
    return mapCorridorRow(rows[0] as Record<string, unknown>);
  },

  async updateCorridor(
    id: string,
    input: Partial<{
      name: string | null;
      category: string;
      localGeometry: LocalVec2[];
      floorId: string;
      expectedUpdatedAt?: string;
    }>,
  ) {
    if (input.localGeometry) validateLocalPolygon(input.localGeometry, 'Corridor');
    if (input.floorId) {
      const existing = await this.getCorridorById(id);
      if (existing) await assertFloorBelongsToBuilding(input.floorId, existing.buildingId);
    }
    const expected = input.expectedUpdatedAt ? new Date(input.expectedUpdatedAt) : null;
    const { rows } = await query(
      `UPDATE floor_corridors SET
         name = COALESCE($2, name),
         category = COALESCE($3, category),
         floor_id = COALESCE($4, floor_id),
         local_geometry = CASE WHEN $5::boolean THEN $6::jsonb ELSE local_geometry END,
         updated_at = NOW()
       WHERE id = $1
         AND ($7::timestamptz IS NULL OR date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $7::timestamptz))
       RETURNING *`,
      [
        id,
        input.name ?? null,
        input.category ?? null,
        input.floorId ?? null,
        input.localGeometry !== undefined,
        input.localGeometry ? JSON.stringify(input.localGeometry) : null,
        expected,
      ],
    );
    if (!rows[0]) {
      const still = await this.getCorridorById(id);
      if (still && input.expectedUpdatedAt) {
        throw new AppError('STALE_EDIT', 'This corridor was modified elsewhere. Reload and try again.', 409);
      }
      return null;
    }
    return mapCorridorRow(rows[0] as Record<string, unknown>);
  },

  async deleteCorridor(id: string): Promise<void> {
    await query(`DELETE FROM floor_corridors WHERE id = $1`, [id]);
  },

  async listPois(buildingId: string, floorId?: string): Promise<FloorPoi[]> {
    const params: unknown[] = [buildingId];
    let sql = `SELECT * FROM floor_pois WHERE building_id = $1`;
    if (floorId) {
      params.push(floorId);
      sql += ` AND floor_id = $${params.length}`;
    }
    const { rows } = await query(sql, params);
    return (rows as Array<Record<string, unknown>>).map(mapPoiRow);
  },

  async getPoiById(id: string): Promise<FloorPoi | null> {
    const { rows } = await query(`SELECT * FROM floor_pois WHERE id = $1`, [id]);
    if (!rows[0]) return null;
    return mapPoiRow(rows[0] as Record<string, unknown>);
  },

  async createPoi(input: {
    buildingId: string;
    floorId: string;
    name: string;
    category: FloorPoiCategory;
    localX: number;
    localY: number;
  }) {
    await assertFloorBelongsToBuilding(input.floorId, input.buildingId);
    validateLocalPoint(input.localX, input.localY, 'POI');
    const { rows } = await query(
      `INSERT INTO floor_pois (floor_id, building_id, name, category, local_x, local_y, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING *`,
      [input.floorId, input.buildingId, input.name, input.category, input.localX, input.localY],
    );
    return mapPoiRow(rows[0] as Record<string, unknown>);
  },

  async updatePoi(
    id: string,
    input: Partial<{
      name: string;
      category: FloorPoiCategory;
      localX: number;
      localY: number;
      floorId: string;
      expectedUpdatedAt?: string;
    }>,
  ) {
    if (input.localX !== undefined && input.localY !== undefined) {
      validateLocalPoint(input.localX, input.localY, 'POI');
    }
    if (input.floorId) {
      const existing = await this.getPoiById(id);
      if (existing) await assertFloorBelongsToBuilding(input.floorId, existing.buildingId);
    }
    const expected = input.expectedUpdatedAt ? new Date(input.expectedUpdatedAt) : null;
    const { rows } = await query(
      `UPDATE floor_pois SET
         name = COALESCE($2, name),
         category = COALESCE($3, category),
         local_x = COALESCE($4, local_x),
         local_y = COALESCE($5, local_y),
         floor_id = COALESCE($6, floor_id),
         updated_at = NOW()
       WHERE id = $1
         AND ($7::timestamptz IS NULL OR date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $7::timestamptz))
       RETURNING *`,
      [
        id,
        input.name ?? null,
        input.category ?? null,
        input.localX ?? null,
        input.localY ?? null,
        input.floorId ?? null,
        expected,
      ],
    );
    if (!rows[0]) {
      const still = await this.getPoiById(id);
      if (still && input.expectedUpdatedAt) {
        throw new AppError('STALE_EDIT', 'This POI was modified elsewhere. Reload and try again.', 409);
      }
      return null;
    }
    return mapPoiRow(rows[0] as Record<string, unknown>);
  },

  async deletePoi(id: string): Promise<void> {
    await query(`DELETE FROM floor_pois WHERE id = $1`, [id]);
  },

  assertFloorBelongsToBuilding,
};
