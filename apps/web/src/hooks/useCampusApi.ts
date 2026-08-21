import { useMemo } from 'react';
import type { AccessibilityPrefs, RouteRequest, SiteArea } from '@campusar/shared';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { usePreviewStore } from '../stores/previewStore';

export function useCampusApi() {
  const token = useAuthStore((s) => s.accessToken);
  const previewActive = usePreviewStore((s) => s.active);
  const previewVersionId = usePreviewStore((s) => s.versionId);

  return useMemo(() => {
    const preview = previewActive && previewVersionId;
    const vid = previewVersionId!;

    return {
      isPreview: Boolean(preview),
      previewVersionId: preview ? vid : null,
      buildings: (t?: string | null) =>
        preview ? api.preview.buildings(vid, t ?? token) : api.buildings(t ?? token),
      rooms: (t?: string | null, category?: string) =>
        preview ? api.preview.rooms(vid, t ?? token, category) : api.rooms(t ?? token, category),
      nodes: (t?: string | null) =>
        preview ? api.preview.nodes(vid, t ?? token) : api.nodes(t ?? token),
      places: (t?: string | null) =>
        preview ? api.preview.places(vid, t ?? token) : api.places(t ?? token),
      edges: (t?: string | null) =>
        preview ? api.preview.edges(vid, t ?? token) : api.edges(t ?? token),
      areas: (t?: string | null) =>
        preview ? api.preview.areas(vid, t ?? token) : Promise.resolve([] as SiteArea[]),
      search: (q: string, t?: string | null) =>
        preview ? api.preview.search(vid, q, t ?? token) : api.search(q, t ?? token),
      route: (
        body: RouteRequest & { accessibility?: Partial<AccessibilityPrefs> },
        t?: string | null,
      ) =>
        preview
          ? api.preview.route(vid, body, t ?? token)
          : api.route(body, t ?? token),
      recalculate: (
        body: RouteRequest & { accessibility?: Partial<AccessibilityPrefs> },
        t?: string | null,
      ) =>
        preview
          ? api.preview.recalculate(vid, body, t ?? token)
          : api.recalculate(body, t ?? token),
      resolveNavigate: (from?: string | null, to?: string | null, t?: string | null) =>
        preview
          ? api.preview.resolveNavigate(vid, from, to, t ?? token)
          : api.resolveNavigate(from, to, t ?? token),
      indoorBuildingContext: (buildingId: string, t?: string | null) =>
        preview
          ? api.preview.indoorBuildingContext(vid, buildingId, t ?? token)
          : api.indoorBuildingContext(buildingId, t ?? token),
      indoorHandoff: (outdoorNodeId: string, t?: string | null) =>
        preview
          ? api.preview.indoorHandoff(vid, outdoorNodeId, t ?? token)
          : api.indoorHandoff(outdoorNodeId, t ?? token),
      indoorSearchPlaces: (q: string, buildingId?: string, t?: string | null) =>
        preview
          ? api.preview.indoorSearchPlaces(vid, q, buildingId, t ?? token)
          : api.indoorSearchPlaces(q, buildingId, t ?? token),
      indoorResolveAnchor: (code: string, t?: string | null, expectedBuildingId?: string) =>
        preview
          ? api.preview.indoorResolveAnchor(vid, code, t ?? token, expectedBuildingId)
          : api.indoorResolveAnchor(code, t ?? token, expectedBuildingId),
      indoorRoute: (
        body: Parameters<typeof api.indoorRoute>[0],
        t?: string | null,
      ) =>
        preview
          ? api.preview.indoorRoute(vid, body, t ?? token)
          : api.indoorRoute(body, t ?? token),
      indoorPlace: (id: string, buildingId?: string, t?: string | null) =>
        preview
          ? api.preview.indoorPlace(vid, id, buildingId, t ?? token)
          : api.indoorPlace(id, buildingId, t ?? token),
    };
  }, [previewActive, previewVersionId, token]);
}

export type CampusApi = ReturnType<typeof useCampusApi>;
