import type { Building } from '@campusar/shared';
import { buildingHeightM } from '../../../lib/cesiumCampus';
import { BUILDING_MODEL_URLS } from '../models/buildingModels';
import { BUILDING_DIMENSIONS, BUILDING_FOOTPRINTS } from '../models/buildingGeometry';
import {
  FALLBACK_BUILDING_DEPTH_M,
  FALLBACK_BUILDING_WIDTH_M,
  type BuildingGeometryKind,
  type DigitalTwinBuilding,
  type TwinLatLng,
} from '../types/digitalTwin';
import { isValidWgs84 } from './coordinates';

export interface BuildingGeometryInput {
  id: string;
  latitude?: unknown;
  longitude?: unknown;
  floorsCount?: number;
  footprint?: TwinLatLng[];
  width?: number;
  depth?: number;
}

export interface ResolvedBuildingGeometry {
  kind: BuildingGeometryKind;
  center: TwinLatLng;
  footprint?: TwinLatLng[];
  width: number;
  depth: number;
  heightM: number;
}

function validFootprintRing(ring: TwinLatLng[] | undefined): TwinLatLng[] | null {
  if (!ring || ring.length < 3) return null;
  const pts = ring.filter((p) => isValidWgs84(p));
  if (pts.length < 3) return null;
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (first.latitude !== last.latitude || first.longitude !== last.longitude) {
    return [...pts, { latitude: first.latitude, longitude: first.longitude }];
  }
  return pts;
}

function validDimensions(width?: number, depth?: number): { width: number; depth: number } | null {
  if (
    typeof width !== 'number' ||
    typeof depth !== 'number' ||
    !Number.isFinite(width) ||
    !Number.isFinite(depth) ||
    width <= 0 ||
    depth <= 0
  ) {
    return null;
  }
  return { width, depth };
}

/**
 * Geometry hierarchy: real footprint → measured width/depth → fallback 28×22 m box.
 * Does not invent campus polygons.
 */
export function resolveBuildingGeometry(input: BuildingGeometryInput): ResolvedBuildingGeometry | null {
  if (!isValidWgs84(input)) return null;
  const center = { latitude: input.latitude as number, longitude: input.longitude as number };
  const heightM = buildingHeightM(input.floorsCount ?? 1);
  const overlayFootprint = BUILDING_FOOTPRINTS[input.id];
  const overlayDims = BUILDING_DIMENSIONS[input.id];
  const footprint = validFootprintRing(input.footprint ?? overlayFootprint);
  if (footprint) {
    return { kind: 'footprint', center, footprint, width: FALLBACK_BUILDING_WIDTH_M, depth: FALLBACK_BUILDING_DEPTH_M, heightM };
  }
  const dims = validDimensions(input.width ?? overlayDims?.width, input.depth ?? overlayDims?.depth);
  if (dims) {
    return { kind: 'dimensions', center, width: dims.width, depth: dims.depth, heightM };
  }
  return {
    kind: 'fallback',
    center,
    width: FALLBACK_BUILDING_WIDTH_M,
    depth: FALLBACK_BUILDING_DEPTH_M,
    heightM,
  };
}

export function toDigitalTwinBuilding(building: Building): DigitalTwinBuilding | null {
  const geometry = resolveBuildingGeometry(building);
  if (!geometry) return null;
  const model = BUILDING_MODEL_URLS[building.id];
  return {
    id: building.id,
    name: building.name,
    code: building.code,
    description: building.description,
    latitude: geometry.center.latitude,
    longitude: geometry.center.longitude,
    center: geometry.center,
    heightM: geometry.heightM,
    floorsCount: building.floorsCount,
    geometryKind: geometry.kind,
    footprint: geometry.footprint,
    width: geometry.width,
    depth: geometry.depth,
    modelUrl: model ?? null,
  };
}

export function buildingsToTwin(buildings: Building[]): DigitalTwinBuilding[] {
  const out: DigitalTwinBuilding[] = [];
  for (const b of buildings) {
    const twin = toDigitalTwinBuilding(b);
    if (twin) out.push(twin);
  }
  return out;
}

/** Axis-aligned WGS84 ring around a center. Used only when measured width/depth exist. */
export function dimensionRectangleRing(
  center: TwinLatLng,
  widthM: number,
  depthM: number,
): TwinLatLng[] {
  const dLat = depthM / 2 / 110_540;
  const dLon = widthM / 2 / (111_320 * Math.cos((center.latitude * Math.PI) / 180));
  return [
    { latitude: center.latitude - dLat, longitude: center.longitude - dLon },
    { latitude: center.latitude - dLat, longitude: center.longitude + dLon },
    { latitude: center.latitude + dLat, longitude: center.longitude + dLon },
    { latitude: center.latitude + dLat, longitude: center.longitude - dLon },
    { latitude: center.latitude - dLat, longitude: center.longitude - dLon },
  ];
}

export function isParkingBuilding(building: { code: string; name: string }): boolean {
  return building.code.toUpperCase() === 'PARK' || /\bparking\b/i.test(building.name);
}

export function isOpenAreaBuilding(building: { code: string; name: string }): boolean {
  const code = building.code.toUpperCase();
  return code === 'GRDA' || code === 'GRDB' || code === 'BBALL' || /ground|basketball|court|garden/i.test(building.name);
}

export function buildingEntityId(buildingId: string): string {
  return `building-${buildingId}`;
}

export function parseBuildingEntityId(entityId: string | undefined): string | null {
  if (!entityId?.startsWith('building-')) return null;
  return entityId.slice('building-'.length) || null;
}
