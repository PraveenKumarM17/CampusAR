import type {
  AccessibilityPrefs,
  AnalyticsSummary,
  AppNotification,
  AuthResponse,
  Building,
  CampusEvent,
  CampusPlace,
  CrowdLevel,
  DangerZone,
  EmergencyContact,
  EmergencyExit,
  GraphEdge,
  GraphNode,
  IndoorBuildingContext,
  IndoorHandoff,
  IndoorPlace,
  IndoorRouteResponse,
  IotStatus,
  MapValidationResult,
  NavigateResolveResponse,
  Room,
  RouteRequest,
  RouteResponse,
  RouteWeights,
  SearchResult,
  SensorReading,
  SiteArea,
  MapBuilderSnapshot,
} from '@campusar/shared';

import { useAuthStore } from '../stores/authStore';
import { joinApiUrl, resolveApiBaseUrl } from './clientUrls';
import { useSiteStore } from '../stores/siteStore';
import type { Site } from '@campusar/shared';

/** Same-origin `/api` by default (Vite proxy in dev, nginx in Docker). */
const API_URL = resolveApiBaseUrl(import.meta.env.VITE_API_URL);

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
  }
}

let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const { refreshToken, setSession, logout } = useAuthStore.getState();
    if (!refreshToken) {
      logout();
      return null;
    }
    try {
      const res = await fetch(joinApiUrl(API_URL, '/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        logout();
        return null;
      }
      const body = data as AuthResponse;
      setSession(body.user, body.tokens.accessToken, body.tokens.refreshToken);
      return body.tokens.accessToken;
    } catch {
      logout();
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
  retried = false,
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  const authToken = token ?? useAuthStore.getState().accessToken;
  if (authToken) headers.set('Authorization', `Bearer ${authToken}`);
  const siteId = useSiteStore.getState().activeSiteId;
  if (siteId && !path.startsWith('/sites') && !path.startsWith('/auth/')) {
    headers.set('X-Site-Id', siteId);
  }

  let res: Response;
  try {
    res = await fetch(joinApiUrl(API_URL, path), { ...options, headers });
  } catch {
    throw new ApiError(
      'NETWORK_ERROR',
      'Cannot reach the CampusAR API. Start the database and API (docker compose up -d db && npm run dev:api), then try again.',
      0,
    );
  }

  if (res.status === 401 && !retried && !path.startsWith('/auth/')) {
    const next = await refreshAccessToken();
    if (next) return request<T>(path, options, next, true);
    throw new ApiError(
      'UNAUTHORIZED',
      'Session expired — sign in again as organization admin.',
      401,
    );
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const fallback =
      res.status === 502 || res.status === 503 || res.status === 504
        ? 'Cannot reach the CampusAR API. Start the database and API, then try again.'
        : res.status === 401
          ? 'Session expired — sign in again as organization admin.'
          : 'Request failed';
    throw new ApiError(data.code ?? 'ERROR', data.message ?? fallback, res.status, data.details);
  }
  return data as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  register: (email: string, password: string, name: string) =>
    request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    }),
  guest: (name?: string) =>
    request<AuthResponse>('/auth/guest', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  sites: (token?: string | null) => request<Site[]>('/sites', {}, token),
  site: (id: string, token?: string | null) => request<Site>(`/sites/${encodeURIComponent(id)}`, {}, token),
  buildings: (token?: string | null) => request<Building[]>('/campus/buildings', {}, token),
  rooms: (token?: string | null, category?: string) =>
    request<Room[]>(`/campus/rooms${category ? `?category=${category}` : ''}`, {}, token),
  nodes: (token?: string | null) => request<GraphNode[]>('/campus/nodes', {}, token),
  places: (token?: string | null) => request<CampusPlace[]>('/campus/places', {}, token),
  edges: (token?: string | null) => request<GraphEdge[]>('/campus/edges', {}, token),
  search: (q: string, token?: string | null) =>
    request<SearchResult[]>(`/campus/search?q=${encodeURIComponent(q)}`, {}, token),
  categories: () => request<string[]>('/campus/categories'),
  route: (
    body: RouteRequest & { accessibility?: Partial<AccessibilityPrefs> },
    token?: string | null,
  ) =>
    request<RouteResponse>(
      '/navigation/route',
      { method: 'POST', body: JSON.stringify(body) },
      token,
    ),
  recalculate: (
    body: RouteRequest & { accessibility?: Partial<AccessibilityPrefs> },
    token?: string | null,
  ) =>
    request<RouteResponse>(
      '/navigation/recalculate',
      { method: 'POST', body: JSON.stringify(body) },
      token,
    ),
  resolveNavigate: (from?: string | null, to?: string | null, token?: string | null) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const qs = params.toString();
    return request<NavigateResolveResponse>(`/navigation/resolve${qs ? `?${qs}` : ''}`, {}, token);
  },
  indoorSearchPlaces: (q: string, buildingId?: string, token?: string | null) => {
    const params = new URLSearchParams({ q });
    if (buildingId) params.set('buildingId', buildingId);
    return request<IndoorPlace[]>(`/indoor/places/search?${params.toString()}`, {}, token);
  },
  indoorResolveAnchor: (code: string, token?: string | null, expectedBuildingId?: string) => {
    const params = new URLSearchParams();
    if (expectedBuildingId) params.set('buildingId', expectedBuildingId);
    const qs = params.toString();
    return request<{
      anchor: {
        id: string;
        nodeId: string;
        mapId: string;
        floorId: string;
        anchorCode: string;
        buildingId: string;
      };
      map: { id: string; buildingId: string; name: string };
      node: { id: string; name: string | null; floorId: string };
    }>(`/indoor/anchors/${encodeURIComponent(code)}${qs ? `?${qs}` : ''}`, {}, token);
  },
  indoorRoute: (
    body: {
      sourceNodeId?: string;
      sourceAnchorCode?: string;
      destinationPlaceId: string;
      expectedBuildingId?: string;
      preferences?: {
        avoidStairs?: boolean;
        preferElevator?: boolean;
        wheelchairAccessible?: boolean;
      };
    },
    token?: string | null,
  ) =>
    request<IndoorRouteResponse>(
      '/indoor/route',
      { method: 'POST', body: JSON.stringify(body) },
      token,
    ),
  indoorHandoff: (outdoorNodeId: string, token?: string | null) =>
    request<IndoorHandoff | null>(
      `/indoor/handoffs?outdoorNodeId=${encodeURIComponent(outdoorNodeId)}`,
      {},
      token,
    ),
  indoorBuildingContext: (buildingId: string, token?: string | null) =>
    request<IndoorBuildingContext>(
      `/indoor/buildings/${encodeURIComponent(buildingId)}/context`,
      {},
      token,
    ),
  indoorPlaces: (buildingId: string, token?: string | null) =>
    request<IndoorPlace[]>(
      `/indoor/places?buildingId=${encodeURIComponent(buildingId)}`,
      {},
      token,
    ),
  indoorPlace: (id: string, buildingId?: string, token?: string | null) => {
    const params = new URLSearchParams();
    if (buildingId) params.set('buildingId', buildingId);
    const qs = params.toString();
    return request<IndoorPlace>(
      `/indoor/places/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`,
      {},
      token,
    );
  },
  zones: () => request<DangerZone[]>('/safety/zones'),
  exits: () => request<EmergencyExit[]>('/safety/exits'),
  contacts: () => request<EmergencyContact[]>('/safety/contacts'),
  sos: (body: { latitude: number; longitude: number; message?: string }, token?: string | null) =>
    request<{ id: string; message: string }>(
      '/safety/sos',
      { method: 'POST', body: JSON.stringify(body) },
      token,
    ),
  notifications: (token?: string | null) => request<AppNotification[]>('/notifications', {}, token),
  markRead: (id: string, token: string) =>
    request<void>(`/notifications/${id}/read`, { method: 'POST' }, token),
  iotStatus: () => request<IotStatus>('/iot/status'),
  iotSensors: () => request<SensorReading[]>('/iot/sensors'),
  iotCrowd: () => request<CrowdLevel[]>('/iot/crowd'),
  iotStart: (token: string) => request<IotStatus>('/iot/start', { method: 'POST' }, token),
  iotStop: (token: string) => request<IotStatus>('/iot/stop', { method: 'POST' }, token),
  weights: (token: string) => request<RouteWeights>('/admin/weights', {}, token),
  updateWeights: (weights: RouteWeights, token: string) =>
    request<RouteWeights>(
      '/admin/weights',
      { method: 'PUT', body: JSON.stringify(weights) },
      token,
    ),
  adminBuildings: {
    create: (body: Omit<Building, 'id'>, token: string) =>
      request<Building>('/admin/buildings', { method: 'POST', body: JSON.stringify(body) }, token),
    update: (id: string, body: Partial<Building>, token: string) =>
      request<Building>(
        `/admin/buildings/${id}`,
        { method: 'PUT', body: JSON.stringify(body) },
        token,
      ),
    remove: (id: string, token: string) =>
      request<void>(`/admin/buildings/${id}`, { method: 'DELETE' }, token),
  },
  adminEdges: {
    list: (token: string) => request<GraphEdge[]>('/admin/paths/edges', {}, token),
    update: (id: string, body: Partial<GraphEdge>, token: string) =>
      request<GraphEdge>(
        `/admin/paths/edges/${id}`,
        { method: 'PUT', body: JSON.stringify(body) },
        token,
      ),
    create: (body: Omit<GraphEdge, 'id'>, token: string) =>
      request<GraphEdge>(
        '/admin/paths/edges',
        { method: 'POST', body: JSON.stringify(body) },
        token,
      ),
    remove: (id: string, token: string) =>
      request<void>(`/admin/paths/edges/${id}`, { method: 'DELETE' }, token),
  },
  adminNodes: {
    list: (token: string) => request<GraphNode[]>('/admin/paths/nodes', {}, token),
    create: (
      body: {
        name?: string | null;
        latitude: number;
        longitude: number;
        floorId?: string | null;
        buildingId?: string | null;
        kind: GraphNode['kind'];
      },
      token: string,
    ) =>
      request<GraphNode>(
        '/admin/paths/nodes',
        { method: 'POST', body: JSON.stringify(body) },
        token,
      ),
    update: (
      id: string,
      body: Partial<{
        name: string | null;
        latitude: number;
        longitude: number;
        floorId: string | null;
        buildingId: string | null;
        kind: GraphNode['kind'];
      }>,
      token: string,
    ) =>
      request<GraphNode>(
        `/admin/paths/nodes/${id}`,
        { method: 'PUT', body: JSON.stringify(body) },
        token,
      ),
    remove: (id: string, token: string) =>
      request<void>(`/admin/paths/nodes/${id}`, { method: 'DELETE' }, token),
  },
  adminZones: {
    create: (body: Omit<DangerZone, 'id'>, token: string) =>
      request<DangerZone>(
        '/admin/danger-zones',
        { method: 'POST', body: JSON.stringify(body) },
        token,
      ),
    update: (id: string, body: Partial<DangerZone>, token: string) =>
      request<DangerZone>(
        `/admin/danger-zones/${id}`,
        { method: 'PUT', body: JSON.stringify(body) },
        token,
      ),
    remove: (id: string, token: string) =>
      request<void>(`/admin/danger-zones/${id}`, { method: 'DELETE' }, token),
  },
  adminCrowd: {
    list: (token: string) => request<CrowdLevel[]>('/admin/crowd', {}, token),
    upsert: (
      body: { id?: string; edgeId?: string; intensity: number; label?: string },
      token: string,
    ) => request<CrowdLevel>('/admin/crowd', { method: 'POST', body: JSON.stringify(body) }, token),
    remove: (id: string, token: string) =>
      request<void>(`/admin/crowd/${id}`, { method: 'DELETE' }, token),
  },
  adminEvents: {
    list: (token: string) => request<CampusEvent[]>('/admin/events', {}, token),
    create: (body: Omit<CampusEvent, 'id'>, token: string) =>
      request<CampusEvent>('/admin/events', { method: 'POST', body: JSON.stringify(body) }, token),
    update: (id: string, body: Partial<CampusEvent>, token: string) =>
      request<CampusEvent>(
        `/admin/events/${id}`,
        { method: 'PUT', body: JSON.stringify(body) },
        token,
      ),
    remove: (id: string, token: string) =>
      request<void>(`/admin/events/${id}`, { method: 'DELETE' }, token),
  },
  analyticsSummary: (token: string) => request<AnalyticsSummary>('/analytics/summary', {}, token),
  mapBuilder: {
    snapshot: (token?: string | null) =>
      request<MapBuilderSnapshot>('/admin/map-builder/snapshot', {}, token),
    validate: (token?: string | null) =>
      request<MapValidationResult>('/admin/map-builder/validate', {}, token),
    createBuilding: (body: Omit<Building, 'id'>, token?: string | null) =>
      request<Building>('/admin/buildings', { method: 'POST', body: JSON.stringify(body) }, token),
    updateBuilding: (id: string, body: Partial<Building>, token?: string | null) =>
      request<Building>(
        `/admin/buildings/${id}`,
        { method: 'PUT', body: JSON.stringify(body) },
        token,
      ),
    deleteBuilding: (id: string, token?: string | null) =>
      request<void>(`/admin/buildings/${id}`, { method: 'DELETE' }, token),
    createNode: (
      body: {
        name?: string | null;
        latitude: number;
        longitude: number;
        floorId?: string | null;
        buildingId?: string | null;
        kind: GraphNode['kind'];
      },
      token?: string | null,
    ) =>
      request<GraphNode>(
        '/admin/paths/nodes',
        { method: 'POST', body: JSON.stringify(body) },
        token,
      ),
    updateNode: (
      id: string,
      body: Partial<{
        name: string | null;
        latitude: number;
        longitude: number;
        floorId: string | null;
        buildingId: string | null;
        kind: GraphNode['kind'];
      }>,
      token?: string | null,
    ) =>
      request<GraphNode>(
        `/admin/paths/nodes/${id}`,
        { method: 'PUT', body: JSON.stringify(body) },
        token,
      ),
    deleteNode: (id: string, cascade = false, token?: string | null) =>
      request<void>(
        `/admin/paths/nodes/${id}${cascade ? '?cascade=true' : ''}`,
        { method: 'DELETE' },
        token,
      ),
    createEdge: (body: Omit<GraphEdge, 'id'>, token?: string | null) =>
      request<GraphEdge>(
        '/admin/paths/edges',
        { method: 'POST', body: JSON.stringify(body) },
        token,
      ),
    updateEdge: (id: string, body: Partial<GraphEdge>, token?: string | null) =>
      request<GraphEdge>(
        `/admin/paths/edges/${id}`,
        { method: 'PUT', body: JSON.stringify(body) },
        token,
      ),
    deleteEdge: (id: string, token?: string | null) =>
      request<void>(`/admin/paths/edges/${id}`, { method: 'DELETE' }, token),
    createArea: (
      body: { name: string; type: SiteArea['type']; footprint: SiteArea['footprint'] },
      token?: string | null,
    ) => request<SiteArea>('/admin/areas', { method: 'POST', body: JSON.stringify(body) }, token),
    updateArea: (id: string, body: Partial<SiteArea>, token?: string | null) =>
      request<SiteArea>(
        `/admin/areas/${id}`,
        { method: 'PUT', body: JSON.stringify(body) },
        token,
      ),
    deleteArea: (id: string, token?: string | null) =>
      request<void>(`/admin/areas/${id}`, { method: 'DELETE' }, token),
  },
};
