import { describe, expect, it } from 'vitest';
import type { Building, GraphEdge, GraphNode, RouteResponse } from '@campusar/shared';
import {
  applyCrowdUpdateToBuildings,
  buildingsToTwin,
  campusEventToTwinOverlay,
  deriveBuildingCrowd,
  filterTwinBuildings,
  ignoreUnknownBuildingCrowd,
  intensityToCrowdBand,
  parseBuildingEntityId,
  routeToOverlay,
  shouldReplaceRoute,
  toDigitalTwinBuilding,
} from './buildingVisualization';

const building: Building = {
  id: 'b1',
  name: 'CSE Block',
  code: 'CSE',
  description: 'Academic',
  latitude: 12.9014,
  longitude: 77.5184,
  floorsCount: 4,
};

function node(id: string, buildingId: string | null): GraphNode {
  return {
    id,
    name: id,
    latitude: 12.9,
    longitude: 77.51,
    floorId: null,
    buildingId,
    kind: 'entrance',
  };
}

function edge(id: string, from: string, to: string, crowdScore = 0.1): GraphEdge {
  return {
    id,
    fromNodeId: from,
    toNodeId: to,
    distanceM: 20,
    kind: 'walkway',
    bidirectional: true,
    blocked: false,
    safetyScore: 1,
    crowdScore,
    accessibilityScore: 1,
  };
}

describe('Digital Twin building conversion', () => {
  it('converts existing buildings with coordinates into twin buildings', () => {
    const twin = toDigitalTwinBuilding(building);
    expect(twin).toMatchObject({
      id: 'b1',
      name: 'CSE Block',
      latitude: 12.9014,
      longitude: 77.5184,
      floorsCount: 4,
      modelUrl: null,
      geometryKind: 'fallback',
    });
    expect(twin?.heightM).toBeGreaterThan(0);
    expect(twin?.width).toBe(28);
    expect(twin?.depth).toBe(22);
  });

  it('skips buildings with missing or invalid coordinates', () => {
    expect(toDigitalTwinBuilding({ ...building, latitude: Number.NaN })).toBeNull();
    expect(toDigitalTwinBuilding({ ...building, longitude: 200 })).toBeNull();
    expect(buildingsToTwin([{ ...building, latitude: Number.NaN }, building])).toHaveLength(1);
  });
});

describe('crowd bands', () => {
  it('maps intensity to LOW/MEDIUM/HIGH/UNKNOWN', () => {
    expect(intensityToCrowdBand(0.1)).toBe('LOW');
    expect(intensityToCrowdBand(0.5)).toBe('MEDIUM');
    expect(intensityToCrowdBand(0.9)).toBe('HIGH');
    expect(intensityToCrowdBand(null)).toBe('UNKNOWN');
    expect(intensityToCrowdBand(undefined)).toBe('UNKNOWN');
  });

  it('derives building crowd from connected edges only', () => {
    const nodes = [node('n1', 'b1'), node('n2', 'b2')];
    const edges = [edge('e1', 'n1', 'n1', 0.2), edge('e2', 'n2', 'n2', 0.9)];
    const crowd = new Map([
      ['e1', 0.8],
      ['e2', 0.1],
    ]);
    expect(deriveBuildingCrowd('b1', nodes, edges, crowd).band).toBe('HIGH');
    expect(deriveBuildingCrowd('missing', nodes, edges, crowd).band).toBe('UNKNOWN');
  });

  it('reports only buildings whose crowd band actually changed', () => {
    const prev = new Map<string, ReturnType<typeof intensityToCrowdBand>>([
      ['b1', 'LOW'],
      ['b2', 'HIGH'],
    ]);
    const next = new Map<string, ReturnType<typeof intensityToCrowdBand>>([
      ['b1', 'HIGH'],
      ['b2', 'HIGH'],
    ]);
    expect(applyCrowdUpdateToBuildings(prev, next)).toEqual([{ buildingId: 'b1', band: 'HIGH' }]);
  });

  it('ignores crowd updates for unknown building ids', () => {
    expect(ignoreUnknownBuildingCrowd('nope', new Set(['b1']))).toBe(true);
    expect(ignoreUnknownBuildingCrowd('b1', new Set(['b1']))).toBe(false);
  });
});

describe('search and route overlays', () => {
  it('filters buildings by name or code', () => {
    const list = buildingsToTwin([
      building,
      { ...building, id: 'b2', name: 'Library', code: 'LIB' },
    ]);
    expect(filterTwinBuildings(list, 'cse').map((b) => b.id)).toEqual(['b1']);
    expect(filterTwinBuildings(list, '  ').length).toBe(2);
  });

  it('builds a polyline overlay from an existing route and replaces when edge ids change', () => {
    const route = {
      path: [
        {
          nodeId: 'a',
          latitude: 12.9,
          longitude: 77.51,
          instruction: '',
          distanceM: 0,
          bearing: 0,
        },
        {
          nodeId: 'b',
          latitude: 12.91,
          longitude: 77.52,
          instruction: '',
          distanceM: 10,
          bearing: 90,
        },
      ],
      nodeIds: ['a', 'b'],
      edgeIds: ['e1'],
      totalDistanceM: 10,
      etaMinutes: 1,
      cost: 1,
    } satisfies RouteResponse;
    const overlay = routeToOverlay(route);
    expect(overlay?.points).toHaveLength(2);
    expect(shouldReplaceRoute(null, overlay)).toBe(true);
    expect(shouldReplaceRoute(overlay!.id, overlay)).toBe(false);
    expect(shouldReplaceRoute('old', overlay)).toBe(true);
    expect(shouldReplaceRoute('x', null)).toBe(true);
    expect(routeToOverlay({ ...route, path: [] })).toBeNull();
  });

  it('parses Cesium building entity ids', () => {
    expect(parseBuildingEntityId('building-b1')).toBe('b1');
    expect(parseBuildingEntityId('edge-e1')).toBeNull();
  });

  it('maps existing campus events into a twin overlay without inventing occupancy', () => {
    const overlay = campusEventToTwinOverlay({
      id: 'ev1',
      title: 'Fest',
      description: null,
      latitude: 12.9,
      longitude: 77.51,
      startsAt: '2026-01-01T10:00:00.000Z',
      endsAt: '2026-01-01T12:00:00.000Z',
      affectsRouting: true,
      active: true,
    });
    expect(overlay.id).toBe('ev1');
    expect(overlay.latitude).toBe(12.9);
    expect(overlay.severity).toBe('routing');
  });
});
