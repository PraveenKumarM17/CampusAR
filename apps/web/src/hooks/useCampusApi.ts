import { useMemo } from 'react';
import type { AccessibilityPrefs, RouteRequest, SiteArea } from '@campusar/shared';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';

export function useCampusApi() {
  const token = useAuthStore((s) => s.accessToken);

  return useMemo(() => {
    return {
      isPreview: false,
      previewVersionId: null as string | null,
      buildings: (t?: string | null) => api.buildings(t ?? token),
      rooms: (t?: string | null, category?: string) => api.rooms(t ?? token, category),
      nodes: (t?: string | null) => api.nodes(t ?? token),
      places: (t?: string | null) => api.places(t ?? token),
      edges: (t?: string | null) => api.edges(t ?? token),
      areas: (t?: string | null) => {
        void t;
        return Promise.resolve([] as SiteArea[]);
      },
      search: (q: string, t?: string | null) => api.search(q, t ?? token),
      route: (
        body: RouteRequest & { accessibility?: Partial<AccessibilityPrefs> },
        t?: string | null,
      ) => api.route(body, t ?? token),
      recalculate: (
        body: RouteRequest & { accessibility?: Partial<AccessibilityPrefs> },
        t?: string | null,
      ) => api.recalculate(body, t ?? token),
      resolveNavigate: (from?: string | null, to?: string | null, t?: string | null) =>
        api.resolveNavigate(from, to, t ?? token),
      indoorBuildingContext: (buildingId: string, t?: string | null) =>
        api.indoorBuildingContext(buildingId, t ?? token),
      indoorHandoff: (outdoorNodeId: string, t?: string | null) =>
        api.indoorHandoff(outdoorNodeId, t ?? token),
      indoorSearchPlaces: (q: string, buildingId?: string, t?: string | null) =>
        api.indoorSearchPlaces(q, buildingId, t ?? token),
      indoorResolveAnchor: (code: string, t?: string | null, expectedBuildingId?: string) =>
        api.indoorResolveAnchor(code, t ?? token, expectedBuildingId),
      indoorRoute: (body: Parameters<typeof api.indoorRoute>[0], t?: string | null) =>
        api.indoorRoute(body, t ?? token),
      indoorPlace: (id: string, buildingId?: string, t?: string | null) =>
        api.indoorPlace(id, buildingId, t ?? token),
    };
  }, [token]);
}

export type CampusApi = ReturnType<typeof useCampusApi>;
