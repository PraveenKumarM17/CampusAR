import { z } from 'zod';
import type { IndoorGraphEditorSnapshot, IndoorNodeKind, LocalVec2 } from '@campusar/shared';
import { AppError } from '../domain/errors';
import { campusRepository } from '../infrastructure/repositories/campusRepository';
import { floorLayoutRepository } from '../infrastructure/repositories/floorLayoutRepository';
import { indoorRepository } from '../infrastructure/repositories/indoorRepository';
import { assertResourceInSite } from './siteContext';
import { assertDraftWritable } from './mapVersionGuard';
import {
  connectorEdgeDefaults,
  floorPlanToLocalVec3,
  localVec3ToFloorPlan,
  nodeKindDefaultEdgeKind,
} from './indoorGraphCoords';
import { polygonCentroid } from './floorLayoutValidation';
import { indoorService } from './indoorService';

const uuid = z.string().uuid();

const nodeKindSchema = z.enum([
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

export const graphNodeFromPlanSchema = z.object({
  mapId: uuid.optional(),
  buildingId: uuid,
  floorId: uuid,
  planX: z.number(),
  planY: z.number(),
  kind: nodeKindSchema.optional(),
  name: z.string().trim().min(1).max(120).nullable().optional(),
  snap: z.boolean().optional(),
});

export const graphNodeMoveSchema = z.object({
  planX: z.number(),
  planY: z.number(),
});

export const graphEdgeCreateSchema = z.object({
  mapId: uuid.optional(),
  buildingId: uuid,
  fromNodeId: uuid,
  toNodeId: uuid,
  kind: z.enum(['walk', 'stairs', 'elevator', 'ramp', 'escalator']).optional(),
  bidirectional: z.boolean().optional(),
  wheelchairAccessible: z.boolean().optional(),
});

export const graphRoomLinkSchema = z.object({
  mapId: uuid.optional(),
  buildingId: uuid,
  roomId: uuid,
  nodeId: uuid.nullable().optional(),
  createEntrance: z.boolean().optional(),
  planX: z.number().optional(),
  planY: z.number().optional(),
});

export const graphHandoffSchema = z.object({
  mapId: uuid.optional(),
  buildingId: uuid,
  outdoorNodeId: uuid,
  indoorNodeId: uuid,
  prompt: z.string().trim().min(1).max(240).optional(),
});

export type EditorVersionContext = {
  draftVersionId: string;
  publishedVersionId: string;
};

async function assertBuildingInSite(buildingId: string, siteId: string) {
  const building = await campusRepository.getBuildingById(buildingId);
  if (!building) throw new AppError('NOT_FOUND', 'Building not found', 404);
  await assertResourceInSite(building.siteId, siteId, 'Building');
  return building;
}

async function assertBuildingInDraftVersion(
  buildingId: string,
  versions: EditorVersionContext,
) {
  assertDraftWritable(
    await campusRepository.getBuildingMapVersionId(buildingId),
    versions.draftVersionId,
    versions.publishedVersionId,
    'Building',
  );
}

async function assertMapInSite(mapId: string, siteId: string, versions: EditorVersionContext) {
  const map = await indoorRepository.getMap(mapId);
  if (!map || !map.active) throw new AppError('NOT_FOUND', 'Indoor map not found', 404);
  await assertBuildingInSite(map.buildingId, siteId);
  assertDraftWritable(
    await indoorRepository.getMapMapVersionId(mapId),
    versions.draftVersionId,
    versions.publishedVersionId,
    'Indoor map',
  );
  return map;
}

async function assertNodeInSite(nodeId: string, siteId: string) {
  const node = await indoorRepository.getNode(nodeId);
  if (!node || !node.active) throw new AppError('NOT_FOUND', 'Indoor node not found', 404);
  await assertBuildingInSite(node.buildingId, siteId);
  return node;
}

async function floorElevationM(
  buildingId: string,
  floorId: string,
  mapVersionId: string,
): Promise<number> {
  const floors = await campusRepository.listFloors(buildingId, undefined, mapVersionId);
  const floor = floors.find((f) => f.id === floorId);
  return (floor?.level ?? 0) * 3.5;
}

export const indoorGraphEditorService = {
  async ensureDraftMap(
    buildingId: string,
    siteId: string,
    userId: string | null,
    mapVersionId: string,
  ) {
    await assertBuildingInSite(buildingId, siteId);
    const existing = await indoorRepository.getDraftMapByBuilding(buildingId, mapVersionId);
    if (existing) return existing;
    return indoorRepository.createMap({
      buildingId,
      name: 'Map Builder Draft',
      notes: 'Created by indoor map builder',
      createdBy: userId,
      mapVersionId,
      status: 'draft',
    });
  },

  async loadGraphSnapshot(
    buildingId: string,
    siteId: string,
    versions: EditorVersionContext,
  ): Promise<IndoorGraphEditorSnapshot> {
    await assertBuildingInSite(buildingId, siteId);
    await assertBuildingInDraftVersion(buildingId, versions);
    const layout = await floorLayoutRepository.loadSnapshot(
      buildingId,
      siteId,
      versions.draftVersionId,
    );
    const draftMap = await indoorRepository.getPrimaryMapForBuildingVersion(
      buildingId,
      versions.draftVersionId,
    );
    const publishedMap = await indoorRepository.getPublishedMapByBuilding(
      buildingId,
      versions.publishedVersionId,
    );
    const editMap = draftMap ?? publishedMap;
    const bundle = editMap ? await indoorRepository.loadBundle(editMap.id, true) : null;
    const handoffs = editMap ? await indoorRepository.listHandoffsByMap(editMap.id) : [];
    const outdoorEntrances = await campusRepository.listBuildingEntrances(
      buildingId,
      versions.draftVersionId,
    );

    const roomLinks: Record<string, string | null> = {};
    if (bundle) {
      for (const place of bundle.places) {
        const roomId = typeof place.metadata?.roomId === 'string' ? place.metadata.roomId : null;
        if (roomId) roomLinks[roomId] = place.nodeId;
      }
    }

    return {
      ...layout,
      draftMap: draftMap ?? null,
      publishedMap: publishedMap ?? null,
      editMapId: editMap?.id ?? null,
      nodes: bundle?.nodes ?? [],
      edges: bundle?.edges ?? [],
      places: bundle?.places ?? [],
      anchors: bundle?.anchors ?? [],
      handoffs,
      outdoorEntrances,
      roomLinks,
    };
  },

  async createNodeFromPlan(
    siteId: string,
    body: z.infer<typeof graphNodeFromPlanSchema>,
    userId: string | null,
    versions: EditorVersionContext,
  ) {
    await assertBuildingInSite(body.buildingId, siteId);
    await assertBuildingInDraftVersion(body.buildingId, versions);
    const map = body.mapId
      ? await assertMapInSite(body.mapId, siteId, versions)
      : await this.ensureDraftMap(body.buildingId, siteId, userId, versions.draftVersionId);
    const elevationM = await floorElevationM(body.buildingId, body.floorId, versions.draftVersionId);
    const local = floorPlanToLocalVec3({ x: body.planX, y: body.planY }, elevationM);
    return indoorService.createNode({
      mapId: map.id,
      floorId: body.floorId,
      localX: local.x,
      localY: local.y,
      localZ: local.z,
      kind: body.kind ?? 'corridor',
      name: body.name ?? null,
      snap: body.snap,
    });
  },

  async moveNodeFromPlan(
    siteId: string,
    nodeId: string,
    body: z.infer<typeof graphNodeMoveSchema>,
    versions: EditorVersionContext,
  ) {
    const node = await assertNodeInSite(nodeId, siteId);
    assertDraftWritable(
      await indoorRepository.getMapMapVersionId(node.mapId),
      versions.draftVersionId,
      versions.publishedVersionId,
      'Indoor node',
    );
    const elevationM = await floorElevationM(node.buildingId, node.floorId, versions.draftVersionId);
    const local = floorPlanToLocalVec3({ x: body.planX, y: body.planY }, elevationM);
    return indoorService.updateNode(nodeId, {
      localX: local.x,
      localY: local.y,
      localZ: local.z,
      floorId: node.floorId,
    });
  },

  async deleteNode(siteId: string, nodeId: string, versions: EditorVersionContext) {
    const node = await assertNodeInSite(nodeId, siteId);
    assertDraftWritable(
      await indoorRepository.getMapMapVersionId(node.mapId),
      versions.draftVersionId,
      versions.publishedVersionId,
      'Indoor node',
    );
    await indoorService.deleteNode(nodeId);
  },

  async createEdge(
    siteId: string,
    body: z.infer<typeof graphEdgeCreateSchema>,
    userId: string | null,
    versions: EditorVersionContext,
  ) {
    await assertBuildingInSite(body.buildingId, siteId);
    await assertBuildingInDraftVersion(body.buildingId, versions);
    const map = body.mapId
      ? await assertMapInSite(body.mapId, siteId, versions)
      : await this.ensureDraftMap(body.buildingId, siteId, userId, versions.draftVersionId);
    const from = await assertNodeInSite(body.fromNodeId, siteId);
    const to = await assertNodeInSite(body.toNodeId, siteId);
    if (from.mapId !== map.id || to.mapId !== map.id) {
      throw new AppError('CROSS_MAP_EDGE', 'Both nodes must belong to the same indoor map', 422);
    }
    const duplicate = await indoorRepository.findEdgeBetween(map.id, from.id, to.id);
    if (duplicate) {
      throw new AppError('DUPLICATE_EDGE', 'An edge already connects these nodes', 409);
    }
    const kind = body.kind ?? nodeKindDefaultEdgeKind(from.kind === to.kind ? from.kind : 'walk');
    const defaults =
      kind === 'stairs' || kind === 'elevator' || kind === 'ramp' || kind === 'escalator'
        ? connectorEdgeDefaults(kind)
        : { kind: kind as 'walk', wheelchairAccessible: body.wheelchairAccessible ?? true };
    return indoorService.createEdge({
      mapId: map.id,
      fromNodeId: from.id,
      toNodeId: to.id,
      kind: defaults.kind,
      bidirectional: body.bidirectional,
      wheelchairAccessible: body.wheelchairAccessible ?? defaults.wheelchairAccessible,
    });
  },

  async deleteEdge(siteId: string, edgeId: string, versions: EditorVersionContext) {
    const edge = await indoorRepository.getEdge(edgeId);
    if (!edge || !edge.active) throw new AppError('NOT_FOUND', 'Indoor edge not found', 404);
    await assertBuildingInSite(edge.buildingId, siteId);
    assertDraftWritable(
      await indoorRepository.getMapMapVersionId(edge.mapId),
      versions.draftVersionId,
      versions.publishedVersionId,
      'Indoor edge',
    );
    await indoorService.deleteEdge(edgeId);
  },

  async linkRoom(
    siteId: string,
    body: z.infer<typeof graphRoomLinkSchema>,
    userId: string | null,
    versions: EditorVersionContext,
  ) {
    await assertBuildingInSite(body.buildingId, siteId);
    await assertBuildingInDraftVersion(body.buildingId, versions);
    const room = await floorLayoutRepository.getRoomById(body.roomId);
    if (!room || room.buildingId !== body.buildingId) {
      throw new AppError('NOT_FOUND', 'Room not found in this building', 404);
    }
    const map = body.mapId
      ? await assertMapInSite(body.mapId, siteId, versions)
      : await this.ensureDraftMap(body.buildingId, siteId, userId, versions.draftVersionId);

    let nodeId = body.nodeId ?? null;
    if (!nodeId && body.createEntrance !== false) {
      const point = resolveRoomEntrancePoint(room.localGeometry, body.planX, body.planY);
      const elevationM = await floorElevationM(body.buildingId, room.floorId, versions.draftVersionId);
      const local = floorPlanToLocalVec3(point, elevationM);
      const node = await indoorService.createNode({
        mapId: map.id,
        floorId: room.floorId,
        localX: local.x,
        localY: local.y,
        localZ: local.z,
        kind: 'room_entrance',
        name: `${room.name} entrance`,
        snap: false,
      });
      nodeId = node.id;
    }
    if (!nodeId) {
      throw new AppError('MISSING_NODE', 'Provide nodeId or enable createEntrance', 422);
    }
    const node = await assertNodeInSite(nodeId, siteId);
    if (node.floorId !== room.floorId) {
      throw new AppError('FLOOR_MISMATCH', 'Room and navigation node must be on the same floor', 422);
    }

    const existing = await indoorRepository.findPlaceByRoomId(map.id, room.id);
    if (existing) {
      return indoorRepository.updatePlace(existing.id, {
        nodeId,
        floorId: room.floorId,
        name: room.name,
        category: 'room',
        searchable: true,
        active: true,
      });
    }
    return indoorService.createPlace({
      mapId: map.id,
      floorId: room.floorId,
      nodeId,
      name: room.name,
      category: 'room',
      searchable: true,
      metadata: { roomId: room.id, roomCode: room.code, roomCategory: room.category },
    });
  },

  async unlinkRoom(
    siteId: string,
    buildingId: string,
    roomId: string,
    versions: EditorVersionContext,
    mapId?: string,
  ) {
    await assertBuildingInSite(buildingId, siteId);
    const map = mapId
      ? await assertMapInSite(mapId, siteId, versions)
      : (await indoorRepository.getDraftMapByBuilding(buildingId, versions.draftVersionId)) ??
        (await indoorRepository.getPublishedMapByBuilding(buildingId, versions.draftVersionId));
    if (!map) return;
    await indoorRepository.deactivatePlaceByRoomId(map.id, roomId);
  },

  async createHandoff(
    siteId: string,
    body: z.infer<typeof graphHandoffSchema>,
    _userId: string | null,
    versions: EditorVersionContext,
  ) {
    await assertBuildingInSite(body.buildingId, siteId);
    await assertBuildingInDraftVersion(body.buildingId, versions);
    const outdoor = await campusRepository.getNodeById(body.outdoorNodeId);
    if (!outdoor || !outdoor.active) {
      throw new AppError('NOT_FOUND', 'Outdoor entrance not found', 404);
    }
    if (outdoor.siteId && outdoor.siteId !== siteId) {
      throw new AppError('CROSS_SITE_HANDOFF', 'Outdoor entrance belongs to another site', 422);
    }
    if (outdoor.buildingId && outdoor.buildingId !== body.buildingId) {
      throw new AppError('BUILDING_MISMATCH', 'Outdoor entrance belongs to another building', 422);
    }
    const outdoorVersion = await campusRepository.getNodeMapVersionId(body.outdoorNodeId);
    assertDraftWritable(
      outdoorVersion,
      versions.draftVersionId,
      versions.publishedVersionId,
      'Outdoor node',
    );
    const indoor = await assertNodeInSite(body.indoorNodeId, siteId);
    if (indoor.buildingId !== body.buildingId) {
      throw new AppError('BUILDING_MISMATCH', 'Indoor node belongs to another building', 422);
    }
    const map = body.mapId
      ? await assertMapInSite(body.mapId, siteId, versions)
      : await assertMapInSite(indoor.mapId, siteId, versions);
    return indoorRepository.createHandoff({
      outdoorNodeId: body.outdoorNodeId,
      indoorNodeId: indoor.id,
      buildingId: body.buildingId,
      mapId: map.id,
      prompt: body.prompt ?? 'Indoor navigation available. Scan the CampusAR marker to continue.',
      active: true,
    });
  },

  async deleteHandoff(siteId: string, handoffId: string, versions: EditorVersionContext) {
    const handoff = await indoorRepository.getHandoffById(handoffId);
    if (!handoff || !handoff.active) throw new AppError('NOT_FOUND', 'Handoff not found', 404);
    await assertBuildingInSite(handoff.buildingId, siteId);
    assertDraftWritable(
      await indoorRepository.getMapMapVersionId(handoff.mapId),
      versions.draftVersionId,
      versions.publishedVersionId,
      'Handoff',
    );
    const ok = await indoorRepository.softDeleteHandoff(handoffId);
    if (!ok) throw new AppError('NOT_FOUND', 'Handoff not found', 404);
  },

  planPointForNode(node: { localX: number; localY: number; localZ: number }): LocalVec2 {
    return localVec3ToFloorPlan({ x: node.localX, y: node.localY, z: node.localZ });
  },
};

function resolveRoomEntrancePoint(
  geometry: LocalVec2[] | null | undefined,
  planX?: number,
  planY?: number,
): LocalVec2 {
  if (planX != null && planY != null) return { x: planX, y: planY };
  if (geometry && geometry.length >= 3) return polygonCentroid(geometry);
  throw new AppError('MISSING_GEOMETRY', 'Room has no geometry to place an entrance', 422);
}
