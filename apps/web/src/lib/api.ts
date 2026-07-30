import type {
  AccessibilityPrefs,
  AnalyticsSummary,
  AppNotification,
  AuthResponse,
  Building,
  CampusEvent,
  CrowdLevel,
  DangerZone,
  EmergencyContact,
  EmergencyExit,
  GraphEdge,
  GraphNode,
  IotStatus,
  Room,
  RouteRequest,
  RouteResponse,
  RouteWeights,
  SearchResult,
  SensorReading,
} from '@campusar/shared';

/** Prefer same-origin `/api` (Vite proxy in dev) so LAN hosts avoid CORS issues. */
const API_URL = import.meta.env.VITE_API_URL ?? '/api';

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

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    throw new ApiError(
      'NETWORK_ERROR',
      'Cannot reach the CampusAR API. Start the database and API (docker compose up -d db && npm run dev:api), then try again.',
      0,
    );
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const fallback =
      res.status === 502 || res.status === 503 || res.status === 504
        ? 'Cannot reach the CampusAR API. Start the database and API, then try again.'
        : 'Request failed';
    throw new ApiError(
      data.code ?? 'ERROR',
      data.message ?? fallback,
      res.status,
      data.details,
    );
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
  buildings: (token?: string | null) => request<Building[]>('/campus/buildings', {}, token),
  rooms: (token?: string | null, category?: string) =>
    request<Room[]>(`/campus/rooms${category ? `?category=${category}` : ''}`, {}, token),
  nodes: (token?: string | null) => request<GraphNode[]>('/campus/nodes', {}, token),
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
};
