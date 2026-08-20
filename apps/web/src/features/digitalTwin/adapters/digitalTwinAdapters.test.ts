import { describe, expect, it } from 'vitest';
import { CAMPUS_CENTER } from '../../../lib/campus';
import {
  isValidWgs84,
  rejectInvalidCoordinates,
  toCesiumDegreesArray,
} from './coordinates';
import { resolveBuildingGeometry } from './buildingAdapter';
import { FALLBACK_BUILDING_DEPTH_M, FALLBACK_BUILDING_WIDTH_M } from '../types/digitalTwin';
import { walkwayCesiumDegrees, walkwaySegmentsFromGraph } from './walkwayAdapter';
import type { GraphEdge, GraphNode } from '@campusar/shared';
import { dataSourceVisibility, toggleTwinLayer } from './layerState';
import { DEFAULT_TWIN_LAYERS } from '../types/digitalTwin';
import {
  isRouteEntityId,
  routeEntityIdsForOverlay,
  routeToOverlay,
  shouldReplaceRoute,
} from './routeAdapter';
import { campusPoisFromSources } from './poiAdapter';
import { entrancesFromNodes } from './entranceAdapter';
import { parkingAreasFromBuildings } from './parkingAdapter';
import { searchTwinObjects } from './searchAdapter';
import { parseTwinPick } from './pickAdapter';
import type { DigitalTwinBuilding } from '../types/digitalTwin';
import type { RouteResponse } from '@campusar/shared';

const node = (id: string, lat: number, lon: number, extra: Partial<GraphNode> = {}): GraphNode => ({
  id,
  name: extra.name ?? id,
  latitude: lat,
  longitude: lon,
  floorId: extra.floorId ?? null,
  buildingId: extra.buildingId ?? null,
  kind: extra.kind ?? 'outdoor',
});

const edge = (id: string, from: string, to: string, extra: Partial<GraphEdge> = {}): GraphEdge => ({
  id,
  fromNodeId: from,
  toNodeId: to,
  distanceM: 20,
  kind: 'walkway',
  bidirectional: true,
  blocked: extra.blocked ?? false,
  safetyScore: 1,
  crowdScore: extra.crowdScore ?? 0.1,
  accessibilityScore: extra.accessibilityScore ?? 1,
});

describe('coordinate conversion', () => {
  it('keeps WGS84 lat/lng and emits Cesium longitude-first pairs', () => {
    const arr = toCesiumDegreesArray([
      { latitude: CAMPUS_CENTER.lat, longitude: CAMPUS_CENTER.lon },
      { latitude: 12.90095, longitude: 77.51835 },
    ]);
    expect(arr).toEqual([77.5184, 12.9014, 77.51835, 12.90095]);
    expect(arr[0]).toBeCloseTo(CAMPUS_CENTER.lon);
    expect(arr[1]).toBeCloseTo(CAMPUS_CENTER.lat);
  });

  it('rejects invalid coordinates instead of offsetting them', () => {
    expect(isValidWgs84({ latitude: Number.NaN, longitude: 77 })).toBe(false);
    expect(isValidWgs84({ latitude: 12.9, longitude: 200 })).toBe(false);
    expect(
      rejectInvalidCoordinates([
        { latitude: 12.9, longitude: 77.5 },
        { latitude: 99, longitude: 77.5 },
      ]),
    ).toHaveLength(1);
  });
});

describe('building geometry adapter', () => {
  const base = { id: 'b1', latitude: 12.9014, longitude: 77.5184, floorsCount: 4 };

  it('uses a footprint ring when present', () => {
    const geom = resolveBuildingGeometry({
      ...base,
      footprint: [
        { latitude: 12.901, longitude: 77.518 },
        { latitude: 12.901, longitude: 77.519 },
        { latitude: 12.902, longitude: 77.519 },
      ],
    });
    expect(geom?.kind).toBe('footprint');
    expect(geom?.footprint?.length).toBeGreaterThanOrEqual(4);
  });

  it('falls back to measured width/depth when no footprint exists', () => {
    const geom = resolveBuildingGeometry({ ...base, width: 40, depth: 18 });
    expect(geom?.kind).toBe('dimensions');
    expect(geom?.width).toBe(40);
    expect(geom?.depth).toBe(18);
  });

  it('uses the existing 28×22 m box when only a center exists', () => {
    const geom = resolveBuildingGeometry(base);
    expect(geom?.kind).toBe('fallback');
    expect(geom?.width).toBe(FALLBACK_BUILDING_WIDTH_M);
    expect(geom?.depth).toBe(FALLBACK_BUILDING_DEPTH_M);
  });

  it('rejects invalid coordinates', () => {
    expect(resolveBuildingGeometry({ ...base, latitude: Number.NaN })).toBeNull();
    expect(resolveBuildingGeometry({ ...base, longitude: 181 })).toBeNull();
  });
});

describe('walkway adapter', () => {
  it('converts valid WGS84 nodes/edges with longitude-first Cesium ordering', () => {
    const nodes = [node('a', 12.9, 77.51), node('b', 12.91, 77.52)];
    const edges = [edge('e1', 'a', 'b')];
    const segments = walkwaySegmentsFromGraph(nodes, edges);
    expect(segments).toHaveLength(1);
    expect(walkwayCesiumDegrees(segments[0])).toEqual([77.51, 12.9, 77.52, 12.91]);
  });

  it('skips edges whose nodes are missing', () => {
    const nodes = [node('a', 12.9, 77.51)];
    const edges = [edge('e1', 'a', 'missing')];
    expect(walkwaySegmentsFromGraph(nodes, edges)).toEqual([]);
  });
});

