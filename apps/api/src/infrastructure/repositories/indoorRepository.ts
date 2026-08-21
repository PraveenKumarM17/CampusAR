import type {
  IndoorAnchor,
  IndoorEdge,
  IndoorHandoff,
  IndoorMap,
  IndoorMapBundle,
  IndoorNode,
  IndoorPlace,
  LocalVec3,
} from '@campusar/shared';
import { query } from '../db/pool';

type MapRow = {
  id: string;
  building_id: string;
  name: string;
  status: IndoorMap['status'];
  origin_anchor_id: string | null;
  tracking_quality: string | null;
  plane_count: number;
  confidence: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  active: boolean;
};

function mapFromRow(r: MapRow): IndoorMap {
  return {
    id: r.id,
    buildingId: r.building_id,
    name: r.name,
    status: r.status,
    originAnchorId: r.origin_anchor_id,
    trackingQuality: r.tracking_quality,
    planeCount: Number(r.plane_count),
    confidence: r.confidence == null ? null : Number(r.confidence),
    notes: r.notes,
    createdBy: r.created_by,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    active: r.active,
  };
}

function nodeFromRow(r: Record<string, unknown>): IndoorNode {
  return {
    id: r.id as string,
    mapId: r.map_id as string,
    buildingId: r.building_id as string,
    floorId: r.floor_id as string,
    anchorId: (r.anchor_id as string | null) ?? null,
    localX: Number(r.local_x),
    localY: Number(r.local_y),
    localZ: Number(r.local_z),
    kind: r.kind as IndoorNode['kind'],
    name: (r.name as string | null) ?? null,
    category: (r.category as string | null) ?? null,
    accuracyM: r.accuracy_m == null ? null : Number(r.accuracy_m),
    trackingQuality: (r.tracking_quality as string | null) ?? null,
    active: Boolean(r.active),
  };
}

function parseWaypoints(raw: unknown): LocalVec3[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is LocalVec3 => typeof p === 'object' && p != null && 'x' in p && 'y' in p && 'z' in p)
    .map((p) => ({ x: Number(p.x), y: Number(p.y), z: Number(p.z) }));
}

function edgeFromRow(r: Record<string, unknown>): IndoorEdge {
  return {
    id: r.id as string,
    mapId: r.map_id as string,
    buildingId: r.building_id as string,
    fromFloorId: r.from_floor_id as string,
    toFloorId: r.to_floor_id as string,
    fromNodeId: r.from_node_id as string,
    toNodeId: r.to_node_id as string,
    distanceM: Number(r.distance_m),
    kind: r.kind as IndoorEdge['kind'],
    bidirectional: Boolean(r.bidirectional),
    wheelchairAccessible: Boolean(r.wheelchair_accessible),
    waypoints: parseWaypoints(r.waypoints),
    active: Boolean(r.active),
  };
}

function placeFromRow(r: Record<string, unknown>): IndoorPlace {
  return {
    id: r.id as string,
    mapId: r.map_id as string,
    buildingId: r.building_id as string,
    floorId: (r.floor_id as string | null) ?? null,
    nodeId: (r.node_id as string | null) ?? null,
    parentPlaceId: (r.parent_place_id as string | null) ?? null,
    name: r.name as string,
    category: r.category as IndoorPlace['category'],
    searchable: Boolean(r.searchable),
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    active: Boolean(r.active),
  };
}

function anchorFromRow(r: Record<string, unknown>): IndoorAnchor {
  return {
    id: r.id as string,
    mapId: r.map_id as string,
    buildingId: r.building_id as string,
    floorId: r.floor_id as string,
    nodeId: r.node_id as string,
    anchorCode: r.anchor_code as string,
    physicalMarkerType: r.physical_marker_type as string,
    localX: Number(r.local_x),
    localY: Number(r.local_y),
    localZ: Number(r.local_z),
    active: Boolean(r.active),
  };
}

