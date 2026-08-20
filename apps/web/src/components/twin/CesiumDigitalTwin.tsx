import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import {
  Cartesian2,
  Cartesian3,
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  CustomDataSource,
  DistanceDisplayCondition,
  OpenStreetMapImageryProvider,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  VerticalOrigin,
  Viewer,
  type Entity,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import type { DangerZone } from '@campusar/shared';
import { crowdColor, hazardColor } from '../../lib/cesiumCampus';
import {
  flyToBuilding as flyCameraToBuilding,
  flyToCampus as flyCameraToCampus,
  flyToPOI as flyCameraToPOI,
  flyToRoute as flyCameraToRoute,
} from '../../features/digitalTwin/services/cesiumService';
import { parseTwinPick } from '../../features/digitalTwin/adapters/pickAdapter';
import { dimensionRectangleRing } from '../../features/digitalTwin/adapters/buildingAdapter';
import { toCesiumDegreesArray } from '../../features/digitalTwin/adapters/coordinates';
import { walkwayEntityId } from '../../features/digitalTwin/adapters/walkwayAdapter';
import { campusBoundaryFromConfig } from '../../features/digitalTwin/adapters/boundaryAdapter';
import { dataSourceVisibility } from '../../features/digitalTwin/adapters/layerState';
import { routeWaypointEntityId } from '../../features/digitalTwin/adapters/routeAdapter';
import {
  CROWD_BAND_COLORS,
  SELECTED_BUILDING_OUTLINE,
  type CampusBoundary,
  type CampusPOI,
  type DigitalTwinBuilding,
  type GreenArea,
  type ParkingArea,
  type TwinCameraMode,
  type TwinEntrance,
  type TwinLayerFlags,
  type TwinPick,
  type TwinRouteOverlay,
  type WalkwaySegment,
} from '../../features/digitalTwin/types/digitalTwin';
import { buildingEntityId } from '../../features/digitalTwin/adapters/buildingAdapter';
import { entranceEntityId } from '../../features/digitalTwin/adapters/entranceAdapter';
import { greenEntityId } from '../../features/digitalTwin/adapters/greenAreaAdapter';
import { parkingEntityId } from '../../features/digitalTwin/adapters/parkingAdapter';
import { poiEntityId } from '../../features/digitalTwin/adapters/poiAdapter';
import { TWIN_STYLES, walkwayStroke, routeStroke } from '../../features/digitalTwin/utils/visualization';
import { deriveBuildingCrowd } from '../../features/digitalTwin/utils/buildingVisualization';
import type { GraphEdge, GraphNode } from '@campusar/shared';

export interface CesiumDigitalTwinHandle {
  flyToCampus: () => void;
  flyToBuilding: (buildingId: string) => void;
  flyToPOI: (poi: Pick<CampusPOI, 'latitude' | 'longitude'>) => void;
  focusRoute: () => void;
}

export interface CesiumDigitalTwinProps {
  buildings: DigitalTwinBuilding[];
  walkways: WalkwaySegment[];
  pois: CampusPOI[];
  entrances: TwinEntrance[];
  parking: ParkingArea[];
  greenAreas: GreenArea[];
  boundary?: CampusBoundary | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
  crowdByEdge: Map<string, number>;
  zones: DangerZone[];
  userLatitude?: number | null;
  userLongitude?: number | null;
  mapCenter?: { lat: number; lon: number };
  selectedBuildingId?: string | null;
  onSelect?: (pick: TwinPick | null) => void;
  layers: TwinLayerFlags;
  navigationRoute?: TwinRouteOverlay | null;
  cameraMode?: TwinCameraMode;
  onReady?: () => void;
  onError?: (message: string) => void;
  className?: string;
}

type TwinSources = Record<
  | 'buildings'
  | 'walkways'
  | 'route'
  | 'pois'
  | 'entrances'
  | 'parking'
  | 'greenAreas'
  | 'hazards'
  | 'boundary'
  | 'user',
  CustomDataSource
>;

function cssColor(hex: string, alpha = 1) {
  return Color.fromCssColorString(hex).withAlpha(alpha);
}

function labelStyle(offsetY = -12) {
  return {
    font: '12px Inter, system-ui, sans-serif',
    fillColor: Color.WHITE,
    outlineColor: Color.BLACK,
    outlineWidth: 2,
    style: 0 as const,
    verticalOrigin: VerticalOrigin.BOTTOM,
    pixelOffset: new Cartesian2(0, offsetY),
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
    distanceDisplayCondition: new DistanceDisplayCondition(0, 2200),
  };
}

export const CesiumDigitalTwin = forwardRef<CesiumDigitalTwinHandle, CesiumDigitalTwinProps>(
  function CesiumDigitalTwin(
    {
      buildings,
      walkways,
      pois,
      entrances,
      parking,
      greenAreas,
      boundary = campusBoundaryFromConfig(),
      nodes,
      edges,
      crowdByEdge,
      zones,
      userLatitude,
      userLongitude,
      mapCenter,
      selectedBuildingId = null,
      onSelect,
      layers,
      navigationRoute = null,
      cameraMode = '3D',
      onReady,
      onError,
      className = '',
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<Viewer | null>(null);
    const sourcesRef = useRef<TwinSources | null>(null);
    const cameraSetRef = useRef(false);
    const onSelectRef = useRef(onSelect);
    onSelectRef.current = onSelect;
    const onReadyRef = useRef(onReady);
    onReadyRef.current = onReady;
    const onErrorRef = useRef(onError);
    onErrorRef.current = onError;

    const flyToCampus = () => {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;
      flyCameraToCampus(viewer, buildings, nodes, cameraMode, mapCenter);
    };

    const flyToBuilding = (buildingId: string) => {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;
      const building = buildings.find((b) => b.id === buildingId);
      if (!building) return;
      flyCameraToBuilding(viewer, building);
    };

    const flyToPoi = (poi: Pick<CampusPOI, 'latitude' | 'longitude'>) => {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;
      flyCameraToPOI(viewer, poi);
    };

    const focusRoute = () => {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed() || !navigationRoute) return;
      flyCameraToRoute(viewer, navigationRoute, mapCenter);
    };

    useImperativeHandle(ref, () => ({
      flyToCampus,
      flyToBuilding,
      flyToPOI: flyToPoi,
      focusRoute,
    }));
    const flyToCampusRef = useRef(flyToCampus);
    flyToCampusRef.current = flyToCampus;

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      let viewer: Viewer;
      try {
        viewer = new Viewer(container, {
          animation: false,
          baseLayerPicker: false,
          fullscreenButton: false,
          geocoder: false,
          homeButton: false,
          infoBox: false,
          sceneModePicker: false,
          selectionIndicator: true,
          timeline: false,
          navigationHelpButton: false,
          navigationInstructionsInitiallyVisible: false,
        });
      } catch (err) {
        onErrorRef.current?.(
          err instanceof Error ? err.message : 'Unable to create the 3D viewer.',
        );
        return;
      }

      viewer.imageryLayers.removeAll();
      viewer.imageryLayers.addImageryProvider(
        new OpenStreetMapImageryProvider({
          url: 'https://tile.openstreetmap.org/',
        }),
      );
      viewer.scene.globe.depthTestAgainstTerrain = false;
      const creditContainer = viewer.cesiumWidget.creditContainer as HTMLElement;
      creditContainer.style.display = 'none';

      const sources: TwinSources = {
        buildings: new CustomDataSource('twin-buildings'),
        walkways: new CustomDataSource('twin-walkways'),
        route: new CustomDataSource('twin-route'),
        pois: new CustomDataSource('twin-pois'),
        entrances: new CustomDataSource('twin-entrances'),
        parking: new CustomDataSource('twin-parking'),
        greenAreas: new CustomDataSource('twin-green'),
        hazards: new CustomDataSource('twin-hazards'),
        boundary: new CustomDataSource('twin-boundary'),
        user: new CustomDataSource('twin-user'),
      };
      for (const ds of Object.values(sources)) {
        viewer.dataSources.add(ds);
      }

      const clickHandler = new ScreenSpaceEventHandler(viewer.scene.canvas);
      clickHandler.setInputAction((movement: { position: Cartesian2 }) => {
        const picked = viewer.scene.pick(movement.position) as { id?: Entity } | undefined;
        onSelectRef.current?.(parseTwinPick(picked?.id?.id));
      }, ScreenSpaceEventType.LEFT_CLICK);

      const resize = () => {
        if (!viewer.isDestroyed()) viewer.resize();
      };
      const ro = new ResizeObserver(resize);
      ro.observe(container);
      window.addEventListener('resize', resize);

      viewerRef.current = viewer;
      sourcesRef.current = sources;
      cameraSetRef.current = false;
      onReadyRef.current?.();

      return () => {
        window.removeEventListener('resize', resize);
        ro.disconnect();
        clickHandler.destroy();
        viewerRef.current = null;
        sourcesRef.current = null;
        cameraSetRef.current = false;
        if (!viewer.isDestroyed()) viewer.destroy();
      };
    }, []);

    useEffect(() => {
      const sources = sourcesRef.current;
      if (!sources) return;
      const vis = dataSourceVisibility(layers);
      sources.buildings.show = vis.buildings;
      sources.walkways.show = vis.walkways;
      sources.route.show = vis.route;
      sources.pois.show = vis.pois;
      sources.entrances.show = vis.entrances;
      sources.parking.show = vis.parking;
      sources.greenAreas.show = vis.greenAreas;
      sources.hazards.show = vis.hazards;
      sources.boundary.show = vis.boundary;
      sources.user.show = vis.user;
    }, [layers]);

    useEffect(() => {
      const sources = sourcesRef.current;
      const viewer = viewerRef.current;
      if (!sources || !viewer || viewer.isDestroyed()) return;

      sources.buildings.entities.removeAll();
      for (const b of buildings) {
        const height = b.heightM;
        const fill = CROWD_BAND_COLORS.UNKNOWN;
        const outline = cssColor(TWIN_STYLES.buildingOutline, 0.85);
        const position = Cartesian3.fromDegrees(b.longitude, b.latitude, height / 2);
        const ring =
          b.geometryKind === 'footprint' && b.footprint
            ? b.footprint
            : b.geometryKind === 'dimensions' && b.width && b.depth
              ? dimensionRectangleRing(b.center, b.width, b.depth)
              : null;

        sources.buildings.entities.add({
          id: buildingEntityId(b.id),
          name: b.name,
          position,
          ...(b.modelUrl
            ? {
                model: {
                  uri: b.modelUrl,
                  scale: 1,
                  minimumPixelSize: 48,
                },
              }
            : ring
              ? {
                  polygon: {
                    hierarchy: Cartesian3.fromDegreesArray(toCesiumDegreesArray(ring)),
                    extrudedHeight: height,
                    material: cssColor(fill, 0.92),
                    outline: true,
                    outlineColor: outline,
                  },
                }
              : {
                  box: {
                    dimensions: new Cartesian3(b.width ?? 28, b.depth ?? 22, height),
                    material: cssColor(fill, 0.92),
                    outline: true,
                    outlineColor: outline,
                    outlineWidth: 1,
                  },
                }),
          label: {
            text: b.code,
            ...labelStyle(-12),
            font: '13px Inter, system-ui, sans-serif',
          },
        });
      }

      sources.walkways.entities.removeAll();
      for (const seg of walkways) {
        const stroke = walkwayStroke({
          blocked: seg.blocked,
          accessibilityScore: seg.accessibilityScore,
        });
        sources.walkways.entities.add({
          id: walkwayEntityId(seg.id),
          polyline: {
            positions: Cartesian3.fromDegreesArray(toCesiumDegreesArray([seg.from, seg.to])),
            width: stroke.width,
            material: cssColor(stroke.color, stroke.alpha),
            clampToGround: true,
          },
        });
      }

      sources.pois.entities.removeAll();
      for (const poi of pois) {
        sources.pois.entities.add({
          id: poiEntityId(poi.id),
          name: poi.name,
          position: Cartesian3.fromDegrees(poi.longitude, poi.latitude, 4),
          point: {
            pixelSize: 11,
            color: cssColor(TWIN_STYLES.poi),
            outlineColor: Color.WHITE,
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: { text: poi.name, ...labelStyle(-10) },
        });
      }

      sources.entrances.entities.removeAll();
      for (const entrance of entrances) {
        sources.entrances.entities.add({
          id: entranceEntityId(entrance.id),
          name: entrance.name,
          position: Cartesian3.fromDegrees(entrance.longitude, entrance.latitude, 3),
          point: {
            pixelSize: 10,
            color: cssColor(TWIN_STYLES.entrance),
            outlineColor: Color.WHITE,
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: { text: 'Entrance', ...labelStyle(-8) },
        });
      }

      sources.parking.entities.removeAll();
      for (const lot of parking) {
        const entity = {
          id: parkingEntityId(lot.id),
          name: lot.name,
          position: Cartesian3.fromDegrees(lot.longitude, lot.latitude, 2),
          label: { text: lot.name, ...labelStyle(-10) },
        };
        if (lot.geometry && lot.geometry.length >= 3) {
          sources.parking.entities.add({
            ...entity,
            polygon: {
              hierarchy: Cartesian3.fromDegreesArray(toCesiumDegreesArray(lot.geometry)),
              material: cssColor(TWIN_STYLES.parking, 0.28),
              outline: true,
              outlineColor: cssColor(TWIN_STYLES.parking, 0.85),
              height: 0,
            },
          });
        } else {
          sources.parking.entities.add({
            ...entity,
            point: {
              pixelSize: 12,
              color: cssColor(TWIN_STYLES.parking),
              outlineColor: Color.WHITE,
              outlineWidth: 2,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          });
        }
      }

      sources.greenAreas.entities.removeAll();
      for (const area of greenAreas) {
        const entity = {
          id: greenEntityId(area.id),
          name: area.name,
          position: Cartesian3.fromDegrees(area.longitude, area.latitude, 1),
          label: { text: area.name, ...labelStyle(-10) },
        };
        if (area.geometry && area.geometry.length >= 3) {
          sources.greenAreas.entities.add({
            ...entity,
            polygon: {
              hierarchy: Cartesian3.fromDegreesArray(toCesiumDegreesArray(area.geometry)),
              material: cssColor(TWIN_STYLES.greenArea, 0.3),
              outline: true,
              outlineColor: cssColor(TWIN_STYLES.greenArea, 0.8),
              height: 0,
            },
          });
        } else {
          sources.greenAreas.entities.add({
            ...entity,
            point: {
              pixelSize: 11,
              color: cssColor(TWIN_STYLES.greenArea),
              outlineColor: Color.WHITE,
              outlineWidth: 2,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          });
        }
      }

      sources.boundary.entities.removeAll();
      if (boundary && boundary.coordinates.length >= 3) {
        sources.boundary.entities.add({
          id: 'campus-boundary',
          polyline: {
            positions: Cartesian3.fromDegreesArray(toCesiumDegreesArray(boundary.coordinates)),
            width: 2,
            material: cssColor(TWIN_STYLES.boundary, 0.55),
            clampToGround: true,
          },
        });
      }

      if (!cameraSetRef.current && (buildings.length > 0 || walkways.length > 0)) {
        flyToCampusRef.current();
        cameraSetRef.current = true;
      }
      // Static campus graph only. Crowd, selection, route, and hazards have their own effects.
      // eslint-disable-next-line react-hooks/exhaustive-deps -- crowdByEdge/live flags must not rebuild static entities
    }, [buildings, walkways, pois, entrances, parking, greenAreas, boundary]);

    useEffect(() => {
      const sources = sourcesRef.current;
      if (!sources) return;
      for (const seg of walkways) {
        const entity = sources.walkways.entities.getById(walkwayEntityId(seg.id));
        if (!entity?.polyline) continue;
        const intensity = crowdByEdge.get(seg.id) ?? seg.crowdScore;
        const stroke = walkwayStroke({
          blocked: seg.blocked,
          accessibilityScore: seg.accessibilityScore,
          liveCrowdHex: layers.liveData ? crowdColor(intensity) : null,
        });
        entity.polyline.material = new ColorMaterialProperty(cssColor(stroke.color, stroke.alpha));
        entity.polyline.width = new ConstantProperty(stroke.width);
      }
      for (const b of buildings) {
        const entity = sources.buildings.entities.getById(buildingEntityId(b.id));
        if (!entity) continue;
        const { band } = deriveBuildingCrowd(b.id, nodes, edges, crowdByEdge);
        const fill = layers.liveData ? CROWD_BAND_COLORS[band] : CROWD_BAND_COLORS.UNKNOWN;
        const material = cssColor(fill, 0.92);
        if (entity.box) entity.box.material = new ColorMaterialProperty(material);
        if (entity.polygon) entity.polygon.material = new ColorMaterialProperty(material);
      }
    }, [crowdByEdge, walkways, buildings, nodes, edges, layers.liveData]);

    useEffect(() => {
      const sources = sourcesRef.current;
      if (!sources) return;
      for (const b of buildings) {
        const entity = sources.buildings.entities.getById(buildingEntityId(b.id));
        if (!entity) continue;
        const selected = selectedBuildingId === b.id;
        const outline = cssColor(selected ? SELECTED_BUILDING_OUTLINE : TWIN_STYLES.buildingOutline, 0.85);
        if (entity.box) {
          entity.box.outlineColor = new ConstantProperty(outline);
          entity.box.outlineWidth = new ConstantProperty(selected ? 3 : 1);
        }
        if (entity.polygon) {
          entity.polygon.outlineColor = new ConstantProperty(outline);
        }
      }
    }, [selectedBuildingId, buildings]);

    useEffect(() => {
      const sources = sourcesRef.current;
      if (!sources) return;
      sources.hazards.entities.removeAll();
      for (const z of zones.filter((zone) => zone.active)) {
        sources.hazards.entities.add({
          id: `zone-${z.id}`,
          name: z.name,
          position: Cartesian3.fromDegrees(z.longitude, z.latitude),
          ellipse: {
            semiMajorAxis: z.radiusM,
            semiMinorAxis: z.radiusM,
            material: cssColor(hazardColor(z.type), 0.35),
            outline: true,
            outlineColor: cssColor(hazardColor(z.type), 0.7),
            height: 0,
            extrudedHeight: 4,
          },
          label: { text: z.name, ...labelStyle(-8) },
        });
      }
    }, [zones]);

    useEffect(() => {
      const sources = sourcesRef.current;
      if (!sources) return;
      sources.user.entities.removeAll();
      if (userLatitude == null || userLongitude == null) return;
      sources.user.entities.add({
        id: 'user-location',
        position: Cartesian3.fromDegrees(userLongitude, userLatitude, 2),
        point: {
          pixelSize: 14,
          color: cssColor(TWIN_STYLES.user),
          outlineColor: Color.WHITE,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    }, [userLatitude, userLongitude]);

    useEffect(() => {
      const routeDs = sourcesRef.current?.route;
      if (!routeDs) return;
      routeDs.entities.removeAll();
      if (!navigationRoute || navigationRoute.points.length < 2) return;
      const stroke = routeStroke(navigationRoute.kind);
      routeDs.entities.add({
        id: 'nav-route',
        polyline: {
          positions: Cartesian3.fromDegreesArray(toCesiumDegreesArray(navigationRoute.points)),
          width: stroke.width,
          material: cssColor(stroke.color, stroke.alpha),
          clampToGround: true,
        },
      });
      const start = navigationRoute.start;
      const end = navigationRoute.end;
      routeDs.entities.add({
        id: 'nav-start',
        position: Cartesian3.fromDegrees(start.longitude, start.latitude, 6),
        point: {
          pixelSize: 12,
          color: cssColor(TWIN_STYLES.routeStart),
          outlineColor: Color.WHITE,
          outlineWidth: 2,
        },
        label: { text: 'START', ...labelStyle(-14) },
      });
      routeDs.entities.add({
        id: 'nav-end',
        position: Cartesian3.fromDegrees(end.longitude, end.latitude, 6),
        point: {
          pixelSize: 12,
          color: cssColor(TWIN_STYLES.routeEnd),
          outlineColor: Color.WHITE,
          outlineWidth: 2,
        },
        label: { text: 'DESTINATION', ...labelStyle(-14) },
      });
      navigationRoute.waypoints.forEach((wp, i) => {
        routeDs.entities.add({
          id: routeWaypointEntityId(i),
          position: Cartesian3.fromDegrees(wp.longitude, wp.latitude, 5),
          point: {
            pixelSize: 8,
            color: cssColor(TWIN_STYLES.routeWaypoint),
            outlineColor: Color.WHITE,
            outlineWidth: 1,
          },
          label: { text: wp.label ?? 'Waypoint', ...labelStyle(-12) },
        });
      });
    }, [navigationRoute]);

    useEffect(() => {
      if (!cameraSetRef.current) return;
      flyToCampusRef.current();
    }, [cameraMode]);

    return (
      <div
        ref={containerRef}
        className={`cesium-twin-viewer h-full w-full min-h-[16rem] ${className}`.trim()}
        aria-label="Campus digital twin 3D map"
      />
    );
  },
);
