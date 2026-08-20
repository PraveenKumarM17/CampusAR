import { useEffect, useRef } from 'react';
import {
  Cartesian2,
  Cartesian3,
  Color,
  CustomDataSource,
  DistanceDisplayCondition,
  Math as CesiumMath,
  OpenStreetMapImageryProvider,
  VerticalOrigin,
  Viewer,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import type { Building, CrowdLevel, DangerZone, GraphEdge, GraphNode } from '@campusar/shared';
import {
  buildCrowdByEdge,
  buildingHeightM,
  campusCameraTarget,
  crowdColor,
  hazardColor,
} from '../../lib/cesiumCampus';

export interface CesiumDigitalTwinProps {
  buildings: Building[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  crowd: CrowdLevel[];
  zones: DangerZone[];
  userLatitude?: number | null;
  userLongitude?: number | null;
  className?: string;
}

function syncCampusEntities(
  dataSource: CustomDataSource,
  buildings: Building[],
  nodes: GraphNode[],
  edges: GraphEdge[],
  crowd: CrowdLevel[],
  zones: DangerZone[],
  userLatitude?: number | null,
  userLongitude?: number | null,
) {
  dataSource.entities.removeAll();

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const crowdByEdge = buildCrowdByEdge(crowd, edges);

  for (const b of buildings) {
    const height = buildingHeightM(b.floorsCount);
    dataSource.entities.add({
      id: `building-${b.id}`,
      name: b.name,
      position: Cartesian3.fromDegrees(b.longitude, b.latitude, height / 2),
      box: {
        dimensions: new Cartesian3(28, 22, height),
        material: Color.fromCssColorString('#1c3a5f').withAlpha(0.92),
        outline: true,
        outlineColor: Color.fromCssColorString('#148a80').withAlpha(0.5),
      },
      label: {
        text: b.code,
        font: '13px Inter, system-ui, sans-serif',
        fillColor: Color.WHITE,
        outlineColor: Color.BLACK,
        outlineWidth: 2,
        style: 0,
        verticalOrigin: VerticalOrigin.BOTTOM,
        pixelOffset: new Cartesian2(0, -12),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        distanceDisplayCondition: new DistanceDisplayCondition(0, 2500),
      },
    });
  }

  for (const e of edges) {
    const from = nodeById.get(e.fromNodeId);
    const to = nodeById.get(e.toNodeId);
    if (!from || !to) continue;

    const intensity = crowdByEdge.get(e.id) ?? e.crowdScore;
    dataSource.entities.add({
      id: `edge-${e.id}`,
      polyline: {
        positions: Cartesian3.fromDegreesArray([
          from.longitude,
          from.latitude,
          to.longitude,
          to.latitude,
        ]),
        width: 5,
        material: Color.fromCssColorString(crowdColor(intensity)),
        clampToGround: true,
      },
    });
  }

  for (const z of zones.filter((zone) => zone.active)) {
    dataSource.entities.add({
      id: `zone-${z.id}`,
      name: z.name,
      position: Cartesian3.fromDegrees(z.longitude, z.latitude),
      ellipse: {
        semiMajorAxis: z.radiusM,
        semiMinorAxis: z.radiusM,
        material: Color.fromCssColorString(hazardColor(z.type)).withAlpha(0.35),
        outline: true,
        outlineColor: Color.fromCssColorString(hazardColor(z.type)).withAlpha(0.7),
        height: 0,
        extrudedHeight: 4,
      },
      label: {
        text: z.name,
        font: '12px Inter, system-ui, sans-serif',
        fillColor: Color.WHITE,
        outlineColor: Color.BLACK,
        outlineWidth: 2,
        style: 0,
        pixelOffset: new Cartesian2(0, -8),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        distanceDisplayCondition: new DistanceDisplayCondition(0, 1800),
      },
    });
  }

  if (userLatitude != null && userLongitude != null) {
    dataSource.entities.add({
      id: 'user-location',
      position: Cartesian3.fromDegrees(userLongitude, userLatitude, 2),
      point: {
        pixelSize: 14,
        color: Color.fromCssColorString('#2563eb'),
        outlineColor: Color.WHITE,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
  }
}

export function CesiumDigitalTwin({
  buildings,
  nodes,
  edges,
  crowd,
  zones,
  userLatitude,
  userLongitude,
  className = '',
}: CesiumDigitalTwinProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const dataSourceRef = useRef<CustomDataSource | null>(null);
  const cameraSetRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const viewer = new Viewer(container, {
      animation: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: true,
      infoBox: true,
      sceneModePicker: true,
      selectionIndicator: true,
      timeline: false,
      navigationHelpButton: true,
      navigationInstructionsInitiallyVisible: false,
    });

    viewer.imageryLayers.removeAll();
    viewer.imageryLayers.addImageryProvider(
      new OpenStreetMapImageryProvider({
        url: 'https://tile.openstreetmap.org/',
      }),
    );

    viewer.scene.globe.depthTestAgainstTerrain = false;
    const creditContainer = viewer.cesiumWidget.creditContainer as HTMLElement;
    creditContainer.style.display = 'none';

    const dataSource = new CustomDataSource('campus-twin');
    viewer.dataSources.add(dataSource);

    viewerRef.current = viewer;
    dataSourceRef.current = dataSource;
    cameraSetRef.current = false;

    return () => {
      viewerRef.current = null;
      dataSourceRef.current = null;
      cameraSetRef.current = false;
      if (!viewer.isDestroyed()) {
        viewer.destroy();
      }
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    const dataSource = dataSourceRef.current;
    if (!viewer || !dataSource || viewer.isDestroyed()) return;

    syncCampusEntities(
      dataSource,
      buildings,
      nodes,
      edges,
      crowd,
      zones,
      userLatitude,
      userLongitude,
    );

    if (!cameraSetRef.current && (buildings.length > 0 || nodes.length > 0)) {
      const target = campusCameraTarget(buildings, nodes);
      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(
          target.longitude,
          target.latitude,
          target.heightM,
        ),
        orientation: {
          heading: CesiumMath.toRadians(25),
          pitch: CesiumMath.toRadians(-45),
          roll: 0,
        },
        duration: 1.2,
      });
      cameraSetRef.current = true;
    }
  }, [buildings, nodes, edges, crowd, zones, userLatitude, userLongitude]);

  return (
    <div
      ref={containerRef}
      className={`cesium-twin-viewer h-full w-full ${className}`.trim()}
      aria-label="Campus digital twin 3D map"
    />
  );
}
