import type { MapValidationIssue, MapValidationResult } from '@campusar/shared';
import { isValidCoordinate } from './geometry';
import { centroidDriftMeters } from './footprintValidation';
import { campusRepository } from '../infrastructure/repositories/campusRepository';
import { siteAreaRepository } from '../infrastructure/repositories/siteAreaRepository';

function pushIssue(
  issues: MapValidationIssue[],
  issue: MapValidationIssue,
): void {
  issues.push(issue);
}

export async function validateSiteMap(siteId: string): Promise<MapValidationResult> {
  const issues: MapValidationIssue[] = [];
  const [buildings, nodes, edges, areas] = await Promise.all([
    campusRepository.listBuildings(siteId),
    campusRepository.listActiveNodes(siteId),
    campusRepository.listEdges(siteId),
    siteAreaRepository.listBySite(siteId),
  ]);

  const nodeIds = new Set(nodes.map((n) => n.id));
  const buildingIds = new Set(buildings.map((b) => b.id));

  if (buildings.length === 0 && nodes.length === 0 && edges.length === 0) {
    pushIssue(issues, {
      level: 'warning',
      code: 'EMPTY_SITE_GRAPH',
      message: 'This site has no buildings or navigation graph yet.',
    });
  }

  for (const b of buildings) {
    if (b.siteId && b.siteId !== siteId) {
      pushIssue(issues, {
        level: 'error',
        code: 'CROSS_SITE_BUILDING',
        message: `Building "${b.name}" belongs to another site.`,
        resourceType: 'building',
        resourceId: b.id,
      });
    }
    if (!isValidCoordinate(b.latitude, b.longitude)) {
      pushIssue(issues, {
        level: 'error',
        code: 'INVALID_BUILDING_COORDS',
        message: `Building "${b.name}" has invalid coordinates.`,
        resourceType: 'building',
        resourceId: b.id,
      });
    }
    if (!b.footprint || b.footprint.length < 3) {
      pushIssue(issues, {
        level: 'warning',
        code: 'NO_FOOTPRINT',
        message: `${b.name} has no footprint polygon; map and twin use legacy point/box rendering.`,
        resourceType: 'building',
        resourceId: b.id,
      });
    } else {
      const driftM = centroidDriftMeters(b.footprint, b.latitude, b.longitude);
      if (driftM > 5) {
        pushIssue(issues, {
          level: 'warning',
          code: 'CENTROID_DRIFT',
          message: `${b.name} stored coordinates differ from footprint centroid by ${Math.round(driftM)} m.`,
          resourceType: 'building',
          resourceId: b.id,
        });
      }
    }

    const entrances = nodes.filter(
      (n) => n.buildingId === b.id && (n.kind === 'entrance' || n.kind === 'exit'),
    );
    if (entrances.length === 0) {
      pushIssue(issues, {
        level: 'warning',
        code: 'NO_ENTRANCE',
        message: `${b.name} has no entrance and may not be reachable through outdoor navigation.`,
        resourceType: 'building',
        resourceId: b.id,
      });
    }
  }

  for (const n of nodes) {
    if (n.siteId && n.siteId !== siteId) {
      pushIssue(issues, {
        level: 'error',
        code: 'CROSS_SITE_NODE',
        message: `Node ${n.name ?? n.id} belongs to another site.`,
        resourceType: 'node',
        resourceId: n.id,
      });
    }
    if (!isValidCoordinate(n.latitude, n.longitude)) {
      pushIssue(issues, {
        level: 'error',
        code: 'INVALID_NODE_COORDS',
        message: `Node ${n.name ?? n.id} has invalid coordinates.`,
        resourceType: 'node',
        resourceId: n.id,
      });
    }
    if (n.buildingId && !buildingIds.has(n.buildingId)) {
      pushIssue(issues, {
        level: 'error',
        code: 'MISSING_BUILDING',
        message: `Entrance/node references missing building.`,
        resourceType: 'entrance',
        resourceId: n.id,
      });
    }
    if (n.buildingId) {
      const building = buildings.find((b) => b.id === n.buildingId);
      if (building?.siteId && building.siteId !== siteId) {
        pushIssue(issues, {
          level: 'error',
          code: 'CROSS_SITE_ENTRANCE',
          message: `Entrance "${n.name ?? n.id}" references a building in another site.`,
          resourceType: 'entrance',
          resourceId: n.id,
        });
      }
    }
  }

  const adjacency = new Map<string, Set<string>>();
  for (const id of nodeIds) adjacency.set(id, new Set());
  for (const e of edges) {
    if (!nodeIds.has(e.fromNodeId)) {
      pushIssue(issues, {
        level: 'error',
        code: 'MISSING_EDGE_NODE',
        message: 'Walkway references a start node that no longer exists.',
        resourceType: 'edge',
        resourceId: e.id,
      });
    }
    if (!nodeIds.has(e.toNodeId)) {
      pushIssue(issues, {
        level: 'error',
        code: 'MISSING_EDGE_NODE',
        message: 'Walkway references an end node that no longer exists.',
        resourceType: 'edge',
        resourceId: e.id,
      });
    }
    if (e.siteId && e.siteId !== siteId) {
      pushIssue(issues, {
        level: 'error',
        code: 'CROSS_SITE_EDGE',
        message: 'Walkway belongs to another site.',
        resourceType: 'edge',
        resourceId: e.id,
      });
    }
    if (nodeIds.has(e.fromNodeId)) adjacency.get(e.fromNodeId)!.add(e.toNodeId);
    if (e.bidirectional && nodeIds.has(e.toNodeId)) adjacency.get(e.toNodeId)!.add(e.fromNodeId);
  }

  for (const n of nodes) {
    const degree = adjacency.get(n.id)?.size ?? 0;
    if (degree === 0 && nodes.length > 1) {
      pushIssue(issues, {
        level: 'warning',
        code: 'ISOLATED_NODE',
        message: `Navigation point "${n.name ?? n.id}" is not connected to any walkway.`,
        resourceType: 'node',
        resourceId: n.id,
      });
    }
  }

  if (nodes.length > 1) {
    const visited = new Set<string>();
    const start = nodes[0]?.id;
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
      if (visited.size < nodes.length) {
        pushIssue(issues, {
          level: 'warning',
          code: 'DISCONNECTED_GRAPH',
          message: 'Outdoor navigation graph has disconnected components.',
        });
      }
    }
  }

  for (const a of areas) {
    if (a.siteId !== siteId) {
      pushIssue(issues, {
        level: 'error',
        code: 'CROSS_SITE_AREA',
        message: `Area "${a.name}" belongs to another site.`,
        resourceType: 'area',
        resourceId: a.id,
      });
    }
    if (!a.footprint || a.footprint.length < 3) {
      pushIssue(issues, {
        level: 'error',
        code: 'INVALID_AREA',
        message: `Area "${a.name}" has invalid polygon geometry.`,
        resourceType: 'area',
        resourceId: a.id,
      });
    }
  }

  const errorCount = issues.filter((i) => i.level === 'error').length;
  const warningCount = issues.filter((i) => i.level === 'warning').length;
  return { siteId, issues, errorCount, warningCount };
}