export const indoorRepository = {
  async listMaps(buildingId?: string, includeInactive = false): Promise<IndoorMap[]> {
    const { rows } = await query<MapRow>(
      `SELECT * FROM indoor_maps
       WHERE ($1::uuid IS NULL OR building_id = $1)
         AND ($2 OR active = TRUE)
       ORDER BY updated_at DESC`,
      [buildingId ?? null, includeInactive],
    );
    return rows.map(mapFromRow);
  },

  async getPublishedMapByBuilding(buildingId: string, mapVersionId: string): Promise<IndoorMap | null> {
    const { rows } = await query<MapRow>(
      `SELECT * FROM indoor_maps
       WHERE building_id = $1 AND map_version_id = $2 AND active = TRUE AND status = 'published'
       ORDER BY updated_at DESC
       LIMIT 1`,
      [buildingId, mapVersionId],
    );
    return rows[0] ? mapFromRow(rows[0]) : null;
  },

  async getMap(id: string): Promise<IndoorMap | null> {
    const { rows } = await query<MapRow>(`SELECT * FROM indoor_maps WHERE id = $1`, [id]);
    return rows[0] ? mapFromRow(rows[0]) : null;
  },

  async createMap(input: {
    buildingId: string;
    name: string;
    notes?: string | null;
    createdBy?: string | null;
    trackingQuality?: string | null;
    planeCount?: number;
    confidence?: number | null;
    mapVersionId: string;
    status?: IndoorMap['status'];
  }): Promise<IndoorMap> {
    const { rows } = await query<MapRow>(
      `INSERT INTO indoor_maps (building_id, name, notes, created_by, tracking_quality, plane_count, confidence, status, map_version_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        input.buildingId,
        input.name,
        input.notes ?? null,
        input.createdBy ?? null,
        input.trackingQuality ?? null,
        input.planeCount ?? 0,
        input.confidence ?? null,
        input.status ?? 'draft',
        input.mapVersionId,
      ],
    );
    return mapFromRow(rows[0]);
  },

  async updateMap(
    id: string,
    input: Partial<{
      name: string;
      status: IndoorMap['status'];
      originAnchorId: string | null;
      trackingQuality: string | null;
      planeCount: number;
      confidence: number | null;
      notes: string | null;
      active: boolean;
    }>,
  ): Promise<IndoorMap | null> {
    const { rows } = await query<MapRow>(
      `UPDATE indoor_maps SET
         name = COALESCE($2, name),
         status = COALESCE($3, status),
         origin_anchor_id = COALESCE($4, origin_anchor_id),
         tracking_quality = COALESCE($5, tracking_quality),
         plane_count = COALESCE($6, plane_count),
         confidence = COALESCE($7, confidence),
         notes = COALESCE($8, notes),
         active = COALESCE($9, active),
         updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [
        id,
        input.name ?? null,
        input.status ?? null,
        input.originAnchorId === undefined ? null : input.originAnchorId,
        input.trackingQuality ?? null,
        input.planeCount ?? null,
        input.confidence ?? null,
        input.notes ?? null,
        input.active ?? null,
      ],
    );
    return rows[0] ? mapFromRow(rows[0]) : null;
  },

  async listNodes(mapId: string, includeInactive = false): Promise<IndoorNode[]> {
    const { rows } = await query(
      `SELECT * FROM indoor_nodes WHERE map_id = $1 AND ($2 OR active = TRUE) ORDER BY id`,
      [mapId, includeInactive],
    );
    return rows.map(nodeFromRow);
  },

  async getNode(id: string): Promise<IndoorNode | null> {
    const { rows } = await query(`SELECT * FROM indoor_nodes WHERE id = $1`, [id]);
    return rows[0] ? nodeFromRow(rows[0]) : null;
  },

  async createNode(input: Omit<IndoorNode, 'id'>): Promise<IndoorNode> {
    const { rows } = await query(
      `INSERT INTO indoor_nodes (
         map_id, building_id, floor_id, anchor_id, local_x, local_y, local_z,
         kind, name, category, accuracy_m, tracking_quality, active, map_version_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
         (SELECT map_version_id FROM indoor_maps WHERE id = $1)) RETURNING *`,
      [
        input.mapId,
        input.buildingId,
        input.floorId,
        input.anchorId,
        input.localX,
        input.localY,
        input.localZ,
        input.kind,
        input.name,
        input.category,
        input.accuracyM,
        input.trackingQuality,
        input.active,
      ],
    );
    return nodeFromRow(rows[0]);
  },

  async updateNode(id: string, input: Partial<Omit<IndoorNode, 'id' | 'mapId' | 'buildingId'>>): Promise<IndoorNode | null> {
    const { rows } = await query(
      `UPDATE indoor_nodes SET
         floor_id = COALESCE($2, floor_id),
         anchor_id = COALESCE($3, anchor_id),
         local_x = COALESCE($4, local_x),
         local_y = COALESCE($5, local_y),
         local_z = COALESCE($6, local_z),
         kind = COALESCE($7, kind),
         name = COALESCE($8, name),
         category = COALESCE($9, category),
         accuracy_m = COALESCE($10, accuracy_m),
         tracking_quality = COALESCE($11, tracking_quality),
         active = COALESCE($12, active)
       WHERE id = $1 RETURNING *`,
      [
        id,
        input.floorId ?? null,
        input.anchorId === undefined ? null : input.anchorId,
        input.localX ?? null,
        input.localY ?? null,
        input.localZ ?? null,
        input.kind ?? null,
        input.name === undefined ? null : input.name,
        input.category === undefined ? null : input.category,
        input.accuracyM === undefined ? null : input.accuracyM,
        input.trackingQuality === undefined ? null : input.trackingQuality,
        input.active ?? null,
      ],
    );
    return rows[0] ? nodeFromRow(rows[0]) : null;
  },

  async softDeleteNode(id: string): Promise<boolean> {
    const { rowCount } = await query(`UPDATE indoor_nodes SET active = FALSE WHERE id = $1`, [id]);
    if (rowCount) {
      await query(`UPDATE indoor_edges SET active = FALSE WHERE from_node_id = $1 OR to_node_id = $1`, [id]);
    }
    return (rowCount ?? 0) > 0;
  },

  async listEdges(mapId: string, includeInactive = false): Promise<IndoorEdge[]> {
    const { rows } = await query(
      `SELECT * FROM indoor_edges WHERE map_id = $1 AND ($2 OR active = TRUE)`,
      [mapId, includeInactive],
    );
    return rows.map(edgeFromRow);
  },

  async getEdge(id: string): Promise<IndoorEdge | null> {
    const { rows } = await query(`SELECT * FROM indoor_edges WHERE id = $1`, [id]);
    return rows[0] ? edgeFromRow(rows[0]) : null;
  },

  async createEdge(input: Omit<IndoorEdge, 'id'>): Promise<IndoorEdge> {
    const { rows } = await query(
      `INSERT INTO indoor_edges (
         map_id, building_id, from_floor_id, to_floor_id, from_node_id, to_node_id,
         distance_m, kind, bidirectional, wheelchair_accessible, waypoints, active, map_version_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,
         (SELECT map_version_id FROM indoor_maps WHERE id = $1)) RETURNING *`,
      [
        input.mapId,
        input.buildingId,
        input.fromFloorId,
        input.toFloorId,
        input.fromNodeId,
        input.toNodeId,
        input.distanceM,
        input.kind,
        input.bidirectional,
        input.wheelchairAccessible,
        JSON.stringify(input.waypoints),
        input.active,
      ],
    );
    return edgeFromRow(rows[0]);
  },

  async updateEdge(id: string, input: Partial<Omit<IndoorEdge, 'id' | 'mapId' | 'buildingId'>>): Promise<IndoorEdge | null> {
    const { rows } = await query(
      `UPDATE indoor_edges SET
         from_floor_id = COALESCE($2, from_floor_id),
         to_floor_id = COALESCE($3, to_floor_id),
         from_node_id = COALESCE($4, from_node_id),
         to_node_id = COALESCE($5, to_node_id),
         distance_m = COALESCE($6, distance_m),
         kind = COALESCE($7, kind),
         bidirectional = COALESCE($8, bidirectional),
         wheelchair_accessible = COALESCE($9, wheelchair_accessible),
         waypoints = COALESCE($10::jsonb, waypoints),
         active = COALESCE($11, active)
       WHERE id = $1 RETURNING *`,
      [
        id,
        input.fromFloorId ?? null,
        input.toFloorId ?? null,
        input.fromNodeId ?? null,
        input.toNodeId ?? null,
        input.distanceM ?? null,
        input.kind ?? null,
        input.bidirectional ?? null,
        input.wheelchairAccessible ?? null,
        input.waypoints ? JSON.stringify(input.waypoints) : null,
        input.active ?? null,
      ],
    );
    return rows[0] ? edgeFromRow(rows[0]) : null;
  },

  async softDeleteEdge(id: string): Promise<boolean> {
    const { rowCount } = await query(`UPDATE indoor_edges SET active = FALSE WHERE id = $1`, [id]);
    return (rowCount ?? 0) > 0;
  },

  async listPlaces(mapId?: string, includeInactive = false): Promise<IndoorPlace[]> {
    const { rows } = await query(
      `SELECT * FROM indoor_places
       WHERE ($1::uuid IS NULL OR map_id = $1) AND ($2 OR active = TRUE)
       ORDER BY name`,
      [mapId ?? null, includeInactive],
    );
    return rows.map(placeFromRow);
  },

  async getPlace(id: string): Promise<IndoorPlace | null> {
    const { rows } = await query(`SELECT * FROM indoor_places WHERE id = $1`, [id]);
    return rows[0] ? placeFromRow(rows[0]) : null;
  },

  async listPlacesByBuilding(buildingId: string): Promise<IndoorPlace[]> {
    const { rows } = await query(
      `SELECT p.* FROM indoor_places p
       JOIN indoor_maps m ON m.id = p.map_id
       WHERE p.building_id = $1
         AND p.active = TRUE AND p.searchable = TRUE
         AND m.active = TRUE AND m.status = 'published'
       ORDER BY p.name`,
      [buildingId],
    );
    return rows.map(placeFromRow);
  },

  async listPlacesByBuildingForVersion(buildingId: string, mapVersionId: string): Promise<IndoorPlace[]> {
    const { rows } = await query(
      `SELECT p.* FROM indoor_places p
       JOIN indoor_maps m ON m.id = p.map_id
       WHERE p.building_id = $1
         AND p.map_version_id = $2
         AND p.active = TRUE AND p.searchable = TRUE
         AND m.active = TRUE
       ORDER BY p.name`,
      [buildingId, mapVersionId],
    );
    return rows.map(placeFromRow);
  },

  async searchPlaces(q: string, buildingId?: string): Promise<IndoorPlace[]> {
    const { rows } = await query(
      `SELECT p.* FROM indoor_places p
       JOIN indoor_maps m ON m.id = p.map_id
       WHERE p.active = TRUE AND p.searchable = TRUE
         AND m.active = TRUE AND m.status = 'published'
         AND ($2::uuid IS NULL OR p.building_id = $2)
         AND p.name ILIKE '%' || $1 || '%'
       ORDER BY length(p.name), p.name
       LIMIT 40`,
      [q.trim(), buildingId ?? null],
    );
    return rows.map(placeFromRow);
  },

  async searchPlacesForVersion(
    q: string,
    mapVersionId: string,
    buildingId?: string,
  ): Promise<IndoorPlace[]> {
    const { rows } = await query(
      `SELECT p.* FROM indoor_places p
       JOIN indoor_maps m ON m.id = p.map_id
       WHERE p.active = TRUE AND p.searchable = TRUE
         AND m.active = TRUE
         AND p.map_version_id = $2
         AND ($3::uuid IS NULL OR p.building_id = $3)
         AND p.name ILIKE '%' || $1 || '%'
       ORDER BY length(p.name), p.name
       LIMIT 40`,
      [q.trim(), mapVersionId, buildingId ?? null],
    );
    return rows.map(placeFromRow);
  },

  async createPlace(input: Omit<IndoorPlace, 'id'>): Promise<IndoorPlace> {
    const { rows } = await query(
      `INSERT INTO indoor_places (
         map_id, building_id, floor_id, node_id, parent_place_id, name, category, searchable, metadata, active, map_version_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,
         (SELECT map_version_id FROM indoor_maps WHERE id = $1)) RETURNING *`,
      [
        input.mapId,
        input.buildingId,
        input.floorId,
        input.nodeId,
        input.parentPlaceId,
        input.name,
        input.category,
        input.searchable,
        JSON.stringify(input.metadata ?? {}),
        input.active,
      ],
    );
    return placeFromRow(rows[0]);
  },

  async updatePlace(id: string, input: Partial<Omit<IndoorPlace, 'id' | 'mapId' | 'buildingId'>>): Promise<IndoorPlace | null> {
    const { rows } = await query(
      `UPDATE indoor_places SET
         floor_id = COALESCE($2, floor_id),
         node_id = COALESCE($3, node_id),
         parent_place_id = COALESCE($4, parent_place_id),
         name = COALESCE($5, name),
         category = COALESCE($6, category),
         searchable = COALESCE($7, searchable),
         metadata = COALESCE($8::jsonb, metadata),
         active = COALESCE($9, active)
       WHERE id = $1 RETURNING *`,
      [
        id,
        input.floorId === undefined ? null : input.floorId,
        input.nodeId === undefined ? null : input.nodeId,
        input.parentPlaceId === undefined ? null : input.parentPlaceId,
        input.name ?? null,
        input.category ?? null,
        input.searchable ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
        input.active ?? null,
      ],
    );
    return rows[0] ? placeFromRow(rows[0]) : null;
  },

  async getAnchorByCode(code: string): Promise<IndoorAnchor | null> {
    const { rows } = await query(
      `SELECT * FROM indoor_anchors WHERE upper(anchor_code) = upper($1) AND active = TRUE`,
      [code.trim()],
    );
    return rows[0] ? anchorFromRow(rows[0]) : null;
  },

  async listAnchors(mapId: string): Promise<IndoorAnchor[]> {
    const { rows } = await query(
      `SELECT * FROM indoor_anchors WHERE map_id = $1 AND active = TRUE ORDER BY anchor_code`,
      [mapId],
    );
    return rows.map(anchorFromRow);
  },

  async createAnchor(input: Omit<IndoorAnchor, 'id'>): Promise<IndoorAnchor> {
    const { rows } = await query(
      `INSERT INTO indoor_anchors (
         map_id, building_id, floor_id, node_id, anchor_code, physical_marker_type, local_x, local_y, local_z, active, map_version_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
         (SELECT map_version_id FROM indoor_maps WHERE id = $1)) RETURNING *`,
      [
        input.mapId,
        input.buildingId,
        input.floorId,
        input.nodeId,
        input.anchorCode.trim().toUpperCase(),
        input.physicalMarkerType,
        input.localX,
        input.localY,
        input.localZ,
        input.active,
      ],
    );
    return anchorFromRow(rows[0]);
  },

  async getHandoffByBuilding(buildingId: string): Promise<IndoorHandoff | null> {
    const { rows } = await query(
      `SELECT h.* FROM indoor_handoffs h
       JOIN indoor_maps m ON m.id = h.map_id
       WHERE h.building_id = $1 AND h.active = TRUE AND m.active = TRUE AND m.status = 'published'
       LIMIT 1`,
      [buildingId],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id as string,
      outdoorNodeId: r.outdoor_node_id as string,
      indoorNodeId: r.indoor_node_id as string,
      buildingId: r.building_id as string,
      mapId: r.map_id as string,
      prompt: r.prompt as string,
      active: Boolean(r.active),
    };
  },

  async getHandoffByBuildingForVersion(
    buildingId: string,
    mapVersionId: string,
  ): Promise<IndoorHandoff | null> {
    const { rows } = await query(
      `SELECT h.* FROM indoor_handoffs h
       WHERE h.building_id = $1 AND h.active = TRUE AND h.map_version_id = $2
       LIMIT 1`,
      [buildingId, mapVersionId],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id as string,
      outdoorNodeId: r.outdoor_node_id as string,
      indoorNodeId: r.indoor_node_id as string,
      buildingId: r.building_id as string,
      mapId: r.map_id as string,
      prompt: r.prompt as string,
      active: Boolean(r.active),
    };
  },

  async getHandoffByOutdoorNode(outdoorNodeId: string): Promise<IndoorHandoff | null> {
    const { rows } = await query(
      `SELECT * FROM indoor_handoffs WHERE outdoor_node_id = $1 AND active = TRUE`,
      [outdoorNodeId],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id as string,
      outdoorNodeId: r.outdoor_node_id as string,
      indoorNodeId: r.indoor_node_id as string,
      buildingId: r.building_id as string,
      mapId: r.map_id as string,
      prompt: r.prompt as string,
      active: Boolean(r.active),
    };
  },

  async getHandoffByOutdoorNodeForVersion(
    outdoorNodeId: string,
    mapVersionId: string,
  ): Promise<IndoorHandoff | null> {
    const { rows } = await query(
      `SELECT * FROM indoor_handoffs
       WHERE outdoor_node_id = $1 AND active = TRUE AND map_version_id = $2`,
      [outdoorNodeId, mapVersionId],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id as string,
      outdoorNodeId: r.outdoor_node_id as string,
      indoorNodeId: r.indoor_node_id as string,
      buildingId: r.building_id as string,
      mapId: r.map_id as string,
      prompt: r.prompt as string,
      active: Boolean(r.active),
    };
  },

  async getPlaceForVersion(id: string, mapVersionId: string): Promise<IndoorPlace | null> {
    const { rows } = await query(
      `SELECT * FROM indoor_places WHERE id = $1 AND map_version_id = $2`,
      [id, mapVersionId],
    );
    return rows[0] ? placeFromRow(rows[0]) : null;
  },

  async getAnchorByCodeForVersion(code: string, mapVersionId: string): Promise<IndoorAnchor | null> {
    const { rows } = await query(
      `SELECT a.* FROM indoor_anchors a
       JOIN indoor_maps m ON m.id = a.map_id
       WHERE upper(a.anchor_code) = upper($1) AND a.active = TRUE AND a.map_version_id = $2 AND m.active = TRUE`,
      [code.trim(), mapVersionId],
    );
    return rows[0] ? anchorFromRow(rows[0]) : null;
  },

  async createHandoff(input: Omit<IndoorHandoff, 'id'>): Promise<IndoorHandoff> {
    const { rows } = await query(
      `INSERT INTO indoor_handoffs (outdoor_node_id, indoor_node_id, building_id, map_id, prompt, active, map_version_id)
       VALUES ($1,$2,$3,$4,$5,$6,(SELECT map_version_id FROM indoor_maps WHERE id = $4))
       ON CONFLICT (outdoor_node_id) DO UPDATE SET
         indoor_node_id = EXCLUDED.indoor_node_id,
         building_id = EXCLUDED.building_id,
         map_id = EXCLUDED.map_id,
         prompt = EXCLUDED.prompt,
         active = EXCLUDED.active
       RETURNING *`,
      [input.outdoorNodeId, input.indoorNodeId, input.buildingId, input.mapId, input.prompt, input.active],
    );
    const r = rows[0];
    return {
      id: r.id as string,
      outdoorNodeId: r.outdoor_node_id as string,
      indoorNodeId: r.indoor_node_id as string,
      buildingId: r.building_id as string,
      mapId: r.map_id as string,
      prompt: r.prompt as string,
      active: Boolean(r.active),
    };
  },

  async getPrimaryMapForBuildingVersion(
    buildingId: string,
    mapVersionId: string,
  ): Promise<IndoorMap | null> {
    const { rows } = await query<MapRow>(
      `SELECT im.*
       FROM indoor_maps im
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS node_count FROM indoor_nodes n
         WHERE n.map_id = im.id AND n.active = TRUE
       ) stats ON TRUE
       WHERE im.building_id = $1 AND im.map_version_id = $2 AND im.active = TRUE
       ORDER BY stats.node_count DESC NULLS LAST, im.updated_at DESC
       LIMIT 1`,
      [buildingId, mapVersionId],
    );
    return rows[0] ? mapFromRow(rows[0]) : null;
  },

  async getDraftMapByBuilding(buildingId: string, mapVersionId: string): Promise<IndoorMap | null> {
    return this.getPrimaryMapForBuildingVersion(buildingId, mapVersionId);
  },

  async getMapMapVersionId(id: string): Promise<string | null> {
    const { rows } = await query<{ map_version_id: string | null }>(
      `SELECT map_version_id FROM indoor_maps WHERE id = $1`,
      [id],
    );
    return rows[0]?.map_version_id ?? null;
  },

  async listHandoffsByMap(mapId: string): Promise<IndoorHandoff[]> {
    const { rows } = await query(
      `SELECT * FROM indoor_handoffs WHERE map_id = $1 AND active = TRUE ORDER BY outdoor_node_id`,
      [mapId],
    );
    return rows.map((r) => ({
      id: r.id as string,
      outdoorNodeId: r.outdoor_node_id as string,
      indoorNodeId: r.indoor_node_id as string,
      buildingId: r.building_id as string,
      mapId: r.map_id as string,
      prompt: r.prompt as string,
      active: Boolean(r.active),
    }));
  },

  async softDeleteHandoff(id: string): Promise<boolean> {
    const { rowCount } = await query(`UPDATE indoor_handoffs SET active = FALSE WHERE id = $1`, [id]);
    return (rowCount ?? 0) > 0;
  },

  async findPlaceByRoomId(mapId: string, roomId: string): Promise<IndoorPlace | null> {
    const { rows } = await query(
      `SELECT * FROM indoor_places
       WHERE map_id = $1 AND active = TRUE AND metadata->>'roomId' = $2
       LIMIT 1`,
      [mapId, roomId],
    );
    return rows[0] ? placeFromRow(rows[0] as Record<string, unknown>) : null;
  },

  async findEdgeBetween(mapId: string, fromNodeId: string, toNodeId: string): Promise<IndoorEdge | null> {
    const { rows } = await query(
      `SELECT * FROM indoor_edges
       WHERE map_id = $1 AND active = TRUE
         AND (
           (from_node_id = $2 AND to_node_id = $3)
           OR (from_node_id = $3 AND to_node_id = $2 AND bidirectional = TRUE)
         )
       LIMIT 1`,
      [mapId, fromNodeId, toNodeId],
    );
    return rows[0] ? edgeFromRow(rows[0] as Record<string, unknown>) : null;
  },

  async syncPlaceNameForRoom(mapId: string, roomId: string, name: string): Promise<void> {
    await query(
      `UPDATE indoor_places SET name = $3
       WHERE map_id = $1 AND active = TRUE AND metadata->>'roomId' = $2`,
      [mapId, roomId, name],
    );
  },

  async deactivatePlaceByRoomId(mapId: string, roomId: string): Promise<void> {
    await query(
      `UPDATE indoor_places SET active = FALSE
       WHERE map_id = $1 AND metadata->>'roomId' = $2`,
      [mapId, roomId],
    );
  },

  async getHandoffById(id: string): Promise<IndoorHandoff | null> {
    const { rows } = await query(`SELECT * FROM indoor_handoffs WHERE id = $1`, [id]);
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id as string,
      outdoorNodeId: r.outdoor_node_id as string,
      indoorNodeId: r.indoor_node_id as string,
      buildingId: r.building_id as string,
      mapId: r.map_id as string,
      prompt: r.prompt as string,
      active: Boolean(r.active),
    };
  },

  async loadBundle(mapId: string, includeInactive = false): Promise<IndoorMapBundle | null> {
    const map = await this.getMap(mapId);
    if (!map || (!includeInactive && !map.active)) return null;
    const [nodes, edges, places, anchors] = await Promise.all([
      this.listNodes(mapId, includeInactive),
      this.listEdges(mapId, includeInactive),
      this.listPlaces(mapId, includeInactive),
      this.listAnchors(mapId),
    ]);
    return { map, nodes, edges, places, anchors };
  },
};
