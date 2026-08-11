export type UserRole = 'admin' | 'user' | 'guest';

export interface User {
  id: string;
  email: string | null;
  name: string;
  role: UserRole;
  createdAt: string;
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
  'classroom' | 'lab' | 'office' | 'library' | 'cafeteria' | 'restroom' | 'auditorium' | 'other';

export interface Building {
  id: string;
  name: string;
  code: string;
  description: string | null;
  latitude: number;
  longitude: number;
  floorsCount: number;
}

export interface Floor {
  id: string;
  buildingId: string;
  level: number;
  name: string;
}

export interface Room {
  id: string;
  floorId: string;
  buildingId: string;
  name: string;
  code: string;
  category: RoomCategory;
  nodeId: string | null;
  wheelchairAccessible: boolean;
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
