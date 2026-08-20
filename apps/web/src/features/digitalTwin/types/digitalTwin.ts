export const DIGITAL_TWIN_PATH = '/digital-twin';
export const DIGITAL_TWIN_LEGACY_PATH = '/twin';

export type CrowdBand = 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';

export type TwinRouteKind = 'WALKING' | 'ACCESSIBLE' | 'EMERGENCY';

export type TwinCameraMode = '3D' | 'TOP' | 'BUILDING';

export type BuildingGeometryKind = 'footprint' | 'dimensions' | 'fallback';

export type EntranceRole = 'main' | 'side' | 'accessible';

export type TwinSearchKind = 'building' | 'poi' | 'parking';

export type TwinPickKind = 'building' | 'poi' | 'entrance' | 'parking' | 'green';

export type TwinDataSourceId =
  | 'buildings'
  | 'walkways'
  | 'route'
  | 'pois'
  | 'entrances'
  | 'parking'
  | 'greenAreas'
  | 'hazards'
  | 'boundary'
  | 'user';

/** Centralized crowd colors — do not scatter hex values in Cesium/UI files. */
export const CROWD_BAND_COLORS: Record<CrowdBand, string> = {
  LOW: '#0f6b63',
  MEDIUM: '#c47a12',
  HIGH: '#b42318',
  UNKNOWN: '#1c3a5f',
};

export const CROWD_BAND_LABELS: Record<CrowdBand, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  UNKNOWN: 'Unknown',
};

export const ROUTE_KIND_COLORS: Record<TwinRouteKind, string> = {
  WALKING: '#2563eb',
  ACCESSIBLE: '#7c3aed',
  EMERGENCY: '#b42318',
};

export const SELECTED_BUILDING_OUTLINE = '#fbbf24';

export interface TwinLatLng {
  latitude: number;
  longitude: number;
  height?: number;
}

export type CampusLocation = TwinLatLng;

export interface DigitalTwinBuilding {
  id: string;
  name: string;
  code: string;
  description: string | null;
  latitude: number;
  longitude: number;
  center: TwinLatLng;
  heightM: number;
  floorsCount: number;
  geometryKind: BuildingGeometryKind;
  /** Closed or open ring in WGS84 lat/lng. Present only when a real footprint exists. */
  footprint?: TwinLatLng[];
  width?: number;
  depth?: number;
  /** Public GLB/GLTF path when a real model exists; otherwise null (geometry fallback). */
  modelUrl: string | null;
}

export interface TwinEntrance {
  id: string;
  name: string;
  buildingId: string | null;
  latitude: number;
  longitude: number;
  nodeId: string;
  role: EntranceRole;
}

export type CampusPoiCategory =
  | 'gate'
  | 'plaza'
  | 'junction'
  | 'landmark'
  | 'medical'
  | 'security'
  | 'emergency_exit'
  | 'other';

export interface CampusPOI {
  id: string;
  name: string;
  category: CampusPoiCategory;
  latitude: number;
  longitude: number;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface ParkingArea {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  /** Real polygon only. Never synthesized for visual effect. */
  geometry?: TwinLatLng[];
  totalSpaces?: number;
  availableSpaces?: number;
}

export interface GreenArea {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  /** Real polygon only. Never synthesized vegetation or field outlines. */
  geometry?: TwinLatLng[];
}

export interface CampusBoundary {
  coordinates: TwinLatLng[];
}

export interface WalkwaySegment {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  from: TwinLatLng;
  to: TwinLatLng;
  blocked: boolean;
  accessibilityScore: number;
  crowdScore: number;
}

export interface TwinRoutePoint {
  latitude: number;
  longitude: number;
  label?: string;
}

export interface TwinRouteOverlay {
  id: string;
  kind: TwinRouteKind;
  points: TwinRoutePoint[];
  start: TwinRoutePoint;
  end: TwinRoutePoint;
  waypoints: TwinRoutePoint[];
}

/** Frontend overlay type for future incidents. Not a live emergency dispatch channel. */
export interface TwinCampusEvent {
  id: string;
  type: string;
  buildingId?: string;
  latitude?: number;
  longitude?: number;
  severity?: string;
  timestamp: string;
}

export interface TwinLayerFlags {
  buildings: boolean;
  walkways: boolean;
  activeRoute: boolean;
  pois: boolean;
  entrances: boolean;
  parking: boolean;
  greenAreas: boolean;
  liveData: boolean;
  hazards: boolean;
  boundary: boolean;
}

export interface TwinPick {
  kind: TwinPickKind;
  id: string;
}

export interface TwinSearchHit {
  id: string;
  name: string;
  type: TwinSearchKind;
  latitude: number;
  longitude: number;
  subtitle?: string;
}

export const DEFAULT_TWIN_LAYERS: TwinLayerFlags = {
  buildings: true,
  walkways: true,
  activeRoute: true,
  pois: true,
  entrances: true,
  parking: true,
  greenAreas: true,
  liveData: true,
  hazards: true,
  boundary: false,
};

export const FALLBACK_BUILDING_WIDTH_M = 28;
export const FALLBACK_BUILDING_DEPTH_M = 22;
export const FALLBACK_FLOOR_HEIGHT_M = 3.5;
