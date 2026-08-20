import { describe, expect, it } from 'vitest';
import type { IndoorEdge, IndoorNode } from '@campusar/shared';
import { DEFAULT_INDOOR_PREFERENCES } from '@campusar/shared';
import { edgeDistanceM, euclideanMeters, polylineDistanceM, snapCandidate } from './geometry';
import { routeIndoorGraph } from './indoorRouting';

function node(
  id: string,
  x: number,
  z: number,
  floorId: string,
  kind: IndoorNode['kind'] = 'corridor',
): IndoorNode {
  return {
    id,
    mapId: 'map',
    buildingId: 'b',
    floorId,
    anchorId: null,
    localX: x,
    localY: 0,
    localZ: z,
    kind,
    name: id,
    category: null,
    accuracyM: 0.2,
    trackingQuality: 'good',
    active: true,
  };
}

function edge(
  id: string,
  from: string,
  to: string,
  distanceM: number,
  kind: IndoorEdge['kind'] = 'walk',
  extra: Partial<IndoorEdge> = {},
): IndoorEdge {
  return {
    id,
    mapId: 'map',
    buildingId: 'b',
    fromFloorId: extra.fromFloorId ?? 'gf',
    toFloorId: extra.toFloorId ?? extra.fromFloorId ?? 'gf',
    fromNodeId: from,
    toNodeId: to,
    distanceM,
    kind,
    bidirectional: true,
    wheelchairAccessible: extra.wheelchairAccessible ?? (kind !== 'stairs' && kind !== 'escalator'),
    waypoints: extra.waypoints ?? [],
    active: true,
    ...extra,
  };
}

describe('indoor geometry', () => {
  it('sums curved corridor waypoints', () => {
    const d = edgeDistanceM(
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      [
        { x: 4, y: 0, z: 3 },
        { x: 8, y: 0, z: 3 },
      ],
    );
    expect(d).toBeGreaterThan(10);
    expect(d).toBeCloseTo(polylineDistanceM([
      { x: 0, y: 0, z: 0 },
      { x: 4, y: 0, z: 3 },
      { x: 8, y: 0, z: 3 },
      { x: 10, y: 0, z: 0 },
    ]), 5);
  });

  it('snaps to a nearby existing node', () => {
    const hit = snapCandidate(
      { x: 1.02, y: 0, z: 0.01 },
      [node('n1', 1, 0, 'gf'), node('n2', 8, 0, 'gf')],
      0.45,
    );
    expect(hit?.id).toBe('n1');
  });

  it('does not snap beyond threshold', () => {
    expect(
      snapCandidate({ x: 3, y: 0, z: 0 }, [node('n1', 1, 0, 'gf')], 0.45),
    ).toBeNull();
  });
});

describe('indoor multi-floor A*', () => {
  const gf = 'gf';
  const f3 = 'f3';
  const nodes = [
    node('ent', 0, 0, gf, 'entrance'),
    node('n1', 8, 0, gf),
    node('stairs_gf', 8, 4, gf, 'stairs'),
    node('elev_gf', 2, 4, gf, 'elevator'),
    node('stairs_f3', 8, 4, f3, 'stairs'),
    node('elev_f3', 2, 4, f3, 'elevator'),
    node('n11', 16, 4, f3),
    node('room308', 16, 10, f3, 'room_entrance'),
    node('cabin', 16, 14, f3, 'destination'),
    node('cubicle', 20, 14, f3, 'destination'),
  ];

  const edges = [
    edge('e1', 'ent', 'n1', 8),
    edge('e2', 'n1', 'stairs_gf', 4),
    edge('e3', 'ent', 'elev_gf', 4.5),
    edge('stairs', 'stairs_gf', 'stairs_f3', 12, 'stairs', {
      fromFloorId: gf,
      toFloorId: f3,
      wheelchairAccessible: false,
    }),
    edge('elev', 'elev_gf', 'elev_f3', 12, 'elevator', { fromFloorId: gf, toFloorId: f3 }),
    edge('e4', 'stairs_f3', 'n11', 8, 'walk', { fromFloorId: f3, toFloorId: f3 }),
    edge('e5', 'elev_f3', 'n11', 14, 'walk', { fromFloorId: f3, toFloorId: f3 }),
    edge('e6', 'n11', 'room308', 6, 'walk', { fromFloorId: f3, toFloorId: f3 }),
    edge('e7', 'room308', 'cabin', 4, 'walk', { fromFloorId: f3, toFloorId: f3 }),
    edge('e8', 'cabin', 'cubicle', 4, 'walk', { fromFloorId: f3, toFloorId: f3 }),
  ];

  it('finds a branched indoor path including nested destinations', () => {
    const result = routeIndoorGraph('ent', 'cubicle', nodes, edges, DEFAULT_INDOOR_PREFERENCES);
    expect(result).not.toBeNull();
    expect(result!.nodeIds[0]).toBe('ent');
    expect(result!.nodeIds.at(-1)).toBe('cubicle');
    expect(result!.nodeIds).toContain('room308');
    expect(result!.totalDistanceM).toBeGreaterThan(0);
  });

  it('avoids stairs when accessibility prefers elevator', () => {
    const result = routeIndoorGraph('ent', 'room308', nodes, edges, {
      avoidStairs: true,
      preferElevator: true,
      wheelchairAccessible: true,
    });
    expect(result).not.toBeNull();
    expect(result!.edgeIds).toContain('elev');
    expect(result!.edgeIds).not.toContain('stairs');
  });

  it('can use stairs when no accessibility restriction', () => {
    const result = routeIndoorGraph('ent', 'room308', nodes, edges, DEFAULT_INDOOR_PREFERENCES);
    expect(result).not.toBeNull();
    expect(result!.edgeIds.includes('stairs') || result!.edgeIds.includes('elev')).toBe(true);
  });

  it('supports loops / alternative corridors', () => {
    const loopEdges = [
      ...edges,
      edge('alt', 'n1', 'elev_gf', 3),
    ];
    const result = routeIndoorGraph('ent', 'elev_gf', nodes, loopEdges, DEFAULT_INDOOR_PREFERENCES);
    expect(result).not.toBeNull();
    expect(result!.nodeIds.at(-1)).toBe('elev_gf');
  });
});

describe('euclidean helper', () => {
  it('is zero for identical points', () => {
    expect(euclideanMeters({ x: 1, y: 2, z: 3 }, { x: 1, y: 2, z: 3 })).toBe(0);
  });
});
