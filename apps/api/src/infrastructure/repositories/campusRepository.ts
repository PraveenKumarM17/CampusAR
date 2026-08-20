import type {
  AccessibilityPrefs,
  Building,
  CampusEvent,
  CampusPlace,
  CrowdLevel,
  DangerZone,
  EmergencyContact,
  EmergencyExit,
  Floor,
  GraphEdge,
  GraphNode,
  Room,
  RouteWeights,
  SearchResult,
  SensorKind,
  SensorReading,
} from '@campusar/shared';
import { query } from '../db/pool';
import type { RoutingEdge, RoutingNode } from '../../domain/routing/astar';
import { broadcast } from '../realtime/wsHub';

export const campusRepository = {
  async listBuildings(): Promise<Building[]> {
    const { rows } = await query<{
      id: string;
      name: string;
      code: string;
      description: string | null;
      latitude: number;
      longitude: number;
      floors_count: number;
    }>(`SELECT * FROM buildings ORDER BY name`);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      description: r.description,
      latitude: r.latitude,
      longitude: r.longitude,
      floorsCount: r.floors_count,
    }));
  },

  async createBuilding(input: Omit<Building, 'id'>) {
    const { rows } = await query(
      `INSERT INTO buildings (name, code, description, latitude, longitude, floors_count)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        input.name,
        input.code,
        input.description,
        input.latitude,
        input.longitude,
        input.floorsCount,
      ],
    );
    const r = rows[0] as Record<string, unknown>;
    return {
      id: r.id as string,
      name: r.name as string,
      code: r.code as string,
      description: r.description as string | null,
      latitude: r.latitude as number,
      longitude: r.longitude as number,
      floorsCount: r.floors_count as number,
    };
  },

  async updateBuilding(id: string, input: Partial<Omit<Building, 'id'>>) {
    const { rows } = await query(
      `UPDATE buildings SET
         name = COALESCE($2, name),
         code = COALESCE($3, code),
         description = COALESCE($4, description),
         latitude = COALESCE($5, latitude),
         longitude = COALESCE($6, longitude),
         floors_count = COALESCE($7, floors_count)
       WHERE id = $1 RETURNING *`,
      [
        id,
        input.name ?? null,
        input.code ?? null,
        input.description ?? null,
        input.latitude ?? null,
        input.longitude ?? null,
        input.floorsCount ?? null,
      ],
    );
    if (!rows[0]) return null;
    const r = rows[0] as Record<string, unknown>;
    return {
      id: r.id as string,
      name: r.name as string,
      code: r.code as string,
      description: r.description as string | null,
      latitude: r.latitude as number,
      longitude: r.longitude as number,
      floorsCount: r.floors_count as number,
    };
  },

  async deleteBuilding(id: string) {
    await query(`DELETE FROM buildings WHERE id = $1`, [id]);
  },

  async listFloors(buildingId?: string): Promise<Floor[]> {
    const { rows } = buildingId
      ? await query(
          `SELECT id, building_id, level, name FROM floors WHERE building_id = $1 ORDER BY level`,
          [buildingId],
        )
      : await query(`SELECT id, building_id, level, name FROM floors ORDER BY building_id, level`);
    return (rows as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      buildingId: r.building_id as string,
      level: r.level as number,
      name: r.name as string,
    }));
  },

  async listRooms(filters?: { buildingId?: string; category?: string }): Promise<Room[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filters?.buildingId) {
      params.push(filters.buildingId);
      clauses.push(`building_id = $${params.length}`);
    }
    if (filters?.category) {
      params.push(filters.category);
      clauses.push(`category = $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await query(`SELECT * FROM rooms ${where} ORDER BY code`, params);
    return (rows as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      floorId: r.floor_id as string,
      buildingId: r.building_id as string,
      name: r.name as string,
      code: r.code as string,
      category: r.category as Room['category'],
      nodeId: r.node_id as string | null,
      wheelchairAccessible: r.wheelchair_accessible as boolean,
    }));
  },

  async search(q: string): Promise<SearchResult[]> {
    const pattern = `%${q}%`;
    const { rows: buildings } = await query(
      `SELECT id, name, code, latitude, longitude FROM buildings
       WHERE name ILIKE $1 OR code ILIKE $1 LIMIT 20`,
      [pattern],
    );
    const { rows: rooms } = await query(
      `SELECT r.id, r.name, r.code, r.category, r.node_id, b.name AS building_name,
              COALESCE(n.latitude, b.latitude) AS latitude,
              COALESCE(n.longitude, b.longitude) AS longitude
       FROM rooms r
       JOIN buildings b ON b.id = r.building_id
       LEFT JOIN nodes n ON n.id = r.node_id
       WHERE r.name ILIKE $1 OR r.code ILIKE $1 OR r.category ILIKE $1
       LIMIT 20`,
      [pattern],
    );

    const results: SearchResult[] = [
      ...(buildings as Array<Record<string, unknown>>).map((b) => ({
        type: 'building' as const,
        id: b.id as string,
        name: b.name as string,
        code: b.code as string,
        nodeId: null,
        latitude: b.latitude as number,
        longitude: b.longitude as number,
      })),
      ...(rooms as Array<Record<string, unknown>>).map((r) => ({
        type: 'room' as const,
        id: r.id as string,
        name: r.name as string,
        code: r.code as string,
        category: r.category as Room['category'],
        buildingName: r.building_name as string,
        nodeId: r.node_id as string | null,
        latitude: r.latitude as number,
        longitude: r.longitude as number,
      })),
    ];

    const { rows: places } = await query(
      `SELECT id, name, latitude, longitude, kind FROM nodes
       WHERE active = TRUE
         AND name IS NOT NULL AND trim(name) <> '' AND name ILIKE $1
       LIMIT 20`,
      [pattern],
    );
    for (const p of places as Array<Record<string, unknown>>) {
      results.push({
        type: 'place',
        id: p.id as string,
        name: p.name as string,
        code: String(p.kind ?? 'place'),
        nodeId: p.id as string,
        latitude: p.latitude as number,
        longitude: p.longitude as number,
      });
    }

    return results;
  },

  async listNodes(): Promise<GraphNode[]> {
    const { rows } = await query(`SELECT * FROM nodes ORDER BY name NULLS LAST, id`);
    return (rows as Array<Record<string, unknown>>).map((r) => this.mapNodeRow(r));
  },

  async listActiveNodes(): Promise<GraphNode[]> {
    const { rows } = await query(
      `SELECT * FROM nodes WHERE active = TRUE ORDER BY name NULLS LAST, id`,
    );
    return (rows as Array<Record<string, unknown>>).map((r) => this.mapNodeRow(r));
  },

  async listNamedPlaces(): Promise<CampusPlace[]> {
    const { rows } = await query(
      `SELECT DISTINCT ON (lower(trim(name)))
         id, name, latitude, longitude, floor_id, building_id, kind, active
       FROM nodes
       WHERE active = TRUE
         AND name IS NOT NULL
         AND trim(name) <> ''
       ORDER BY lower(trim(name)), name ASC, id ASC`,
    );
    return (rows as Array<Record<string, unknown>>).map((r) => {
      const node = this.mapNodeRow(r);
      return {
        id: node.id,
        name: node.name!.trim(),
        latitude: node.latitude,
        longitude: node.longitude,
        floorId: node.floorId,
        buildingId: node.buildingId,
        kind: node.kind,
      };
    });
  },

  async getNodeById(id: string): Promise<GraphNode | null> {
    const { rows } = await query(`SELECT * FROM nodes WHERE id = $1`, [id]);
    if (!rows[0]) return null;
    return this.mapNodeRow(rows[0] as Record<string, unknown>);
  },

  async findOutdoorEntrance(buildingId: string): Promise<GraphNode | null> {
    const { rows } = await query(
      `SELECT * FROM nodes
       WHERE building_id = $1
         AND active = TRUE
         AND name IS NOT NULL AND trim(name) <> ''
       ORDER BY
         CASE kind
           WHEN 'entrance' THEN 0
           WHEN 'exit' THEN 1
           ELSE 2
         END,
         name
       LIMIT 1`,
      [buildingId],
    );
    if (!rows[0]) return null;
    return this.mapNodeRow(rows[0] as Record<string, unknown>);
  },

  mapNodeRow(r: Record<string, unknown>): GraphNode {
    return {
      id: r.id as string,
      name: r.name as string | null,
      latitude: r.latitude as number,
      longitude: r.longitude as number,
      floorId: r.floor_id as string | null,
      buildingId: r.building_id as string | null,
      kind: r.kind as GraphNode['kind'],
      active: (r.active as boolean | undefined) ?? true,
    };
  },

  async listEdges(): Promise<GraphEdge[]> {
    const { rows } = await query(`SELECT * FROM edges`);
    return (rows as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      fromNodeId: r.from_node_id as string,
      toNodeId: r.to_node_id as string,
      distanceM: Number(r.distance_m),
      kind: r.kind as GraphEdge['kind'],
      bidirectional: r.bidirectional as boolean,
      blocked: r.blocked as boolean,
      safetyScore: Number(r.safety_score),
      crowdScore: Number(r.crowd_score),
      accessibilityScore: Number(r.accessibility_score),
    }));
  },

  async getRoutingGraph(): Promise<{
    nodes: Map<string, RoutingNode>;
    edges: RoutingEdge[];
  }> {
    const nodesList = await this.listActiveNodes();
    const activeIds = new Set(nodesList.map((n) => n.id));
    const edgesList = (await this.listEdges()).filter(
      (e) => activeIds.has(e.fromNodeId) && activeIds.has(e.toNodeId),
    );
    const nodes = new Map(
      nodesList.map((n) => [
        n.id,
        { id: n.id, latitude: n.latitude, longitude: n.longitude, name: n.name },
      ]),
    );
    const edges: RoutingEdge[] = edgesList.map((e) => ({ ...e }));
    return { nodes, edges };
  },

  async getWeights(): Promise<RouteWeights> {
    const { rows } = await query(`SELECT * FROM route_weights WHERE id = 1`);
    const r = rows[0] as Record<string, unknown>;
    return {
      wDistance: Number(r.w_distance),
      wSafety: Number(r.w_safety),
      wCrowd: Number(r.w_crowd),
      wAccessibility: Number(r.w_accessibility),
      wBlockedPenalty: Number(r.w_blocked_penalty),
    };
  },

  async updateWeights(weights: RouteWeights): Promise<RouteWeights> {
    await query(
      `UPDATE route_weights SET
         w_distance = $1, w_safety = $2, w_crowd = $3,
         w_accessibility = $4, w_blocked_penalty = $5, updated_at = NOW()
       WHERE id = 1`,
      [
        weights.wDistance,
        weights.wSafety,
        weights.wCrowd,
        weights.wAccessibility,
        weights.wBlockedPenalty,
      ],
    );
    return weights;
  },

  async createEdge(input: Omit<GraphEdge, 'id'>) {
    const { rows } = await query(
      `INSERT INTO edges (from_node_id, to_node_id, distance_m, kind, bidirectional, blocked,
        safety_score, crowd_score, accessibility_score)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        input.fromNodeId,
        input.toNodeId,
        input.distanceM,
        input.kind,
        input.bidirectional,
        input.blocked,
        input.safetyScore,
        input.crowdScore,
        input.accessibilityScore,
      ],
    );
    const r = rows[0] as Record<string, unknown>;
    return {
      id: r.id as string,
      fromNodeId: r.from_node_id as string,
      toNodeId: r.to_node_id as string,
      distanceM: Number(r.distance_m),
      kind: r.kind as GraphEdge['kind'],
      bidirectional: r.bidirectional as boolean,
      blocked: r.blocked as boolean,
      safetyScore: Number(r.safety_score),
      crowdScore: Number(r.crowd_score),
      accessibilityScore: Number(r.accessibility_score),
    };
  },

  async updateEdge(id: string, input: Partial<Omit<GraphEdge, 'id'>>) {
    const { rows } = await query(
      `UPDATE edges SET
         from_node_id = COALESCE($2, from_node_id),
         to_node_id = COALESCE($3, to_node_id),
         distance_m = COALESCE($4, distance_m),
         kind = COALESCE($5, kind),
         bidirectional = COALESCE($6, bidirectional),
         blocked = COALESCE($7, blocked),
         safety_score = COALESCE($8, safety_score),
         crowd_score = COALESCE($9, crowd_score),
         accessibility_score = COALESCE($10, accessibility_score)
       WHERE id = $1 RETURNING *`,
      [
        id,
        input.fromNodeId ?? null,
        input.toNodeId ?? null,
        input.distanceM ?? null,
        input.kind ?? null,
        input.bidirectional ?? null,
        input.blocked ?? null,
        input.safetyScore ?? null,
        input.crowdScore ?? null,
        input.accessibilityScore ?? null,
      ],
    );
    if (!rows[0]) return null;
    const r = rows[0] as Record<string, unknown>;
    return {
      id: r.id as string,
      fromNodeId: r.from_node_id as string,
      toNodeId: r.to_node_id as string,
      distanceM: Number(r.distance_m),
      kind: r.kind as GraphEdge['kind'],
      bidirectional: r.bidirectional as boolean,
      blocked: r.blocked as boolean,
      safetyScore: Number(r.safety_score),
      crowdScore: Number(r.crowd_score),
      accessibilityScore: Number(r.accessibility_score),
    };
  },

  async deleteEdge(id: string) {
    await query(`DELETE FROM edges WHERE id = $1`, [id]);
  },

  async createNode(input: Omit<GraphNode, 'id'>) {
    const { rows } = await query(
      `INSERT INTO nodes (name, latitude, longitude, floor_id, building_id, kind)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [input.name, input.latitude, input.longitude, input.floorId, input.buildingId, input.kind],
    );
    const r = rows[0] as Record<string, unknown>;
    return {
      id: r.id as string,
      name: r.name as string | null,
      latitude: r.latitude as number,
      longitude: r.longitude as number,
      floorId: r.floor_id as string | null,
      buildingId: r.building_id as string | null,
      kind: r.kind as GraphNode['kind'],
    };
  },

  async updateNode(id: string, input: Partial<Omit<GraphNode, 'id'>>) {
    const { rows } = await query(
      `UPDATE nodes SET
         name = CASE WHEN $2::boolean THEN $3 ELSE name END,
         latitude = CASE WHEN $4::boolean THEN $5::float8 ELSE latitude END,
         longitude = CASE WHEN $6::boolean THEN $7::float8 ELSE longitude END,
         floor_id = CASE WHEN $8::boolean THEN $9::uuid ELSE floor_id END,
         building_id = CASE WHEN $10::boolean THEN $11::uuid ELSE building_id END,
         kind = CASE WHEN $12::boolean THEN $13 ELSE kind END
       WHERE id = $1 RETURNING *`,
      [
        id,
        input.name !== undefined,
        input.name ?? null,
        input.latitude !== undefined,
        input.latitude ?? null,
        input.longitude !== undefined,
        input.longitude ?? null,
        input.floorId !== undefined,
        input.floorId ?? null,
        input.buildingId !== undefined,
        input.buildingId ?? null,
        input.kind !== undefined,
        input.kind ?? null,
      ],
    );
    if (!rows[0]) return null;
    const r = rows[0] as Record<string, unknown>;
    return {
      id: r.id as string,
      name: r.name as string | null,
      latitude: r.latitude as number,
      longitude: r.longitude as number,
      floorId: r.floor_id as string | null,
      buildingId: r.building_id as string | null,
      kind: r.kind as GraphNode['kind'],
    };
  },

  async deleteNode(id: string) {
    await query(`UPDATE nodes SET active = FALSE WHERE id = $1`, [id]);
  },

  async listDangerZones(): Promise<DangerZone[]> {
    const { rows } = await query(`SELECT * FROM danger_zones ORDER BY name`);
    return (rows as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      type: r.type as DangerZone['type'],
      latitude: r.latitude as number,
      longitude: r.longitude as number,
      radiusM: Number(r.radius_m),
      description: r.description as string | null,
      active: r.active as boolean,
    }));
  },

  async createDangerZone(input: Omit<DangerZone, 'id'>) {
    const { rows } = await query(
      `INSERT INTO danger_zones (name, type, latitude, longitude, radius_m, description, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        input.name,
        input.type,
        input.latitude,
        input.longitude,
        input.radiusM,
        input.description,
        input.active,
      ],
    );
    const r = rows[0] as Record<string, unknown>;
    const zone = {
      id: r.id as string,
      name: r.name as string,
      type: r.type as DangerZone['type'],
      latitude: r.latitude as number,
      longitude: r.longitude as number,
      radiusM: Number(r.radius_m),
      description: r.description as string | null,
      active: r.active as boolean,
    };
    broadcast('hazard', { zones: [zone] });
    return zone;
  },

  async updateDangerZone(id: string, input: Partial<Omit<DangerZone, 'id'>>) {
    const { rows } = await query(
      `UPDATE danger_zones SET
         name = COALESCE($2, name),
         type = COALESCE($3, type),
         latitude = COALESCE($4, latitude),
         longitude = COALESCE($5, longitude),
         radius_m = COALESCE($6, radius_m),
         description = COALESCE($7, description),
         active = COALESCE($8, active)
       WHERE id = $1 RETURNING *`,
      [
        id,
        input.name ?? null,
        input.type ?? null,
        input.latitude ?? null,
        input.longitude ?? null,
        input.radiusM ?? null,
        input.description ?? null,
        input.active ?? null,
      ],
    );
    if (!rows[0]) return null;
    const r = rows[0] as Record<string, unknown>;
    return {
      id: r.id as string,
      name: r.name as string,
      type: r.type as DangerZone['type'],
      latitude: r.latitude as number,
      longitude: r.longitude as number,
      radiusM: Number(r.radius_m),
      description: r.description as string | null,
      active: r.active as boolean,
    };
  },

  async deleteDangerZone(id: string) {
    await query(`DELETE FROM danger_zones WHERE id = $1`, [id]);
  },

  async listCrowdLevels(): Promise<CrowdLevel[]> {
    const { rows } = await query(`SELECT * FROM crowd_levels ORDER BY updated_at DESC`);
    return (rows as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      edgeId: r.edge_id as string | null,
      nodeId: r.node_id as string | null,
      intensity: Number(r.intensity),
      label: r.label as string | null,
      updatedAt: (r.updated_at as Date).toISOString(),
    }));
  },

  async upsertCrowdLevel(input: {
    id?: string;
    edgeId?: string | null;
    nodeId?: string | null;
    intensity: number;
    label?: string | null;
  }) {
    if (input.id) {
      const { rows } = await query(
        `UPDATE crowd_levels SET intensity = $2, label = COALESCE($3, label), updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [input.id, input.intensity, input.label ?? null],
      );
      const r = rows[0] as Record<string, unknown>;
      if (r?.edge_id) {
        await query(`UPDATE edges SET crowd_score = $1 WHERE id = $2`, [
          input.intensity,
          r.edge_id,
        ]);
      }
      return {
        id: r.id as string,
        edgeId: r.edge_id as string | null,
        nodeId: r.node_id as string | null,
        intensity: Number(r.intensity),
        label: r.label as string | null,
        updatedAt: (r.updated_at as Date).toISOString(),
      };
    }
    const { rows } = await query(
      `INSERT INTO crowd_levels (edge_id, node_id, intensity, label)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [input.edgeId ?? null, input.nodeId ?? null, input.intensity, input.label ?? null],
    );
    const r = rows[0] as Record<string, unknown>;
    if (input.edgeId) {
      await query(`UPDATE edges SET crowd_score = $1 WHERE id = $2`, [
        input.intensity,
        input.edgeId,
      ]);
    }
    return {
      id: r.id as string,
      edgeId: r.edge_id as string | null,
      nodeId: r.node_id as string | null,
      intensity: Number(r.intensity),
      label: r.label as string | null,
      updatedAt: (r.updated_at as Date).toISOString(),
    };
  },

  async deleteCrowdLevel(id: string) {
    await query(`DELETE FROM crowd_levels WHERE id = $1`, [id]);
  },

  async upsertCrowdByEdge(edgeId: string, intensity: number, label?: string | null) {
    const existing = await query(`SELECT id FROM crowd_levels WHERE edge_id = $1 LIMIT 1`, [
      edgeId,
    ]);
    if (existing.rows[0]) {
      return this.upsertCrowdLevel({
        id: (existing.rows[0] as { id: string }).id,
        intensity,
        label: label ?? null,
      });
    }
    return this.upsertCrowdLevel({ edgeId, intensity, label: label ?? null });
  },

  async insertSensorReading(input: {
    zoneKey: string;
    buildingId?: string | null;
    kind: SensorKind;
    value: number;
  }): Promise<SensorReading> {
    const { rows } = await query(
      `INSERT INTO sensor_readings (zone_key, building_id, kind, value)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [input.zoneKey, input.buildingId ?? null, input.kind, input.value],
    );
    const r = rows[0] as Record<string, unknown>;
    return {
      id: r.id as string,
      zoneKey: r.zone_key as string,
      buildingId: r.building_id as string | null,
      kind: r.kind as SensorKind,
      value: Number(r.value),
      recordedAt: (r.recorded_at as Date).toISOString(),
    };
  },

  async listLatestSensors(limit = 80): Promise<SensorReading[]> {
    const { rows } = await query(
      `SELECT DISTINCT ON (zone_key, kind) *
       FROM sensor_readings
       ORDER BY zone_key, kind, recorded_at DESC
       LIMIT $1`,
      [limit],
    );
    return (rows as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      zoneKey: r.zone_key as string,
      buildingId: r.building_id as string | null,
      kind: r.kind as SensorKind,
      value: Number(r.value),
      recordedAt: (r.recorded_at as Date).toISOString(),
    }));
  },

  async listActiveDangerZones(): Promise<DangerZone[]> {
    const zones = await this.listDangerZones();
    return zones.filter((z) => z.active);
  },

  async listActiveRoutingEvents(now = new Date()): Promise<CampusEvent[]> {
    const events = await this.listEvents();
    const t = now.getTime();
    return events.filter(
      (e) =>
        e.active &&
        e.affectsRouting &&
        new Date(e.startsAt).getTime() <= t &&
        new Date(e.endsAt).getTime() >= t,
    );
  },

  async listEvents(): Promise<CampusEvent[]> {
    const { rows } = await query(`SELECT * FROM events ORDER BY starts_at DESC`);
    return (rows as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      title: r.title as string,
      description: r.description as string | null,
      latitude: r.latitude as number | null,
      longitude: r.longitude as number | null,
      startsAt: (r.starts_at as Date).toISOString(),
      endsAt: (r.ends_at as Date).toISOString(),
      affectsRouting: r.affects_routing as boolean,
      active: r.active as boolean,
    }));
  },

  async createEvent(input: Omit<CampusEvent, 'id'>) {
    const { rows } = await query(
      `INSERT INTO events (title, description, latitude, longitude, starts_at, ends_at, affects_routing, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        input.title,
        input.description,
        input.latitude,
        input.longitude,
        input.startsAt,
        input.endsAt,
        input.affectsRouting,
        input.active,
      ],
    );
    const r = rows[0] as Record<string, unknown>;
    return {
      id: r.id as string,
      title: r.title as string,
      description: r.description as string | null,
      latitude: r.latitude as number | null,
      longitude: r.longitude as number | null,
      startsAt: (r.starts_at as Date).toISOString(),
      endsAt: (r.ends_at as Date).toISOString(),
      affectsRouting: r.affects_routing as boolean,
      active: r.active as boolean,
    };
  },

  async updateEvent(id: string, input: Partial<Omit<CampusEvent, 'id'>>) {
    const { rows } = await query(
      `UPDATE events SET
         title = COALESCE($2, title),
         description = COALESCE($3, description),
         latitude = COALESCE($4, latitude),
         longitude = COALESCE($5, longitude),
         starts_at = COALESCE($6, starts_at),
         ends_at = COALESCE($7, ends_at),
         affects_routing = COALESCE($8, affects_routing),
         active = COALESCE($9, active)
       WHERE id = $1 RETURNING *`,
      [
        id,
        input.title ?? null,
        input.description ?? null,
        input.latitude ?? null,
        input.longitude ?? null,
        input.startsAt ?? null,
        input.endsAt ?? null,
        input.affectsRouting ?? null,
        input.active ?? null,
      ],
    );
    if (!rows[0]) return null;
    const r = rows[0] as Record<string, unknown>;
    return {
      id: r.id as string,
      title: r.title as string,
      description: r.description as string | null,
      latitude: r.latitude as number | null,
      longitude: r.longitude as number | null,
      startsAt: (r.starts_at as Date).toISOString(),
      endsAt: (r.ends_at as Date).toISOString(),
      affectsRouting: r.affects_routing as boolean,
      active: r.active as boolean,
    };
  },

  async deleteEvent(id: string) {
    await query(`DELETE FROM events WHERE id = $1`, [id]);
  },

  async listEmergencyContacts(): Promise<EmergencyContact[]> {
    const { rows } = await query(`SELECT * FROM emergency_contacts`);
    return (rows as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      kind: r.kind as EmergencyContact['kind'],
      phone: r.phone as string,
      latitude: r.latitude as number | null,
      longitude: r.longitude as number | null,
      nodeId: r.node_id as string | null,
    }));
  },

  async listEmergencyExits(): Promise<EmergencyExit[]> {
    const { rows } = await query(`SELECT * FROM emergency_exits`);
    return (rows as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      buildingId: r.building_id as string | null,
      nodeId: r.node_id as string,
      latitude: r.latitude as number,
      longitude: r.longitude as number,
    }));
  },
};

// silence unused import for AccessibilityPrefs if only used by callers
export type { AccessibilityPrefs };
