import type {
  AppNotification,
  AuthResponse,
  Building,
  CampusPlace,
  CreateMeasurementPathDto,
  DangerZone,
  EmergencyContact,
  EmergencyExit,
  GpsPoint,
  GraphEdge,
  GraphNode,
  IndoorBuildingContext,
  IndoorHandoff,
  IndoorPlace,
  IndoorRouteResponse,
  MapBuilderSnapshot,
  MeasurementPath,
  MeasurementPoint,
  RouteRequest,
  RouteResponse,
  SearchResult,
  Site,
  SpatialMeasurementPoint,
  User,
} from '@campusar/shared';
import {joinApiUrl, resolveApiBaseUrl} from './clientUrls';
import {resolveMobileApiBaseUrl} from '../config/env';
import {useAuthStore} from '../stores/authStore';
import {useSiteStore} from '../stores/siteStore';

const API_URL = resolveApiBaseUrl(resolveMobileApiBaseUrl());

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
    const {refreshToken, setSession, logout} = useAuthStore.getState();
    if (!refreshToken) {
      logout();
      return null;
    }
    try {
      const res = await fetch(joinApiUrl(API_URL, '/auth/refresh'), {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({refreshToken}),
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
    res = await fetch(joinApiUrl(API_URL, path), {...options, headers});
  } catch {
    throw new ApiError(
      'NETWORK_ERROR',
      'Cannot reach the CampusAR API. Check API_URL and that the backend is running.',
      0,
    );
  }

  if (res.status === 401 && !retried && !path.startsWith('/auth/')) {
    const next = await refreshAccessToken();
    if (next) return request<T>(path, options, next, true);
    throw new ApiError('UNAUTHORIZED', 'Session expired — sign in again.', 401);
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      data.code ?? 'ERROR',
      data.message ?? 'Request failed',
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
      body: JSON.stringify({email, password}),
    }),
  guest: (name?: string) =>
    request<AuthResponse>('/auth/guest', {
      method: 'POST',
      body: JSON.stringify({name}),
    }),
  sites: (token?: string | null) => request<Site[]>('/sites', {}, token),
  buildings: (token?: string | null) => request<Building[]>('/campus/buildings', {}, token),
  nodes: (token?: string | null) => request<GraphNode[]>('/campus/nodes', {}, token),
  edges: (token?: string | null) => request<GraphEdge[]>('/campus/edges', {}, token),
  places: (token?: string | null) => request<CampusPlace[]>('/campus/places', {}, token),
  search: (q: string, token?: string | null) =>
    request<SearchResult[]>(`/campus/search?q=${encodeURIComponent(q)}`, {}, token),
  route: (body: RouteRequest, token?: string | null) =>
    request<RouteResponse>(
      '/navigation/route',
      {method: 'POST', body: JSON.stringify(body)},
      token,
    ),
  indoorSearchPlaces: (q: string, buildingId?: string, token?: string | null) => {
    const params = new URLSearchParams({q});
    if (buildingId) params.set('buildingId', buildingId);
    return request<IndoorPlace[]>(`/indoor/places/search?${params.toString()}`, {}, token);
  },
  indoorResolveAnchor: (code: string, token?: string | null, expectedBuildingId?: string) => {
    const params = new URLSearchParams();
    if (expectedBuildingId) params.set('buildingId', expectedBuildingId);
    const qs = params.toString();
    return request<{
      anchor: {nodeId: string; buildingId: string; anchorCode: string};
      node: {id: string; name: string | null};
    }>(`/indoor/anchors/${encodeURIComponent(code)}${qs ? `?${qs}` : ''}`, {}, token);
  },
  indoorRoute: (
    body: {
      sourceAnchorCode?: string;
      sourceNodeId?: string;
      destinationPlaceId: string;
      expectedBuildingId?: string;
    },
    token?: string | null,
  ) =>
    request<IndoorRouteResponse>(
      '/indoor/route',
      {method: 'POST', body: JSON.stringify(body)},
      token,
    ),
  indoorBuildingContext: (buildingId: string, token?: string | null) =>
    request<IndoorBuildingContext>(
      `/indoor/buildings/${encodeURIComponent(buildingId)}/context`,
      {},
      token,
    ),
  indoorHandoff: (outdoorNodeId: string, token?: string | null) =>
    request<IndoorHandoff | null>(
      `/indoor/handoffs?outdoorNodeId=${encodeURIComponent(outdoorNodeId)}`,
      {},
      token,
    ),
  zones: () => request<DangerZone[]>('/safety/zones'),
  exits: () => request<EmergencyExit[]>('/safety/exits'),
  contacts: () => request<EmergencyContact[]>('/safety/contacts'),
  sos: (
    body: {latitude: number; longitude: number; message?: string},
    token?: string | null,
  ) =>
    request<{id: string; message: string}>(
      '/safety/sos',
      {method: 'POST', body: JSON.stringify(body)},
      token,
    ),
  notifications: (token?: string | null) =>
    request<AppNotification[]>('/notifications', {}, token),
  mapBuilderSnapshot: (token?: string | null) =>
    request<MapBuilderSnapshot>('/admin/map-builder/snapshot', {}, token),
  measurements: {
    createPath: (body: CreateMeasurementPathDto, token?: string | null) =>
      request<MeasurementPath>(
        '/measurements/paths',
        {method: 'POST', body: JSON.stringify(body)},
        token,
      ),
    addPoint: (
      pathId: string,
      body: {point: GpsPoint | SpatialMeasurementPoint; label?: string},
      token?: string | null,
    ) =>
      request<MeasurementPoint>(
        `/measurements/paths/${encodeURIComponent(pathId)}/points`,
        {method: 'POST', body: JSON.stringify(body)},
        token,
      ),
  },
};

export type {User};
