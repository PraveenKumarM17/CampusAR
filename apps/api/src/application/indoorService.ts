import { z } from 'zod';
import type {
  IndoorEdgeKind,
  IndoorNodeKind,
  IndoorPlaceCategory,
  IndoorRoutePreferences,
  LocalVec3,
} from '@campusar/shared';
import { DEFAULT_INDOOR_PREFERENCES, INDOOR_MIN_NODE_SPACING_M, INDOOR_SNAP_DISTANCE_M } from '@campusar/shared';
import { AppError } from '../domain/errors';
import { campusRepository } from '../infrastructure/repositories/campusRepository';
import { indoorRepository } from '../infrastructure/repositories/indoorRepository';
import { edgeDistanceM, snapCandidate } from '../domain/indoor/geometry';
import { buildIndoorSteps, etaMinutes, routeIndoorGraph } from '../domain/indoor/indoorRouting';
import { indoorAnchorBuildingError, indoorPlaceBuildingError } from '../domain/indoor/buildingHandoff';

const uuid = z.string().uuid();

const nodeKind = z.enum([
  'entrance',
  'corridor',
  'junction',
  'turn',
  'room_entrance',
  'destination',
  'stairs',
  'elevator',
  'ramp',
  'emergency_exit',
  'qr_anchor',
  'landmark',
]) satisfies z.ZodType<IndoorNodeKind>;

const edgeKind = z.enum(['walk', 'stairs', 'elevator', 'ramp', 'escalator']) satisfies z.ZodType<IndoorEdgeKind>;

const placeCategory = z.enum([
  'building',
  'floor',
  'room',
  'cabin',
  'person',
  'cubicle',
  'facility',
  'other',
]) satisfies z.ZodType<IndoorPlaceCategory>;

const vec3 = z.object({ x: z.number(), y: z.number(), z: z.number() }) satisfies z.ZodType<LocalVec3>;

export const createMapSchema = z.object({
  buildingId: uuid,
  name: z.string().trim().min(1).max(120),
  notes: z.string().max(2000).nullable().optional(),
  trackingQuality: z.string().max(40).nullable().optional(),
  planeCount: z.number().int().min(0).optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
});

export const updateMapSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  status: z.enum(['draft', 'published']).optional(),
  originAnchorId: uuid.nullable().optional(),
  trackingQuality: z.string().max(40).nullable().optional(),
  planeCount: z.number().int().min(0).optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  active: z.boolean().optional(),
});

export const createNodeSchema = z.object({
  mapId: uuid,
  floorId: uuid,
  anchorId: uuid.nullable().optional(),
  localX: z.number(),
  localY: z.number().optional(),
  localZ: z.number(),
  kind: nodeKind.optional(),
  name: z.string().trim().min(1).max(120).nullable().optional(),
  category: z.string().max(80).nullable().optional(),
  accuracyM: z.number().min(0).max(10).nullable().optional(),
  trackingQuality: z.string().max(40).nullable().optional(),
  snap: z.boolean().optional(),
});

export const updateNodeSchema = z.object({
  floorId: uuid.optional(),
  anchorId: uuid.nullable().optional(),
  localX: z.number().optional(),
  localY: z.number().optional(),
  localZ: z.number().optional(),
  kind: nodeKind.optional(),
  name: z.string().trim().min(1).max(120).nullable().optional(),
  category: z.string().max(80).nullable().optional(),
  accuracyM: z.number().min(0).max(10).nullable().optional(),
  trackingQuality: z.string().max(40).nullable().optional(),
  active: z.boolean().optional(),
});

export const createEdgeSchema = z.object({
  mapId: uuid,
  fromNodeId: uuid,
  toNodeId: uuid,
  kind: edgeKind.optional(),
  bidirectional: z.boolean().optional(),
  wheelchairAccessible: z.boolean().optional(),
  waypoints: z.array(vec3).optional(),
});