describe('layer state', () => {
  it('toggles one layer without changing the others or implying a viewer recreate', () => {
    const next = toggleTwinLayer(DEFAULT_TWIN_LAYERS, 'walkways');
    expect(next.walkways).toBe(false);
    expect(next.buildings).toBe(DEFAULT_TWIN_LAYERS.buildings);
    expect(next.pois).toBe(DEFAULT_TWIN_LAYERS.pois);
    expect(dataSourceVisibility(next).walkways).toBe(false);
    expect(dataSourceVisibility(next).buildings).toBe(true);
    expect(dataSourceVisibility(next).route).toBe(true);
  });
});

describe('route overlay entities', () => {
  const route = {
    path: [
      { nodeId: 'a', latitude: 12.9, longitude: 77.51, instruction: '', distanceM: 0, bearing: 0 },
      {
        nodeId: 'j',
        latitude: 12.9014,
        longitude: 77.51845,
        instruction: '',
        distanceM: 8,
        bearing: 10,
      },
      { nodeId: 'b', latitude: 12.91, longitude: 77.52, instruction: '', distanceM: 10, bearing: 90 },
    ],
    nodeIds: ['a', 'j', 'b'],
    edgeIds: ['e1'],
    totalDistanceM: 18,
    etaMinutes: 2,
    cost: 1,
  } satisfies RouteResponse;

  it('replaces the previous route and lists only route entity ids', () => {
    const overlay = routeToOverlay(route, 'WALKING', [
      node('j', 12.9014, 77.51845, { name: 'Central Crossroads' }),
    ]);
    expect(overlay?.waypoints).toHaveLength(1);
    expect(shouldReplaceRoute(null, overlay)).toBe(true);
    expect(shouldReplaceRoute(overlay!.id, overlay)).toBe(false);
    expect(routeEntityIdsForOverlay(overlay).every(isRouteEntityId)).toBe(true);
  });

  it('clearing a route removes route entities only', () => {
    expect(routeEntityIdsForOverlay(null)).toEqual([]);
    expect(isRouteEntityId('walkway-e1')).toBe(false);
    expect(isRouteEntityId('building-b1')).toBe(false);
    expect(shouldReplaceRoute('e1', null)).toBe(true);
  });
});

describe('search categories', () => {
  it('labels buildings, POIs, and parking without inventing empty categories', () => {
    const buildings: DigitalTwinBuilding[] = [
      {
        id: 'b-cse',
        name: 'CSE Block',
        code: 'CSE',
        description: null,
        latitude: 12.9,
        longitude: 77.51,
        center: { latitude: 12.9, longitude: 77.51 },
        heightM: 14,
        floorsCount: 4,
        geometryKind: 'fallback',
        width: 28,
        depth: 22,
        modelUrl: null,
      },
      {
        id: 'b-park',
        name: 'Main Parking',
        code: 'PARK',
        description: 'Main vehicle parking',
        latitude: 12.90055,
        longitude: 77.51915,
        center: { latitude: 12.90055, longitude: 77.51915 },
        heightM: 12,
        floorsCount: 1,
        geometryKind: 'fallback',
        width: 28,
        depth: 22,
        modelUrl: null,
      },
    ];
    const pois = campusPoisFromSources({
      nodes: [node('g', 12.90042, 77.51858, { name: 'Main Gate' })],
    });
    const parking = parkingAreasFromBuildings([
      {
        id: 'b-park',
        name: 'Main Parking',
        code: 'PARK',
        description: 'Main vehicle parking',
        latitude: 12.90055,
        longitude: 77.51915,
        floorsCount: 1,
      },
    ]);
    const cse = searchTwinObjects({ buildings, pois, parking, query: 'cse' });
    expect(cse).toEqual([expect.objectContaining({ name: 'CSE Block', type: 'building' })]);
    const gate = searchTwinObjects({ buildings, pois, parking, query: 'gate' });
    expect(gate).toEqual([expect.objectContaining({ name: 'Main Gate', type: 'poi' })]);
    const park = searchTwinObjects({ buildings, pois, parking, query: 'parking' });
    expect(park).toEqual([expect.objectContaining({ name: 'Main Parking', type: 'parking' })]);
  });
});

describe('entrances and picks', () => {
  it('uses real entrance nodes and parses Cesium entity ids', () => {
    const list = entrancesFromNodes([
      node('n1', 12.90095, 77.51835, { name: 'Admin Block Entrance', kind: 'entrance', buildingId: 'b1' }),
      node('n2', 12.9, 77.51, { name: 'Main Gate', kind: 'outdoor' }),
    ]);
    expect(list).toHaveLength(1);
    expect(list[0].buildingId).toBe('b1');
    expect(parseTwinPick('building-b1')).toEqual({ kind: 'building', id: 'b1' });
    expect(parseTwinPick('entrance-n1')).toEqual({ kind: 'entrance', id: 'n1' });
    expect(parseTwinPick('walkway-e1')).toBeNull();
  });
});
