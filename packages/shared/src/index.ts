export type UserRole = 'admin' | 'user' | 'guest';

export type OrganizationType =
  | 'university'
  | 'hospital'
  | 'corporate'
  | 'factory'
  | 'government'
  | 'other';

export type SiteStatus = 'draft' | 'active' | 'archived';

export type SiteMapVersionStatus = 'draft' | 'published' | 'archived';

export interface SiteMapVersion {
  id: string;
  siteId: string;
  versionNumber: number;
  status: SiteMapVersionStatus;
  label: string | null;
  description: string | null;
  basedOnVersionId: string | null;
  createdBy: string | null;
  publishedBy: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  archivedAt: string | null;
}

export interface SiteMapVersionSummary {
  publishedVersion: SiteMapVersion | null;
  draftVersion: SiteMapVersion | null;
}

export type MembershipRole = 'org_admin' | 'site_admin' | 'member';

export interface User {
  id: string;
  email: string | null;
  name: string;
  role: UserRole;
  createdAt: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  type: OrganizationType;
  createdAt: string;
  updatedAt: string;
}

export interface Site {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  name: string;
  slug: string;
  latitude: number;
  longitude: number;
  timezone: string;
  status: SiteStatus;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMembership {
  organizationId: string;
  siteId: string | null;
  role: MembershipRole;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: User;
  tokens: AuthTokens;
}

export type RoomCategory =
  | 'classroom'
  | 'lab'
  | 'office'
  | 'library'
  | 'cafeteria'
  | 'restroom'
  | 'auditorium'
  | 'ward'
  | 'meeting_room'
  | 'storage'
  | 'other';

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface Building {
  id: string;
  name: string;
  code: string;
  description: string | null;
  latitude: number;
  longitude: number;
  floorsCount: number;
  /** Optional canonical footprint ring (WGS84). Legacy buildings may omit this. */
  footprint?: GeoPoint[];
  siteId?: string;
  /** Optimistic concurrency token for map builder edits. */
  updatedAt?: string;
}

export type SiteAreaType = 'parking' | 'open_area' | 'restricted' | 'assembly';

export interface SiteArea {
  id: string;
  siteId: string;
  name: string;
  type: SiteAreaType;
  footprint: GeoPoint[];
}

export type MapValidationLevel = 'error' | 'warning';

export interface MapValidationIssue {
  level: MapValidationLevel;
  code: string;
  message: string;
  resourceType?: 'building' | 'node' | 'edge' | 'entrance' | 'area' | 'floor' | 'room' | 'corridor' | 'poi' | 'place' | 'handoff';
  resourceId?: string;
}

export interface MapValidationResult {
  siteId: string;
  issues: MapValidationIssue[];
  errorCount: number;
  warningCount: number;
}

export interface MapBuilderSnapshot {
  siteId: string;
  version: SiteMapVersion;
  buildings: Building[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  areas: SiteArea[];
}

export interface Floor {
  id: string;
  buildingId: string;
  level: number;
  name: string;
  updatedAt?: string;
}

export interface LocalVec2 {
  x: number;
  y: number;
}

/** Building-local floor plan coordinates in meters (+X east, +Y north on 2D plan). Not WGS84. */
export const FLOOR_PLAN_COORDINATE_SYSTEM = 'floor-plan-meters-v1' as const;

export interface Room {
  id: string;
  floorId: string;
  buildingId: string;
  name: string;
  code: string;
  category: RoomCategory;
  nodeId: string | null;
  wheelchairAccessible: boolean;
  /** Closed or open polygon ring in floor-plan local meters. */
  localGeometry?: LocalVec2[] | null;
  updatedAt?: string;
}

export type FloorPoiCategory =
  | 'reception'
  | 'restroom'
  | 'elevator'
  | 'stairs'
  | 'information'
  | 'waiting'
  | 'other';

export interface FloorCorridor {
  id: string;
  floorId: string;
  buildingId: string;
  name: string | null;
  category: string;
  localGeometry: LocalVec2[];
  updatedAt?: string;
}

export interface FloorPoi {
  id: string;
  floorId: string;
  buildingId: string;
  name: string;
  category: FloorPoiCategory;
  localX: number;
  localY: number;
  updatedAt?: string;
}

export interface IndoorFloorLayoutSnapshot {
  buildingId: string;
  siteId: string;
  floors: Floor[];
  rooms: Room[];
  corridors: FloorCorridor[];
  pois: FloorPoi[];
}

export interface IndoorGraphEditorSnapshot extends IndoorFloorLayoutSnapshot {
  draftMap: IndoorMap | null;
  publishedMap: IndoorMap | null;
  editMapId: string | null;
  nodes: IndoorNode[];
  edges: IndoorEdge[];
  places: IndoorPlace[];
  anchors: IndoorAnchor[];
  handoffs: IndoorHandoff[];
  outdoorEntrances: GraphNode[];
  /** roomId → linked navigation nodeId */
  roomLinks: Record<string, string | null>;
}

export type IndoorGraphTool =
  | 'select'
  | 'node'
  | 'connect'
  | 'entrance'
  | 'stairs'
  | 'elevator'
  | 'room_entrance'
  | 'handoff';

export interface IndoorLayoutValidationResult {
  errors: MapValidationIssue[];
  warnings: MapValidationIssue[];
  errorCount: number;
  warningCount: number;
}

export interface SearchResult {
  type: 'building' | 'room' | 'place';
  id: string;
  name: string;
  code: string;
  category?: RoomCategory;
  buildingName?: string;
  nodeId: string | null;
  latitude: number;
  longitude: number;
}

export type EdgeKind = 'walkway' | 'stairs' | 'elevator' | 'ramp' | 'corridor';

export interface GraphNode {
  id: string;
  name: string | null;
  latitude: number;
  longitude: number;
  floorId: string | null;
  buildingId: string | null;
  kind: 'outdoor' | 'indoor' | 'entrance' | 'elevator' | 'stairs' | 'ramp' | 'exit';
  /** Present on admin listings; defaults to true when omitted. */
  active?: boolean;
  siteId?: string;
}

/** Named, navigable campus place for user-facing pickers. */
export interface CampusPlace {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  floorId: string | null;
  buildingId: string | null;
  kind: GraphNode['kind'];
}

export interface RoutePlaceSummary {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  kind: GraphNode['kind'];
}

export interface GraphEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  distanceM: number;
  kind: EdgeKind;
  bidirectional: boolean;
  blocked: boolean;
  safetyScore: number;
  crowdScore: number;
  accessibilityScore: number;
  siteId?: string;
}

export interface RouteWeights {
  wDistance: number;
  wSafety: number;
  wCrowd: number;
  wAccessibility: number;
  wBlockedPenalty: number;
}

export interface AccessibilityPrefs {
  wheelchairMode: boolean;
  preferLift: boolean;
  preferRamp: boolean;
  avoidStairs: boolean;
}

export interface RouteRequest {
  sourceNodeId: string;
  destinationNodeId: string;
  accessibility?: Partial<AccessibilityPrefs>;
  usePrediction?: boolean;
  siteId?: string;
}

export interface RouteStep {
  nodeId: string;
  latitude: number;
  longitude: number;
  instruction: string;
  distanceM: number;
  bearing: number;
}

export interface RouteResponse {
  path: RouteStep[];
  nodeIds: string[];
  edgeIds: string[];
  totalDistanceM: number;
  etaMinutes: number;
  cost: number;
  predictionUsed?: boolean;
  source?: RoutePlaceSummary;
  destination?: RoutePlaceSummary;
}

export interface NavigateResolveError {
  field: 'from' | 'to';
  code: string;
  message: string;
  nodeId?: string;
}

export interface NavigateResolveResponse {
  valid: boolean;
  source: RoutePlaceSummary | null;
  destination: RoutePlaceSummary | null;
  errors: NavigateResolveError[];
}

export type DangerZoneType = 'unsafe' | 'poor_lighting' | 'construction' | 'fire';

export interface DangerZone {
  id: string;
  name: string;
  type: DangerZoneType;
  latitude: number;
  longitude: number;
  radiusM: number;
  description: string | null;
  active: boolean;
  siteId?: string;
}

export interface CrowdLevel {
  id: string;
  edgeId: string | null;
  nodeId: string | null;
  intensity: number;
  label: string | null;
  updatedAt: string;
}

export interface CampusEvent {
  id: string;
  title: string;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  startsAt: string;
  endsAt: string;
  affectsRouting: boolean;
  active: boolean;
}

export type NotificationType = 'road_closed' | 'event_alert' | 'emergency_alert' | 'route_updated';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}