export const updateEdgeSchema = z.object({
  fromNodeId: uuid.optional(),
  toNodeId: uuid.optional(),
  kind: edgeKind.optional(),
  bidirectional: z.boolean().optional(),
  wheelchairAccessible: z.boolean().optional(),
  waypoints: z.array(vec3).optional(),
  active: z.boolean().optional(),
});

export const createPlaceSchema = z.object({
  mapId: uuid,
  floorId: uuid.nullable().optional(),
  nodeId: uuid.nullable().optional(),
  parentPlaceId: uuid.nullable().optional(),
  name: z.string().trim().min(1).max(160),
  category: placeCategory.optional(),
  searchable: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const updatePlaceSchema = z.object({
  floorId: uuid.nullable().optional(),
  nodeId: uuid.nullable().optional(),
  parentPlaceId: uuid.nullable().optional(),
  name: z.string().trim().min(1).max(160).optional(),
  category: placeCategory.optional(),
  searchable: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
  active: z.boolean().optional(),
});

export const createAnchorSchema = z.object({
  mapId: uuid,
  nodeId: uuid,
  floorId: uuid.optional(),
  anchorCode: z.string().trim().min(3).max(80),
  physicalMarkerType: z.string().trim().min(1).max(40).optional(),
  localX: z.number().optional(),
  localY: z.number().optional(),
  localZ: z.number().optional(),
});

export const createHandoffSchema = z.object({
  outdoorNodeId: uuid,
  indoorNodeId: uuid,
  prompt: z.string().trim().min(1).max(240).optional(),
});

export const indoorRouteSchema = z
  .object({
    sourceNodeId: uuid.optional(),
    sourceAnchorCode: z.string().trim().min(3).max(80).optional(),
    destinationPlaceId: uuid,
    expectedBuildingId: uuid.optional(),
    preferences: z
      .object({
        avoidStairs: z.boolean().optional(),
        preferElevator: z.boolean().optional(),
        wheelchairAccessible: z.boolean().optional(),
      })
      .optional(),
  })
  .refine((b) => Boolean(b.sourceNodeId || b.sourceAnchorCode), {
    message: 'sourceNodeId or sourceAnchorCode is required',
  });

async function requireMap(mapId: string, admin = false) {
  const map = await indoorRepository.getMap(mapId);
  if (!map || !map.active) throw new AppError('NOT_FOUND', 'Indoor map not found', 404);
  if (!admin && map.status !== 'published') {
    throw new AppError('NOT_FOUND', 'Indoor map is not published', 404);
  }
  return map;
}

export const indoorService = {
  async createMap(body: z.infer<typeof createMapSchema>, userId: string | null) {
    const buildings = await campusRepository.listBuildings();
    if (!buildings.some((b) => b.id === body.buildingId)) {
      throw new AppError('NOT_FOUND', 'Building not found', 404);
    }
    return indoorRepository.createMap({ ...body, createdBy: userId });
  },

  async getBundle(id: string, admin = false) {
    const bundle = await indoorRepository.loadBundle(id, admin);
    if (!bundle || !bundle.map.active) throw new AppError('NOT_FOUND', 'Indoor map not found', 404);
    if (!admin && bundle.map.status !== 'published') {
      throw new AppError('NOT_FOUND', 'Indoor map is not published', 404);
    }
    return bundle;
  },

  async updateMap(id: string, body: z.infer<typeof updateMapSchema>) {
    const updated = await indoorRepository.updateMap(id, body);
    if (!updated) throw new AppError('NOT_FOUND', 'Indoor map not found', 404);
    return updated;
  },

  async createNode(body: z.infer<typeof createNodeSchema>) {
    const map = await requireMap(body.mapId, true);
    const floors = await campusRepository.listFloors(map.buildingId);
    if (!floors.some((f) => f.id === body.floorId)) {
      throw new AppError('NOT_FOUND', 'Floor not found in this building', 404);
    }
    const existing = await indoorRepository.listNodes(map.id);
    const point = { x: body.localX, y: body.localY ?? 0, z: body.localZ };
    if (body.snap !== false) {
      const snapped = snapCandidate(point, existing, INDOOR_SNAP_DISTANCE_M);
      if (snapped) return snapped;
    }
    const tooClose = snapCandidate(point, existing, INDOOR_MIN_NODE_SPACING_M);
    if (tooClose && body.snap === false) {
      throw new AppError(
        'TOO_CLOSE',
        'Point is too close to an existing node. Snap or move farther away.',
        422,
        { existingNodeId: tooClose.id },
      );
    }
    return indoorRepository.createNode({
      mapId: map.id,
      buildingId: map.buildingId,
      floorId: body.floorId,
      anchorId: body.anchorId ?? null,
      localX: body.localX,
      localY: body.localY ?? 0,
      localZ: body.localZ,
      kind: body.kind ?? 'corridor',
      name: body.name ?? null,
      category: body.category ?? null,
      accuracyM: body.accuracyM ?? null,
      trackingQuality: body.trackingQuality ?? null,
      active: true,
    });
  },

  async updateNode(id: string, body: z.infer<typeof updateNodeSchema>) {
    const updated = await indoorRepository.updateNode(id, body);
    if (!updated) throw new AppError('NOT_FOUND', 'Indoor node not found', 404);
    return updated;
  },

  async deleteNode(id: string) {
    const ok = await indoorRepository.softDeleteNode(id);
    if (!ok) throw new AppError('NOT_FOUND', 'Indoor node not found', 404);
  },

  async createEdge(body: z.infer<typeof createEdgeSchema>) {
    const map = await requireMap(body.mapId, true);
    if (body.fromNodeId === body.toNodeId) {
      throw new AppError('SAME_NODE', 'Cannot connect a node to itself', 422);
    }
    const from = await indoorRepository.getNode(body.fromNodeId);
    const to = await indoorRepository.getNode(body.toNodeId);
    if (!from || !to || from.mapId !== map.id || to.mapId !== map.id || !from.active || !to.active) {
      throw new AppError('NOT_FOUND', 'Both nodes must exist on this indoor map', 404);
    }
    const waypoints = body.waypoints ?? [];
    const distanceM = edgeDistanceM(
      { x: from.localX, y: from.localY, z: from.localZ },
      { x: to.localX, y: to.localY, z: to.localZ },
      waypoints,
    );
    if (distanceM <= 0) {
      throw new AppError('INVALID_DISTANCE', 'Edge distance must be greater than zero', 422);
    }
    const kind = body.kind ?? 'walk';
    return indoorRepository.createEdge({
      mapId: map.id,
      buildingId: map.buildingId,
      fromFloorId: from.floorId,
      toFloorId: to.floorId,
      fromNodeId: from.id,
      toNodeId: to.id,
      distanceM,
      kind,
      bidirectional: body.bidirectional ?? true,
      wheelchairAccessible: body.wheelchairAccessible ?? (kind !== 'stairs' && kind !== 'escalator'),
      waypoints,
      active: true,
    });
  },

  async updateEdge(id: string, body: z.infer<typeof updateEdgeSchema>) {
    const existing = await indoorRepository.getEdge(id);
    if (!existing) throw new AppError('NOT_FOUND', 'Indoor edge not found', 404);
    let distanceM = existing.distanceM;
    if (body.fromNodeId || body.toNodeId || body.waypoints) {
      const from = await indoorRepository.getNode(body.fromNodeId ?? existing.fromNodeId);
      const to = await indoorRepository.getNode(body.toNodeId ?? existing.toNodeId);
      if (!from || !to) throw new AppError('NOT_FOUND', 'Edge endpoints not found', 404);
      distanceM = edgeDistanceM(
        { x: from.localX, y: from.localY, z: from.localZ },
        { x: to.localX, y: to.localY, z: to.localZ },
        body.waypoints ?? existing.waypoints,
      );
    }
    const updated = await indoorRepository.updateEdge(id, { ...body, distanceM });
    if (!updated) throw new AppError('NOT_FOUND', 'Indoor edge not found', 404);
    return updated;
  },

  async deleteEdge(id: string) {
    const ok = await indoorRepository.softDeleteEdge(id);
    if (!ok) throw new AppError('NOT_FOUND', 'Indoor edge not found', 404);
  },

  async createPlace(body: z.infer<typeof createPlaceSchema>) {
    const map = await requireMap(body.mapId, true);
    if (body.parentPlaceId) {
      const parent = await indoorRepository.getPlace(body.parentPlaceId);
      if (!parent || parent.mapId !== map.id) {
        throw new AppError('NOT_FOUND', 'Parent place not found on this map', 404);
      }
    }
    return indoorRepository.createPlace({
      mapId: map.id,
      buildingId: map.buildingId,
      floorId: body.floorId ?? null,
      nodeId: body.nodeId ?? null,
      parentPlaceId: body.parentPlaceId ?? null,
      name: body.name,
      category: body.category ?? 'other',
      searchable: body.searchable ?? true,
      metadata: body.metadata ?? {},
      active: true,
    });
  },

  async updatePlace(id: string, body: z.infer<typeof updatePlaceSchema>) {
    const updated = await indoorRepository.updatePlace(id, body);
    if (!updated) throw new AppError('NOT_FOUND', 'Indoor place not found', 404);
    return updated;
  },

  async createAnchor(body: z.infer<typeof createAnchorSchema>) {
    const map = await requireMap(body.mapId, true);
    const node = await indoorRepository.getNode(body.nodeId);
    if (!node || node.mapId !== map.id) {
      throw new AppError('NOT_FOUND', 'Anchor node not found on this map', 404);
    }
    const existing = await indoorRepository.getAnchorByCode(body.anchorCode);
    if (existing) throw new AppError('DUPLICATE_CODE', 'Anchor code already exists', 409);
    const created = await indoorRepository.createAnchor({
      mapId: map.id,
      buildingId: map.buildingId,
      floorId: body.floorId ?? node.floorId,
      nodeId: node.id,
      anchorCode: body.anchorCode,
      physicalMarkerType: body.physicalMarkerType ?? 'qr',
      localX: body.localX ?? node.localX,
      localY: body.localY ?? node.localY,
      localZ: body.localZ ?? node.localZ,
      active: true,
    });
    if (!map.originAnchorId) {
      await indoorRepository.updateMap(map.id, { originAnchorId: created.id });
    }
    return created;
  },

  async createHandoff(body: z.infer<typeof createHandoffSchema>) {
    const indoor = await indoorRepository.getNode(body.indoorNodeId);
    if (!indoor || !indoor.active) throw new AppError('NOT_FOUND', 'Indoor node not found', 404);
    const outdoor = await campusRepository.getNodeById(body.outdoorNodeId);
    if (!outdoor) {
      throw new AppError('NOT_FOUND', 'Outdoor node not found', 404);
    }
    return indoorRepository.createHandoff({
      outdoorNodeId: body.outdoorNodeId,
      indoorNodeId: indoor.id,
      buildingId: indoor.buildingId,
      mapId: indoor.mapId,
      prompt: body.prompt ?? 'Indoor navigation available. Scan the CampusAR marker to continue.',
      active: true,
    });
  },

  async getBuildingContext(buildingId: string) {
    const buildings = await campusRepository.listBuildings();
    const building = buildings.find((b) => b.id === buildingId);
    if (!building) throw new AppError('NOT_FOUND', 'Building not found', 404);

    const indoorMap = await indoorRepository.getPublishedMapByBuilding(buildingId);
    const [floors, handoff, outdoorEntrance, places] = await Promise.all([
      campusRepository.listFloors(buildingId),
      indoorRepository.getHandoffByBuilding(buildingId),
      campusRepository.findOutdoorEntrance(buildingId),
      indoorMap ? indoorRepository.listPlacesByBuilding(buildingId) : Promise.resolve([]),
    ]);

    const outdoorNodeId = handoff?.outdoorNodeId ?? outdoorEntrance?.id ?? null;
    const outdoorNode = outdoorNodeId
      ? await campusRepository.getNodeById(outdoorNodeId)
      : outdoorEntrance;

    const anchors = indoorMap
      ? (await indoorRepository.listAnchors(indoorMap.id)).map((a) => ({
          anchorCode: a.anchorCode,
          floorId: a.floorId,
          nodeId: a.nodeId,
        }))
      : [];

    const quickPlaces = places
      .filter((p) => p.category === 'room' || p.category === 'facility' || p.category === 'cabin')
      .slice(0, 6);
    const fallbackQuick = quickPlaces.length > 0 ? quickPlaces : places.slice(0, 6);

    return {
      building: { id: building.id, name: building.name, code: building.code },
      indoorMap: indoorMap
        ? { id: indoorMap.id, name: indoorMap.name, status: indoorMap.status }
        : null,
      entrance: outdoorNode
        ? {
            outdoorNodeId: outdoorNode.id,
            indoorNodeId: handoff?.indoorNodeId ?? null,
            name: outdoorNode.name,
          }
        : null,
      floors,
      placeCount: places.length,
      quickPlaces: fallbackQuick,
      anchors,
    };
  },

  async getPublicPlace(id: string, expectedBuildingId?: string) {
    const place = await indoorRepository.getPlace(id);
    if (!place || !place.active) {
      throw new AppError('NOT_FOUND', 'Indoor destination was not found or is no longer available', 404);
    }
    const map = await indoorRepository.getMap(place.mapId);
    if (!map || !map.active || map.status !== 'published') {
      throw new AppError('NOT_FOUND', 'Indoor destination was not found or is no longer available', 404);
    }
    if (expectedBuildingId && place.buildingId !== expectedBuildingId) {
      const buildings = await campusRepository.listBuildings();
      const expected = buildings.find((b) => b.id === expectedBuildingId);
      const actual = buildings.find((b) => b.id === place.buildingId);
      throw new AppError(
        'PLACE_BUILDING_MISMATCH',
        indoorPlaceBuildingError(expected?.name ?? 'this building', actual?.name ?? 'another building'),
        422,
        { expectedBuildingId, actualBuildingId: place.buildingId },
      );
    }
    return place;
  },

  async listPublicPlaces(buildingId: string) {
    const buildings = await campusRepository.listBuildings();
    if (!buildings.some((b) => b.id === buildingId)) {
      throw new AppError('NOT_FOUND', 'Building not found', 404);
    }
    return indoorRepository.listPlacesByBuilding(buildingId);
  },

  async searchPublicPlaces(q: string, buildingId?: string) {
    if (buildingId) {
      const buildings = await campusRepository.listBuildings();
      if (!buildings.some((b) => b.id === buildingId)) {
        throw new AppError('NOT_FOUND', 'Building not found', 404);
      }
    }
    return indoorRepository.searchPlaces(q, buildingId);
  },

  async resolveAnchor(code: string, expectedBuildingId?: string) {
    const anchor = await indoorRepository.getAnchorByCode(code);
    if (!anchor) throw new AppError('NOT_FOUND', 'Indoor anchor not found', 404);
    const map = await indoorRepository.getMap(anchor.mapId);
    if (!map || !map.active || map.status !== 'published') {
      throw new AppError('NOT_FOUND', 'Indoor map is not published for this marker', 404);
    }
    if (expectedBuildingId && anchor.buildingId !== expectedBuildingId) {
      const buildings = await campusRepository.listBuildings();
      const expected = buildings.find((b) => b.id === expectedBuildingId);
      const actual = buildings.find((b) => b.id === anchor.buildingId);
      throw new AppError(
        'ANCHOR_BUILDING_MISMATCH',
        indoorAnchorBuildingError(expected?.name ?? 'this building', actual?.name ?? 'another building'),
        422,
        { expectedBuildingId, actualBuildingId: anchor.buildingId },
      );
    }
    const node = await indoorRepository.getNode(anchor.nodeId);
    return { anchor, map, node };
  },

  async route(body: z.infer<typeof indoorRouteSchema>) {
    const prefs: IndoorRoutePreferences = {
      ...DEFAULT_INDOOR_PREFERENCES,
      ...body.preferences,
    };
    let sourceId = body.sourceNodeId ?? null;
    if (body.sourceAnchorCode) {
      const resolved = await this.resolveAnchor(body.sourceAnchorCode, body.expectedBuildingId);
      sourceId = resolved.anchor.nodeId;
    }
    if (!sourceId) throw new AppError('VALIDATION_ERROR', 'A source location is required', 400);

    const source = await indoorRepository.getNode(sourceId);
    if (!source || !source.active) throw new AppError('NOT_FOUND', 'Source indoor node not found', 404);

    const place = await indoorRepository.getPlace(body.destinationPlaceId);
    if (!place || !place.active || !place.nodeId) {
      throw new AppError('NOT_FOUND', 'Destination place is missing or has no graph node', 404);
    }
    if (place.mapId !== source.mapId) {
      throw new AppError('MAP_MISMATCH', 'Source and destination are not on the same indoor map', 422);
    }
    if (place.buildingId !== source.buildingId) {
      const buildings = await campusRepository.listBuildings();
      const expected = buildings.find((b) => b.id === source.buildingId);
      const actual = buildings.find((b) => b.id === place.buildingId);
      throw new AppError(
        'PLACE_BUILDING_MISMATCH',
        indoorPlaceBuildingError(expected?.name ?? 'this building', actual?.name ?? 'another building'),
        422,
        { expectedBuildingId: source.buildingId, actualBuildingId: place.buildingId },
      );
    }
    if (body.expectedBuildingId && place.buildingId !== body.expectedBuildingId) {
      const buildings = await campusRepository.listBuildings();
      const expected = buildings.find((b) => b.id === body.expectedBuildingId);
      const actual = buildings.find((b) => b.id === place.buildingId);
      throw new AppError(
        'PLACE_BUILDING_MISMATCH',
        indoorPlaceBuildingError(expected?.name ?? 'this building', actual?.name ?? 'another building'),
        422,
        { expectedBuildingId: body.expectedBuildingId, actualBuildingId: place.buildingId },
      );
    }

    const map = await indoorRepository.getMap(source.mapId);
    if (!map || map.status !== 'published' || !map.active) {
      throw new AppError('NOT_FOUND', 'Indoor map is not published', 404);
    }

    const [nodes, edges] = await Promise.all([
      indoorRepository.listNodes(source.mapId),
      indoorRepository.listEdges(source.mapId),
    ]);
    const result = routeIndoorGraph(source.id, place.nodeId, nodes, edges, prefs);
    if (!result) {
      throw new AppError('NO_ROUTE', 'No indoor route found for the selected preferences', 422);
    }
    const usedEdges = edges.filter((e) => result.edgeIds.includes(e.id));
    const steps = buildIndoorSteps(result.nodeIds, result.edgeIds, nodes, usedEdges);
    return {
      mapId: map.id,
      buildingId: map.buildingId,
      sourceNodeId: source.id,
      destinationPlaceId: place.id,
      destinationNodeId: place.nodeId,
      nodes: steps,
      edges: usedEdges,
      totalDistanceM: result.totalDistanceM,
      estimatedTimeMinutes: etaMinutes(result.totalDistanceM),
      instructions: steps.map((s) => s.instruction),
    };
  },
};
