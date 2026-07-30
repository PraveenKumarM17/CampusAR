import { describe, expect, it } from 'vitest';
import {
  aStar,
  applyHazardsToEdges,
  buildAdjacency,
  edgeTraversalCost,
  isEdgeAllowed,
  type RoutingEdge,
  type RoutingNode,
} from './astar';
import { DEFAULT_ACCESSIBILITY, DEFAULT_ROUTE_WEIGHTS } from '@campusar/shared';

function node(id: string, lat: number, lon: number): RoutingNode {
  return { id, latitude: lat, longitude: lon, name: id };
}

function edge(
  partial: Partial<RoutingEdge> & Pick<RoutingEdge, 'id' | 'fromNodeId' | 'toNodeId' | 'distanceM'>,
): RoutingEdge {
  return {
    kind: 'walkway',
    bidirectional: true,
    blocked: false,
    safetyScore: 0.9,
    crowdScore: 0.1,
    accessibilityScore: 0.9,
    ...partial,
  };
}

describe('edgeTraversalCost', () => {
  it('penalizes blocked edges heavily', () => {
    const e = edge({
      id: 'e1',
      fromNodeId: 'a',
      toNodeId: 'b',
      distanceM: 10,
      blocked: true,
    });
    expect(edgeTraversalCost(e)).toBe(DEFAULT_ROUTE_WEIGHTS.wBlockedPenalty);
  });

  it('increases cost for crowded unsafe edges', () => {
    const safe = edge({
      id: 'e1',
      fromNodeId: 'a',
      toNodeId: 'b',
      distanceM: 50,
      safetyScore: 1,
      crowdScore: 0,
    });
    const risky = edge({
      id: 'e2',
      fromNodeId: 'a',
      toNodeId: 'b',
      distanceM: 50,
      safetyScore: 0.2,
      crowdScore: 0.9,
    });
    expect(edgeTraversalCost(risky)).toBeGreaterThan(edgeTraversalCost(safe));
  });
});

describe('accessibility filters', () => {
  it('blocks stairs in wheelchair mode', () => {
    const stairs = edge({
      id: 'e1',
      fromNodeId: 'a',
      toNodeId: 'b',
      distanceM: 10,
      kind: 'stairs',
      accessibilityScore: 0.2,
    });
    expect(isEdgeAllowed(stairs, { ...DEFAULT_ACCESSIBILITY, wheelchairMode: true })).toBe(false);
  });
});

describe('aStar', () => {
  it('finds shortest weighted path and avoids blocked edges', () => {
    const nodes = new Map([
      ['a', node('a', 0, 0)],
      ['b', node('b', 0, 0.001)],
      ['c', node('c', 0, 0.002)],
    ]);
    const edges: RoutingEdge[] = [
      edge({ id: 'ab', fromNodeId: 'a', toNodeId: 'b', distanceM: 50 }),
      edge({ id: 'bc', fromNodeId: 'b', toNodeId: 'c', distanceM: 50 }),
      edge({
        id: 'ac-blocked',
        fromNodeId: 'a',
        toNodeId: 'c',
        distanceM: 10,
        blocked: true,
      }),
    ];
    const adj = buildAdjacency(edges, DEFAULT_ROUTE_WEIGHTS, DEFAULT_ACCESSIBILITY);
    const result = aStar('a', 'c', nodes, adj);
    expect(result).not.toBeNull();
    expect(result!.nodeIds).toEqual(['a', 'b', 'c']);
    expect(result!.edgeIds).toEqual(['ab', 'bc']);
  });

  it('prefers safer route when weights emphasize safety', () => {
    const nodes = new Map([
      ['a', node('a', 0, 0)],
      ['b', node('b', 0, 0.001)],
      ['c', node('c', 0.001, 0)],
      ['d', node('d', 0, 0.002)],
    ]);
    const weights = {
      ...DEFAULT_ROUTE_WEIGHTS,
      wDistance: 0.05,
      wSafety: 0.7,
      wCrowd: 0.25,
      wAccessibility: 0,
    };
    const safeEdges: RoutingEdge[] = [
      edge({
        id: 'ab',
        fromNodeId: 'a',
        toNodeId: 'b',
        distanceM: 40,
        safetyScore: 0.05,
        crowdScore: 0.95,
      }),
      edge({
        id: 'bd',
        fromNodeId: 'b',
        toNodeId: 'd',
        distanceM: 40,
        safetyScore: 0.05,
        crowdScore: 0.95,
      }),
      edge({
        id: 'ac',
        fromNodeId: 'a',
        toNodeId: 'c',
        distanceM: 55,
        safetyScore: 1,
        crowdScore: 0,
      }),
      edge({
        id: 'cd',
        fromNodeId: 'c',
        toNodeId: 'd',
        distanceM: 55,
        safetyScore: 1,
        crowdScore: 0,
      }),
    ];
    const adj = buildAdjacency(safeEdges, weights, DEFAULT_ACCESSIBILITY);
    const result = aStar('a', 'd', nodes, adj);
    expect(result!.nodeIds).toEqual(['a', 'c', 'd']);
  });

  it('blocks edges inside tight fire hazard zones', () => {
    const nodes = new Map([
      ['a', node('a', 0, 0)],
      ['b', node('b', 0, 0.001)],
      ['c', node('c', 0, 0.002)],
    ]);
    const edges: RoutingEdge[] = [
      edge({ id: 'ab', fromNodeId: 'a', toNodeId: 'b', distanceM: 20 }),
      edge({ id: 'bc', fromNodeId: 'b', toNodeId: 'c', distanceM: 20 }),
      edge({ id: 'ac', fromNodeId: 'a', toNodeId: 'c', distanceM: 100 }),
    ];
    const hazed = applyHazardsToEdges(
      edges,
      nodes,
      [{ latitude: 0, longitude: 0.0005, radiusM: 40, type: 'fire' }],
      [],
    );
    const adj = buildAdjacency(hazed, DEFAULT_ROUTE_WEIGHTS, DEFAULT_ACCESSIBILITY);
    const result = aStar('a', 'c', nodes, adj);
    expect(result).not.toBeNull();
    expect(result!.edgeIds).toEqual(['ac']);
  });
});
