import type { GraphEdge } from '@campusar/shared';

/** Undirected adjacency among a subset of nodes. */
function buildAdj(
  nodeIds: Set<string>,
  edges: GraphEdge[],
): Map<string, { otherId: string; edgeId: string }[]> {
  const adj = new Map<string, { otherId: string; edgeId: string }[]>();
  for (const id of nodeIds) adj.set(id, []);
  for (const e of edges) {
    if (!nodeIds.has(e.fromNodeId) || !nodeIds.has(e.toNodeId)) continue;
    adj.get(e.fromNodeId)!.push({ otherId: e.toNodeId, edgeId: e.id });
    adj.get(e.toNodeId)!.push({ otherId: e.fromNodeId, edgeId: e.id });
  }
  return adj;
}

function buildFullAdj(
  edges: GraphEdge[],
): Map<string, { otherId: string; edgeId: string }[]> {
  const adj = new Map<string, { otherId: string; edgeId: string }[]>();
  const touch = (id: string) => {
    if (!adj.has(id)) adj.set(id, []);
  };
  for (const e of edges) {
    touch(e.fromNodeId);
    touch(e.toNodeId);
    adj.get(e.fromNodeId)!.push({ otherId: e.toNodeId, edgeId: e.id });
    adj.get(e.toNodeId)!.push({ otherId: e.fromNodeId, edgeId: e.id });
  }
  return adj;
}

/**
 * Shortest path (by hop count) between two nodes on the full edge graph.
 * Used to remove a complete drawn route from place A to place B (including bends).
 */
export function findRoutePath(
  fromId: string,
  toId: string,
  edges: GraphEdge[],
): { nodeIds: string[]; edgeIds: string[] } | null {
  if (fromId === toId) return null;
  const adj = buildFullAdj(edges);
  if (!adj.has(fromId) || !adj.has(toId)) return null;

  const parent = new Map<string, { prev: string; edgeId: string }>();
  const queue = [fromId];
  const seen = new Set<string>([fromId]);

  while (queue.length) {
    const cur = queue.shift()!;
    for (const next of adj.get(cur) ?? []) {
      if (seen.has(next.otherId)) continue;
      seen.add(next.otherId);
      parent.set(next.otherId, { prev: cur, edgeId: next.edgeId });
      if (next.otherId === toId) {
        const nodeIds: string[] = [toId];
        const edgeIds: string[] = [];
        let c = toId;
        while (c !== fromId) {
          const step = parent.get(c);
          if (!step) return null;
          edgeIds.push(step.edgeId);
          c = step.prev;
          nodeIds.push(c);
        }
        nodeIds.reverse();
        edgeIds.reverse();
        return { nodeIds, edgeIds };
      }
      queue.push(next.otherId);
    }
  }
  return null;
}

/**
 * After adding edge fromId–toId, detect if that closes a cycle among place pins.
 * `edgesBefore` is the edge list before the new edge was created.
 */
export function cycleClosedByNewEdge(
  placeIds: Set<string>,
  edgesBefore: GraphEdge[],
  fromId: string,
  toId: string,
  newEdgeId: string,
): { nodeIds: string[]; edgeIds: string[] } | null {
  if (!placeIds.has(fromId) || !placeIds.has(toId) || fromId === toId) return null;

  const adj = buildAdj(placeIds, edgesBefore);
  const parent = new Map<string, { prev: string; edgeId: string }>();
  const queue = [toId];
  const seen = new Set<string>([toId]);

  while (queue.length) {
    const cur = queue.shift()!;
    for (const next of adj.get(cur) ?? []) {
      if (seen.has(next.otherId)) continue;
      seen.add(next.otherId);
      parent.set(next.otherId, { prev: cur, edgeId: next.edgeId });
      if (next.otherId === fromId) {
        const nodeIds: string[] = [];
        const edgeIds: string[] = [];
        let c = fromId;
        while (c !== toId) {
          nodeIds.push(c);
          const step = parent.get(c);
          if (!step) return null;
          edgeIds.push(step.edgeId);
          c = step.prev;
        }
        nodeIds.push(toId);
        return { nodeIds, edgeIds: [...edgeIds, newEdgeId] };
      }
      queue.push(next.otherId);
    }
  }
  return null;
}

/** Edges that touch cycle places but connect out to non-place nodes (messy auto links). */
export function strayEdgesTouchingPlaces(
  placeIds: Set<string>,
  edges: GraphEdge[],
): GraphEdge[] {
  return edges.filter((e) => {
    const a = placeIds.has(e.fromNodeId);
    const b = placeIds.has(e.toNodeId);
    return (a && !b) || (!a && b);
  });
}