export interface EmergencyContact {
  id: string;
  name: string;
  kind: 'security' | 'medical' | 'sos';
  phone: string;
  latitude: number | null;
  longitude: number | null;
  nodeId: string | null;
}

export interface EmergencyExit {
  id: string;
  name: string;
  buildingId: string | null;
  nodeId: string;
  latitude: number;
  longitude: number;
}

export interface SosRequest {
  latitude: number;
  longitude: number;
  message?: string;
}

export interface AnalyticsSummary {
  navigationCount: number;
  uniqueSearchers: number;
  averageTravelTimeMinutes: number;
  topSearches: Array<{ query: string; count: number }>;
  popularRoutes: Array<{
    sourceName: string;
    destinationName: string;
    count: number;
    edgeIds: string[];
  }>;
  edgeHeat: Array<{ edgeId: string; count: number }>;
}

export type SensorKind = 'temperature' | 'humidity' | 'aqi' | 'occupancy';

export interface SensorReading {
  id: string;
  zoneKey: string;
  buildingId: string | null;
  kind: SensorKind;
  value: number;
  recordedAt: string;
}

export interface IotStatus {
  running: boolean;
  intervalMs: number;
  lastTickAt: string | null;
  tickCount: number;
}

export type WsMessageType = 'crowd' | 'sensors' | 'hazard' | 'iot_status' | 'ping';

