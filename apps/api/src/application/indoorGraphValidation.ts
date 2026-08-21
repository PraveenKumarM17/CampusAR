import type { IndoorEdge, IndoorNode, MapValidationIssue } from '@campusar/shared';
import { campusRepository } from '../infrastructure/repositories/campusRepository';
import { floorLayoutRepository } from '../infrastructure/repositories/floorLayoutRepository';
import { indoorRepository } from '../infrastructure/repositories/indoorRepository';

function push(issues: MapValidationIssue[], issue: MapValidationIssue) {
  issues.push(issue);
}

function buildAdjacency(nodes: IndoorNode[], edges: IndoorEdge[]): Map<string, Set<string>> {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const adjacency = new Map<string, Set<string>>();
  for (const n of nodes) adjacency.set(n.id, new Set());
  for (const e of edges) {
    if (!e.active) continue;
    if (nodeIds.has(e.fromNodeId)) adjacency.get(e.fromNodeId)!.add(e.toNodeId);
    if (e.bidirectional && nodeIds.has(e.toNodeId)) adjacency.get(e.toNodeId)!.add(e.fromNodeId);
  }
  return adjacency;
}

export async function validateIndoorGraph(
  buildingId: string,
  siteId: string,
  mapVersionId: string,
): Promise<MapValidationIssue[]> {
  const issues: MapValidationIssue[] = [];
  const building = await campusRepository.getBuildingById(buildingId);
  if (!building || building.siteId !== siteId) return issues;

  const draftMap = await indoorRepository.getDraftMapByBuilding(buildingId, mapVersionId);
  const publishedMap = await indoorRepository.getPublishedMapByBuilding(buildingId, mapVersionId);
  const map = draftMap ?? publishedMap;
  if (!map) {
    push(issues, {
      level: 'warning',
      code: 'NO_INDOOR_MAP',
      message: `${building.name} has no indoor navigation map yet.`,
      resourceType: 'building',
      resourceId: buildingId,
    });
    return issues;
  }

  const bundle = await indoorRepository.loadBundle(map.id, true);
  if (!bundle) return issues;

  const { nodes, edges, places } = bundle;
  const handoffs = await indoorRepository.listHandoffsByMap(map.id);
  const layout = await floorLayoutRepository.loadSnapshot(buildingId, siteId, mapVersionId);
  const outdoorEntrances = await campusRepository.listBuildingEntrances(buildingId, mapVersionId);

  if (nodes.length === 0) {
    push(issues, {
      level: 'warning',
      code: 'EMPTY_INDOOR_GRAPH',
      message: 'Indoor navigation graph has no nodes.',
      resourceType: 'building',
      resourceId: buildingId,
    });
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  for (const edge of edges) {
    if (!edge.active) continue;
    const from = nodeById.get(edge.fromNodeId);
    const to = nodeById.get(edge.toNodeId);
    if (!from || !to || !from.active || !to.active) {
      push(issues, {
        level: 'error',
        code: 'DANGLING_INDOOR_EDGE',
        message: 'An indoor edge references a missing or inactive node.',
        resourceType: 'edge',
        resourceId: edge.id,
      });
      continue;
    }
    if (from.buildingId !== buildingId || to.buildingId !== buildingId) {
      push(issues, {
        level: 'error',
        code: 'CROSS_BUILDING_EDGE',
        message: 'Indoor edge connects nodes from different buildings.',
        resourceType: 'edge',
        resourceId: edge.id,
      });
    }
    if (from.floorId !== to.floorId) {
      const connectorKinds = new Set(['stairs', 'elevator', 'ramp', 'escalator']);
      if (!connectorKinds.has(edge.kind)) {
        push(issues, {
          level: 'error',
          code: 'INVALID_CROSS_FLOOR_EDGE',
          message: 'Cross-floor edges must use stairs, elevator, ramp, or escalator.',
          resourceType: 'edge',
          resourceId: edge.id,
        });
      }
    }
    if (edge.distanceM <= 0) {
      push(issues, {
        level: 'error',
        code: 'INVALID_EDGE_DISTANCE',
        message: 'Indoor edge has invalid distance.',
        resourceType: 'edge',
        resourceId: edge.id,
      });
    }
  }

  const adjacency = buildAdjacency(nodes.filter((n) => n.active), edges);
  for (const node of nodes.filter((n) => n.active)) {
    const degree = adjacency.get(node.id)?.size ?? 0;
    if (degree === 0 && nodes.filter((n) => n.active).length > 1) {
      push(issues, {
        level: 'warning',
        code: 'ISOLATED_INDOOR_NODE',
        message: `Navigation node "${node.name ?? node.id}" is not connected.`,
        resourceType: 'node',
        resourceId: node.id,
      });
    }
    if (!Number.isFinite(node.localX) || !Number.isFinite(node.localZ)) {
      push(issues, {
        level: 'error',
        code: 'INVALID_NODE_COORDS',
        message: `Navigation node "${node.name ?? node.id}" has invalid coordinates.`,
        resourceType: 'node',
        resourceId: node.id,
      });
    }
  }

  const activeNodes = nodes.filter((n) => n.active);
  if (activeNodes.length > 1) {
    const visited = new Set<string>();
    const start = activeNodes[0]?.id;
    if (start) {
      const stack = [start];
      while (stack.length) {
        const cur = stack.pop()!;
        if (visited.has(cur)) continue;
        visited.add(cur);
        for (const next of adjacency.get(cur) ?? []) {
          if (!visited.has(next)) stack.push(next);
        }
      }
      if (visited.size < activeNodes.length) {
        push(issues, {
          level: 'warning',
          code: 'DISCONNECTED_INDOOR_GRAPH',
          message: 'Indoor navigation graph has disconnected components.',
          resourceType: 'building',
          resourceId: buildingId,
        });
      }
    }
  }

  const linkedRoomIds = new Set<string>();
  for (const place of places.filter((p) => p.active)) {
    if (place.nodeId && !nodeById.get(place.nodeId)?.active) {
      push(issues, {
        level: 'error',
        code: 'DANGLING_PLACE_NODE',
        message: `Place "${place.name}" links to a missing navigation node.`,
        resourceType: 'place',
        resourceId: place.id,
      });
    }
    const roomId = typeof place.metadata?.roomId === 'string' ? place.metadata.roomId : null;
    if (roomId) linkedRoomIds.add(roomId);
  }

  for (const room of layout.rooms) {
    if (!linkedRoomIds.has(room.id)) {
      push(issues, {
        level: 'warning',
        code: 'ROOM_NO_NAV_ENTRANCE',
        message: `Room "${room.name}" has no linked navigation entrance.`,
        resourceType: 'room',
        resourceId: room.id,
      });
    }
  }

  for (const entrance of outdoorEntrances) {
    const hasHandoff = handoffs.some((h) => h.outdoorNodeId === entrance.id);
    if (!hasHandoff) {
      push(issues, {
        level: 'warning',
        code: 'MISSING_OUTDOOR_HANDOFF',
        message: `Outdoor entrance "${entrance.name ?? entrance.id}" has no indoor handoff.`,
        resourceType: 'node',
        resourceId: entrance.id,
      });
    }
  }

  for (const handoff of handoffs) {
    const indoor = nodeById.get(handoff.indoorNodeId);
    if (!indoor || !indoor.active) {
      push(issues, {
        level: 'error',
        code: 'INVALID_HANDOFF',
        message: 'Handoff references a missing indoor node.',
        resourceType: 'handoff',
        resourceId: handoff.id,
      });
    } else if (indoor.buildingId !== buildingId) {
      push(issues, {
        level: 'error',
        code: 'INVALID_HANDOFF',
        message: 'Handoff indoor node belongs to another building.',
        resourceType: 'handoff',
        resourceId: handoff.id,
      });
    }
    const outdoor = await campusRepository.getNodeById(handoff.outdoorNodeId);
    if (!outdoor || !outdoor.active) {
      push(issues, {
        level: 'error',
        code: 'INVALID_HANDOFF',
        message: 'Handoff references a missing outdoor entrance.',
        resourceType: 'handoff',
        resourceId: handoff.id,
      });
    } else if (outdoor.buildingId && outdoor.buildingId !== buildingId) {
      push(issues, {
        level: 'error',
        code: 'INVALID_HANDOFF',
        message: 'Handoff outdoor entrance belongs to another building.',
        resourceType: 'handoff',
        resourceId: handoff.id,
      });
    }
  }

  for (const floor of layout.floors) {
    const floorRooms = layout.rooms.filter((r) => r.floorId === floor.id);
    const floorNodes = activeNodes.filter((n) => n.floorId === floor.id);
    if (floorRooms.length > 0 && floorNodes.length === 0) {
      push(issues, {
        level: 'warning',
        code: 'FLOOR_NO_GRAPH',
        message: `Floor "${floor.name}" has rooms but no navigation nodes.`,
        resourceType: 'floor',
        resourceId: floor.id,
      });
    }
  }

  return issues;
}
