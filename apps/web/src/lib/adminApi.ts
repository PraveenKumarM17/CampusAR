import type {
  AccessibilityPrefs,
  AnalyticsSummary,
  Building,
  CampusEvent,
  CampusPlace,
  CrowdLevel,
  DangerZone,
  Floor,
  FloorCorridor,
  FloorPoi,
  FloorPoiCategory,
  GraphEdge,
  GraphNode,
  IndoorBuildingContext,
  IndoorFloorLayoutSnapshot,
  IndoorHandoff,
  IndoorLayoutValidationResult,
  IndoorPlace,
  IndoorRouteResponse,
  IotStatus,
  LocalVec2,
  MapBuilderSnapshot,
  MapValidationResult,
  MapVersionPublishResponse,
  NavigateResolveResponse,
  Room,
  RoomCategory,
  RouteRequest,
  RouteResponse,
  RouteWeights,
  SearchResult,
  SiteArea,
  UnifiedMapValidationResult,
  CreateMeasurementPathDto,
  MeasurementPath,
  MeasurementPoint,
  GpsPoint,
} from '@campusar/shared';
import { request, type ApiRequestOpts } from './api';

export const adminApi = {
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
    createBuilding: (body: Omit<Building, 'id'>, token?: string | null, opts?: ApiRequestOpts) =>
      request<Building>(
        '/admin/buildings',
        {
          method: 'POST',
          body: JSON.stringify(body),
          headers: opts?.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : undefined,
        },
        token,
      ),
    updateBuilding: (
      id: string,
      body: Partial<Building> & { expectedUpdatedAt?: string },
      token?: string | null,
      opts?: ApiRequestOpts,
    ) =>
      request<Building>(
        `/admin/buildings/${id}`,
        {
          method: 'PUT',
          body: JSON.stringify(body),
          headers: opts?.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : undefined,
        },
        token,
      ),
    deleteBuilding: (id: string, token?: string | null, opts?: ApiRequestOpts) =>
      request<void>(
        `/admin/buildings/${id}`,
        {
          method: 'DELETE',
          headers: opts?.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : undefined,
        },
        token,
      ),
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
      opts?: ApiRequestOpts,
    ) =>
      request<GraphNode>(
        '/admin/paths/nodes',
        {
          method: 'POST',
          body: JSON.stringify(body),
          headers: opts?.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : undefined,
        },
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
      }> & { expectedUpdatedAt?: string },
      token?: string | null,
      opts?: ApiRequestOpts,
    ) =>
      request<GraphNode>(
        `/admin/paths/nodes/${id}`,
        {
          method: 'PUT',
          body: JSON.stringify(body),
          headers: opts?.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : undefined,
        },
        token,
      ),
    deleteNode: (id: string, cascade = false, token?: string | null, opts?: ApiRequestOpts) =>
      request<void>(
        `/admin/paths/nodes/${id}${cascade ? '?cascade=true' : ''}`,
        {
          method: 'DELETE',
          headers: opts?.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : undefined,
        },
        token,
      ),
    createEdge: (body: Omit<GraphEdge, 'id'>, token?: string | null, opts?: ApiRequestOpts) =>
      request<GraphEdge>(
        '/admin/paths/edges',
        {
          method: 'POST',
          body: JSON.stringify(body),
          headers: opts?.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : undefined,
        },
        token,
      ),
    updateEdge: (
      id: string,
      body: Partial<GraphEdge> & { expectedUpdatedAt?: string },
      token?: string | null,
      opts?: ApiRequestOpts,
    ) =>
      request<GraphEdge>(
        `/admin/paths/edges/${id}`,
        {
          method: 'PUT',
          body: JSON.stringify(body),
          headers: opts?.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : undefined,
        },
        token,
      ),
    deleteEdge: (id: string, token?: string | null, opts?: ApiRequestOpts) =>
      request<void>(
        `/admin/paths/edges/${id}`,
        {
          method: 'DELETE',
          headers: opts?.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : undefined,
        },
        token,
      ),
    createArea: (
      body: { name: string; type: SiteArea['type']; footprint: SiteArea['footprint'] },
      token?: string | null,
      opts?: ApiRequestOpts,
    ) =>
      request<SiteArea>(
        '/admin/areas',
        {
          method: 'POST',
          body: JSON.stringify(body),
          headers: opts?.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : undefined,
        },
        token,
      ),
    updateArea: (
      id: string,
      body: Partial<SiteArea> & { expectedUpdatedAt?: string },
      token?: string | null,
      opts?: ApiRequestOpts,
    ) =>
      request<SiteArea>(
        `/admin/areas/${id}`,
        {
          method: 'PUT',
          body: JSON.stringify(body),
          headers: opts?.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : undefined,
        },
        token,
      ),
    deleteArea: (id: string, token?: string | null, opts?: ApiRequestOpts) =>
      request<void>(
        `/admin/areas/${id}`,
        {
          method: 'DELETE',
          headers: opts?.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : undefined,
        },
        token,
      ),
    indoorSnapshot: (buildingId: string, token?: string | null) =>
      request<IndoorFloorLayoutSnapshot>(
        `/admin/map-builder/indoor/snapshot?buildingId=${encodeURIComponent(buildingId)}`,
        {},
        token,
      ),
    indoorValidate: (buildingId: string, token?: string | null) =>
      request<IndoorLayoutValidationResult>(
        `/admin/map-builder/indoor/validate?buildingId=${encodeURIComponent(buildingId)}`,
        {},
        token,
      ),
    createFloor: (
      body: { buildingId: string; level: number; name: string },
      token?: string | null,
    ) =>
      request<Floor>(
        '/admin/map-builder/indoor/floors',
        { method: 'POST', body: JSON.stringify(body) },
        token,
      ),
    updateFloor: (
      id: string,
      body: Partial<{ level: number; name: string; expectedUpdatedAt?: string }>,
      token?: string | null,
    ) =>
      request<Floor>(
        `/admin/map-builder/indoor/floors/${id}`,
        { method: 'PUT', body: JSON.stringify(body) },
        token,
      ),
    deleteFloor: (id: string, token?: string | null) =>
      request<void>(`/admin/map-builder/indoor/floors/${id}`, { method: 'DELETE' }, token),
    createRoom: (
      body: {
        buildingId: string;
        floorId: string;
        name: string;
        code: string;
        category: RoomCategory;
        wheelchairAccessible?: boolean;
        localGeometry: LocalVec2[];
        measuredLengthM?: number;
        measuredWidthM?: number;
        measuredHeightM?: number;
        measurementSource?: 'camera_ar' | 'floor_plan' | 'manual';
      },
      token?: string | null,
    ) =>
      request<import('@campusar/shared').Room>(
        '/admin/map-builder/indoor/rooms',
        { method: 'POST', body: JSON.stringify(body) },
        token,
      ),
    updateRoom: (
      id: string,
      body: Partial<{
        name: string;
        code: string;
        category: RoomCategory;
        wheelchairAccessible: boolean;
        localGeometry: LocalVec2[];
        floorId: string;
        measuredLengthM: number | null;
        measuredWidthM: number | null;
        measuredHeightM: number | null;
        measurementSource: 'camera_ar' | 'floor_plan' | 'manual' | null;
        expectedUpdatedAt: string;
      }>,
      token?: string | null,
    ) =>
      request<import('@campusar/shared').Room>(
        `/admin/map-builder/indoor/rooms/${id}`,
        { method: 'PUT', body: JSON.stringify(body) },
        token,
      ),
    deleteRoom: (id: string, token?: string | null) =>
      request<void>(`/admin/map-builder/indoor/rooms/${id}`, { method: 'DELETE' }, token),
    createCorridor: (
      body: {
        buildingId: string;
        floorId: string;
        name?: string | null;
        category?: string;
        localGeometry: LocalVec2[];
      },
      token?: string | null,
    ) =>
      request<FloorCorridor>(
        '/admin/map-builder/indoor/corridors',
        { method: 'POST', body: JSON.stringify(body) },
        token,
      ),
    updateCorridor: (
      id: string,
      body: Partial<{
        name: string | null;
        category: string;
        localGeometry: LocalVec2[];
        floorId: string;
        expectedUpdatedAt: string;
      }>,
      token?: string | null,
    ) =>
      request<FloorCorridor>(
        `/admin/map-builder/indoor/corridors/${id}`,
        { method: 'PUT', body: JSON.stringify(body) },
        token,
      ),
    deleteCorridor: (id: string, token?: string | null) =>
      request<void>(`/admin/map-builder/indoor/corridors/${id}`, { method: 'DELETE' }, token),
    createPoi: (
      body: {
        buildingId: string;
        floorId: string;
        name: string;
        category: FloorPoiCategory;
        localX: number;
        localY: number;
      },
      token?: string | null,
    ) =>
      request<FloorPoi>(
        '/admin/map-builder/indoor/pois',
        { method: 'POST', body: JSON.stringify(body) },
        token,
      ),
    updatePoi: (
      id: string,
      body: Partial<{
        name: string;
        category: FloorPoiCategory;
        localX: number;
        localY: number;
        floorId: string;
        expectedUpdatedAt: string;
      }>,
      token?: string | null,
    ) =>
      request<FloorPoi>(
        `/admin/map-builder/indoor/pois/${id}`,
        { method: 'PUT', body: JSON.stringify(body) },
        token,
      ),
    deletePoi: (id: string, token?: string | null) =>
      request<void>(`/admin/map-builder/indoor/pois/${id}`, { method: 'DELETE' }, token),
    indoorGraphSnapshot: (buildingId: string, token?: string | null) =>
      request<import('@campusar/shared').IndoorGraphEditorSnapshot>(
        `/admin/map-builder/indoor/graph/snapshot?buildingId=${encodeURIComponent(buildingId)}`,
        {},
        token,
      ),
    ensureIndoorGraphMap: (buildingId: string, token?: string | null) =>
      request<import('@campusar/shared').IndoorMap>(
        '/admin/map-builder/indoor/graph/ensure-map',
        { method: 'POST', body: JSON.stringify({ buildingId }) },
        token,
      ),
    createIndoorGraphNode: (
      body: {
        buildingId: string;
        floorId: string;
        planX: number;
        planY: number;
        mapId?: string;
        kind?: import('@campusar/shared').IndoorNodeKind;
        name?: string | null;
      },
      token?: string | null,
    ) =>
      request<import('@campusar/shared').IndoorNode>(
        '/admin/map-builder/indoor/graph/nodes',
        { method: 'POST', body: JSON.stringify(body) },
        token,
      ),
    moveIndoorGraphNode: (
      id: string,
      body: { planX: number; planY: number },
      token?: string | null,
    ) =>
      request<import('@campusar/shared').IndoorNode>(
        `/admin/map-builder/indoor/graph/nodes/${id}`,
        { method: 'PUT', body: JSON.stringify(body) },
        token,
      ),
    deleteIndoorGraphNode: (id: string, token?: string | null) =>
      request<void>(`/admin/map-builder/indoor/graph/nodes/${id}`, { method: 'DELETE' }, token),
    createIndoorAnchor: (
      body: {
        mapId: string;
        nodeId: string;
        floorId?: string;
        anchorCode: string;
        physicalMarkerType?: string;
        localX?: number;
        localY?: number;
        localZ?: number;
      },
      token?: string | null,
    ) =>
      request<import('@campusar/shared').IndoorAnchor>(
        '/indoor/anchors',
        { method: 'POST', body: JSON.stringify(body) },
        token,
      ),
    createIndoorGraphEdge: (
      body: {
        buildingId: string;
        fromNodeId: string;
        toNodeId: string;
        mapId?: string;
        kind?: import('@campusar/shared').IndoorEdgeKind;
        bidirectional?: boolean;
        wheelchairAccessible?: boolean;
      },
      token?: string | null,
    ) =>
      request<import('@campusar/shared').IndoorEdge>(
        '/admin/map-builder/indoor/graph/edges',
        { method: 'POST', body: JSON.stringify(body) },
        token,
      ),
    deleteIndoorGraphEdge: (id: string, token?: string | null) =>
      request<void>(`/admin/map-builder/indoor/graph/edges/${id}`, { method: 'DELETE' }, token),
    linkRoomToGraph: (
      body: {
        buildingId: string;
        roomId: string;
        mapId?: string;
        nodeId?: string | null;
        createEntrance?: boolean;
        planX?: number;
        planY?: number;
      },
      token?: string | null,
    ) =>
      request<import('@campusar/shared').IndoorPlace>(
        '/admin/map-builder/indoor/graph/rooms/link',
        { method: 'POST', body: JSON.stringify(body) },
        token,
      ),
    unlinkRoomFromGraph: (
      buildingId: string,
      roomId: string,
      mapId?: string,
      token?: string | null,
    ) =>
      request<void>(
        `/admin/map-builder/indoor/graph/rooms/${roomId}/link?buildingId=${encodeURIComponent(buildingId)}${mapId ? `&mapId=${encodeURIComponent(mapId)}` : ''}`,
        { method: 'DELETE' },
        token,
      ),
    createIndoorHandoff: (
      body: {
        buildingId: string;
        outdoorNodeId: string;
        indoorNodeId: string;
        mapId?: string;
        prompt?: string;
      },
      token?: string | null,
    ) =>
      request<import('@campusar/shared').IndoorHandoff>(
        '/admin/map-builder/indoor/graph/handoffs',
        { method: 'POST', body: JSON.stringify(body) },
        token,
      ),
    deleteIndoorHandoff: (id: string, token?: string | null) =>
      request<void>(`/admin/map-builder/indoor/graph/handoffs/${id}`, { method: 'DELETE' }, token),
    validateVersion: (versionId: string, token?: string | null) =>
      request<UnifiedMapValidationResult>(
        `/admin/map-builder/versions/${encodeURIComponent(versionId)}/validate`,
        {},
        token,
      ),
    publishVersion: (versionId: string, token?: string | null) =>
      request<MapVersionPublishResponse>(
        `/admin/map-builder/versions/${encodeURIComponent(versionId)}/publish`,
        { method: 'POST' },
        token,
      ),
  },
  measurements: {
    createPath: (body: CreateMeasurementPathDto, token?: string | null) =>
      request<MeasurementPath>(
        '/measurements/paths',
        { method: 'POST', body: JSON.stringify(body) },
        token,
      ),
    addPoint: (pathId: string, body: { point: GpsPoint; label?: string }, token?: string | null) =>
      request<MeasurementPoint>(
        `/measurements/paths/${encodeURIComponent(pathId)}/points`,
        { method: 'POST', body: JSON.stringify(body) },
        token,
      ),
  },
  preview: (() => {
    const base = (versionId: string, subpath: string) =>
      `/admin/map-builder/preview/${encodeURIComponent(versionId)}${subpath}`;

    return {
      meta: (versionId: string, token?: string | null) =>
        request<{
          siteId: string;
          previewVersion: import('@campusar/shared').SiteMapVersion;
          publishedVersion: import('@campusar/shared').SiteMapVersion;
        }>(base(versionId, '/meta'), {}, token),
      buildings: (versionId: string, token?: string | null) =>
        request<Building[]>(base(versionId, '/campus/buildings'), {}, token),
      rooms: (versionId: string, token?: string | null, category?: string) =>
        request<Room[]>(
          base(
            versionId,
            `/campus/rooms${category ? `?category=${encodeURIComponent(category)}` : ''}`,
          ),
          {},
          token,
        ),
      nodes: (versionId: string, token?: string | null) =>
        request<GraphNode[]>(base(versionId, '/campus/nodes'), {}, token),
      places: (versionId: string, token?: string | null) =>
        request<CampusPlace[]>(base(versionId, '/campus/places'), {}, token),
      edges: (versionId: string, token?: string | null) =>
        request<GraphEdge[]>(base(versionId, '/campus/edges'), {}, token),
      areas: (versionId: string, token?: string | null) =>
        request<SiteArea[]>(base(versionId, '/campus/areas'), {}, token),
      search: (versionId: string, q: string, token?: string | null) =>
        request<SearchResult[]>(
          base(versionId, `/campus/search?q=${encodeURIComponent(q)}`),
          {},
          token,
        ),
      route: (
        versionId: string,
        body: RouteRequest & { accessibility?: Partial<AccessibilityPrefs> },
        token?: string | null,
      ) =>
        request<RouteResponse>(
          base(versionId, '/navigation/route'),
          { method: 'POST', body: JSON.stringify(body) },
          token,
        ),
      recalculate: (
        versionId: string,
        body: RouteRequest & { accessibility?: Partial<AccessibilityPrefs> },
        token?: string | null,
      ) =>
        request<RouteResponse>(
          base(versionId, '/navigation/recalculate'),
          { method: 'POST', body: JSON.stringify(body) },
          token,
        ),
      resolveNavigate: (
        versionId: string,
        from?: string | null,
        to?: string | null,
        token?: string | null,
      ) => {
        const params = new URLSearchParams();
        if (from) params.set('from', from);
        if (to) params.set('to', to);
        const qs = params.toString();
        return request<NavigateResolveResponse>(
          base(versionId, `/navigation/resolve${qs ? `?${qs}` : ''}`),
          {},
          token,
        );
      },
      indoorBuildingContext: (versionId: string, buildingId: string, token?: string | null) =>
        request<IndoorBuildingContext>(
          base(versionId, `/indoor/buildings/${encodeURIComponent(buildingId)}/context`),
          {},
          token,
        ),
      indoorHandoff: (versionId: string, outdoorNodeId: string, token?: string | null) =>
        request<IndoorHandoff | null>(
          base(versionId, `/indoor/handoffs?outdoorNodeId=${encodeURIComponent(outdoorNodeId)}`),
          {},
          token,
        ),
      indoorSearchPlaces: (
        versionId: string,
        q: string,
        buildingId?: string,
        token?: string | null,
      ) => {
        const params = new URLSearchParams({ q });
        if (buildingId) params.set('buildingId', buildingId);
        return request<IndoorPlace[]>(
          base(versionId, `/indoor/places/search?${params.toString()}`),
          {},
          token,
        );
      },
      indoorResolveAnchor: (
        versionId: string,
        code: string,
        token?: string | null,
        expectedBuildingId?: string,
      ) => {
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
        }>(
          base(versionId, `/indoor/anchors/${encodeURIComponent(code)}${qs ? `?${qs}` : ''}`),
          {},
          token,
        );
      },
      indoorRoute: (
        versionId: string,
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
          base(versionId, '/indoor/route'),
          { method: 'POST', body: JSON.stringify(body) },
          token,
        ),
      indoorPlace: (versionId: string, id: string, buildingId?: string, token?: string | null) => {
        const params = new URLSearchParams();
        if (buildingId) params.set('buildingId', buildingId);
        const qs = params.toString();
        return request<IndoorPlace>(
          base(versionId, `/indoor/places/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`),
          {},
          token,
        );
      },
    };
  })(),
};