export interface WsMessage<T = unknown> {
  type: WsMessageType;
  payload: T;
  at: string;
  /** When set, clients must ignore events for a different active site. */
  siteId?: string | null;
}

export interface CrowdBroadcastPayload {
  levels: Array<{
    edgeId: string | null;
    nodeId: string | null;
    intensity: number;
    label: string | null;
  }>;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export const DEFAULT_ROUTE_WEIGHTS: RouteWeights = {
  wDistance: 0.4,
  wSafety: 0.25,
  wCrowd: 0.2,
  wAccessibility: 0.15,
  wBlockedPenalty: 1_000_000,
};

export const DEFAULT_ACCESSIBILITY: AccessibilityPrefs = {
  wheelchairMode: false,
  preferLift: false,
  preferRamp: false,
  avoidStairs: false,
};

export const WALKING_SPEED_MPS = 1.4;
export const IOT_TICK_MS = 10_000;
export const PREDICTION_HORIZON_MINUTES = 20;

/** Indoor AR local-frame meters relative to a QR/floor origin (not WGS84). */
export const INDOOR_COORDINATE_SYSTEM = 'ar-local-meters-v1' as const;

export type IndoorMapStatus = 'draft' | 'published';

export type IndoorNodeKind =
  | 'entrance'
  | 'corridor'
  | 'junction'
  | 'turn'
  | 'room_entrance'
  | 'destination'
  | 'stairs'
  | 'elevator'
  | 'ramp'
  | 'emergency_exit'
  | 'qr_anchor'
  | 'landmark';

export type IndoorEdgeKind = 'walk' | 'stairs' | 'elevator' | 'ramp' | 'escalator';

export type IndoorPlaceCategory =
  | 'building'
  | 'floor'
  | 'room'
  | 'cabin'
  | 'person'
  | 'cubicle'
  | 'facility'
  | 'other';

export interface LocalVec3 {
  x: number;
  y: number;
  z: number;
}

export interface IndoorMap {
  id: string;
  buildingId: string;
  name: string;
  status: IndoorMapStatus;
  originAnchorId: string | null;
  trackingQuality: string | null;
  planeCount: number;
  confidence: number | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  active: boolean;
}

export interface IndoorNode {
  id: string;
  mapId: string;
  buildingId: string;
  floorId: string;
  anchorId: string | null;
  localX: number;
  localY: number;
  localZ: number;
  kind: IndoorNodeKind;
  name: string | null;
  category: string | null;
  accuracyM: number | null;
  trackingQuality: string | null;
  active: boolean;
}

export interface IndoorEdge {
  id: string;
  mapId: string;
  buildingId: string;
  fromFloorId: string;
  toFloorId: string;
  fromNodeId: string;
  toNodeId: string;
  distanceM: number;
  kind: IndoorEdgeKind;
  bidirectional: boolean;
  wheelchairAccessible: boolean;
  waypoints: LocalVec3[];
  active: boolean;
}

export interface IndoorPlace {
  id: string;
  mapId: string;
  buildingId: string;
  floorId: string | null;
  nodeId: string | null;
  parentPlaceId: string | null;
  name: string;
  category: IndoorPlaceCategory;
  searchable: boolean;
  metadata: Record<string, unknown>;
  active: boolean;
}

export interface IndoorAnchor {
  id: string;
  mapId: string;
  buildingId: string;
  floorId: string;
  nodeId: string;
  anchorCode: string;
  physicalMarkerType: string;
  localX: number;
  localY: number;
  localZ: number;
  active: boolean;
}

export interface IndoorHandoff {
  id: string;
  outdoorNodeId: string;
  indoorNodeId: string;
  buildingId: string;
  mapId: string;
  prompt: string;
  active: boolean;
}

export interface IndoorMapBundle {
  map: IndoorMap;
  nodes: IndoorNode[];
  edges: IndoorEdge[];
  places: IndoorPlace[];
  anchors: IndoorAnchor[];
}

export interface IndoorRoutePreferences {
  avoidStairs: boolean;
  preferElevator: boolean;
  wheelchairAccessible: boolean;
}

export interface IndoorRouteRequest {
  sourceNodeId?: string;
  sourceAnchorCode?: string;
  destinationPlaceId: string;
  preferences?: Partial<IndoorRoutePreferences>;
}

export interface IndoorRouteStep {
  nodeId: string;
  name: string | null;
  floorId: string;
  localX: number;
  localY: number;
  localZ: number;
  instruction: string;
  distanceM: number;
  bearing: number;
  edgeKind: IndoorEdgeKind | null;
}

export interface IndoorRouteResponse {
  mapId: string;
  buildingId: string;
  sourceNodeId: string;
  destinationPlaceId: string;
  destinationNodeId: string;
  nodes: IndoorRouteStep[];
  edges: IndoorEdge[];
  totalDistanceM: number;
  estimatedTimeMinutes: number;
  instructions: string[];
}

export const DEFAULT_INDOOR_PREFERENCES: IndoorRoutePreferences = {
  avoidStairs: false,
  preferElevator: false,
  wheelchairAccessible: false,
};

export const INDOOR_SNAP_DISTANCE_M = 0.45;
export const INDOOR_MIN_NODE_SPACING_M = 0.4;
export const INDOOR_WAYPOINT_PROXIMITY_M = 1.8;

export type IndoorTransitionStatus =
  | 'none'
  | 'navigating_outdoor'
  | 'arrived_at_building'
  | 'selecting_indoor_destination'
  | 'waiting_for_anchor'
  | 'navigating_indoor';

export interface IndoorBuildingContext {
  building: { id: string; name: string; code: string };
  indoorMap: { id: string; name: string; status: IndoorMapStatus } | null;
  entrance: { outdoorNodeId: string; indoorNodeId: string | null; name: string | null } | null;
  floors: Floor[];
  placeCount: number;
  quickPlaces: IndoorPlace[];
  anchors: { anchorCode: string; floorId: string; nodeId: string }[];
}
