import type { Building, GraphEdge, GraphNode, MapValidationIssue } from '@campusar/shared';

/** Fast local approximations — server validate remains source of truth. */
export function computeClientValidationIssues(
  buildings: Building[],
  nodes: GraphNode[],
  edges: GraphEdge[],
): MapValidationIssue[] {
  const issues: MapValidationIssue[] = [];
  const nodeIds = new Set(nodes.map((n) => n.id));

  for (const e of edges) {
    const fromOk = nodeIds.has(e.fromNodeId);
    const toOk = nodeIds.has(e.toNodeId);
    if (!fromOk || !toOk) {
      issues.push({
        level: 'error',
        code: 'CLIENT_DANGLING_EDGE',
        message: 'Walkway endpoint is not connected to a node (client check).',
        resourceType: 'edge',
        resourceId: e.id,
      });
    }
  }

  for (const b of buildings) {
    const entrances = nodes.filter(
      (n) => n.buildingId === b.id && (n.kind === 'entrance' || n.kind === 'exit'),
    );
    if (entrances.length === 0) {
      issues.push({
        level: 'warning',
        code: 'CLIENT_NO_ENTRANCE',
        message: `${b.name} has no linked entrance (client check).`,
        resourceType: 'building',
        resourceId: b.id,
      });
    }
  }

  return issues;
}

export type IssueBadgePoint = {
  id: string;
  resourceType: 'building' | 'node' | 'edge' | 'area';
  resourceId: string;
  level: 'error' | 'warning';
  longitude: number;
  latitude: number;
  code: string;
};

export function issueBadgePoints(
  issues: MapValidationIssue[],
  buildings: Building[],
  nodes: GraphNode[],
  edges: GraphEdge[],
): IssueBadgePoint[] {
  const byNode = new Map(nodes.map((n) => [n.id, n]));
  const points: IssueBadgePoint[] = [];

  for (const issue of issues) {
    if (!issue.resourceId || !issue.resourceType) continue;
    if (issue.resourceType === 'building') {
      const b = buildings.find((x) => x.id === issue.resourceId);
      if (!b) continue;
      points.push({
        id: `${issue.code}:${issue.resourceId}`,
        resourceType: 'building',
        resourceId: b.id,
        level: issue.level,
        longitude: b.longitude,
        latitude: b.latitude,
        code: issue.code,
      });
      continue;
    }
    if (issue.resourceType === 'node' || issue.resourceType === 'entrance') {
      const n = byNode.get(issue.resourceId);
      if (!n) continue;
      points.push({
        id: `${issue.code}:${issue.resourceId}`,
        resourceType: 'node',
        resourceId: n.id,
        level: issue.level,
        longitude: n.longitude,
        latitude: n.latitude,
        code: issue.code,
      });
      continue;
    }
    if (issue.resourceType === 'edge') {
      const e = edges.find((x) => x.id === issue.resourceId);
      if (!e) continue;
      const from = byNode.get(e.fromNodeId);
      const to = byNode.get(e.toNodeId);
      if (from && to) {
        points.push({
          id: `${issue.code}:${e.id}`,
          resourceType: 'edge',
          resourceId: e.id,
          level: issue.level,
          longitude: (from.longitude + to.longitude) / 2,
          latitude: (from.latitude + to.latitude) / 2,
          code: issue.code,
        });
      } else if (from || to) {
        const end = from ?? to!;
        points.push({
          id: `${issue.code}:${e.id}`,
          resourceType: 'edge',
          resourceId: e.id,
          level: issue.level,
          longitude: end.longitude,
          latitude: end.latitude,
          code: issue.code,
        });
      }
    }
  }

  return points;
}
