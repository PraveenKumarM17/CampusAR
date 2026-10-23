import type {
  AccessibilityPrefs,
  AppNotification,
  AuthResponse,
  Building,
  CampusPlace,
  CrowdLevel,
  DangerZone,
  EmergencyContact,
  EmergencyExit,
  Floor,
  FloorCorridor,
  FloorPoi,
  GraphEdge,
  GraphNode,
  IndoorBuildingContext,
  IndoorHandoff,
  IndoorPlace,
  IndoorRouteResponse,
  IotStatus,
  NavigateResolveResponse,
  Room,
  RouteRequest,
  RouteResponse,
  SearchResult,
  SensorReading,
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

export type ApiRequestOpts = {
  idempotencyKey?: string;
};

export async function request<T>(
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
    throw new ApiError('UNAUTHORIZED', 'Session expired. Sign in again.', 401);
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const fallback =
      res.status === 502 || res.status === 503 || res.status === 504
        ? 'Cannot reach the CampusAR API. Start the database and API, then try again.'
        : res.status === 401
          ? 'Session expired. Sign in again.'
          : 'Request failed';
    const code = data.code ?? 'ERROR';
    throw new ApiError(code, data.message ?? fallback, res.status, data.details);
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
  site: (id: string, token?: string | null) =>
    request<Site>(`/sites/${encodeURIComponent(id)}`, {}, token),
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
  indoorLayout: (buildingId: string, floorId?: string, token?: string | null) =>
    request<{
      buildingId: string;
      floors: Floor[];
      rooms: import('@campusar/shared').Room[];
      corridors: FloorCorridor[];
      pois: FloorPoi[];
    }>(
      `/campus/buildings/${buildingId}/indoor-layout${floorId ? `?floorId=${encodeURIComponent(floorId)}` : ''}`,
      {},
      token,
    ),
};
