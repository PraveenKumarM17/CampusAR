import { BoundingSphere, Cartesian3, Math as CesiumMath, type Viewer } from 'cesium';
import { campusCameraTarget } from '../../../lib/cesiumCampus';
import { CAMPUS_CENTER } from '../../../lib/campus';
import type { CampusPOI, DigitalTwinBuilding, TwinCameraMode, TwinRouteOverlay } from '../types/digitalTwin';
import { toCesiumDegreesArray } from '../adapters/coordinates';

export function flyToCampus(
  viewer: Viewer,
  buildings: DigitalTwinBuilding[],
  extraPoints: { latitude: number; longitude: number }[],
  mode: TwinCameraMode,
) {
  const target = campusCameraTarget(
    buildings.map((b) => ({
      id: b.id,
      name: b.name,
      code: b.code,
      description: b.description,
      latitude: b.latitude,
      longitude: b.longitude,
      floorsCount: b.floorsCount,
    })),
    extraPoints.map((p, i) => ({
      id: `p${i}`,
      name: null,
      latitude: p.latitude,
      longitude: p.longitude,
      floorId: null,
      buildingId: null,
      kind: 'outdoor' as const,
    })),
  );
  const pitch = mode === 'TOP' ? -90 : -45;
  const height = mode === 'BUILDING' ? Math.min(target.heightM, 280) : target.heightM;
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(target.longitude, target.latitude, height),
    orientation: {
      heading: CesiumMath.toRadians(mode === 'TOP' ? 0 : 25),
      pitch: CesiumMath.toRadians(pitch),
      roll: 0,
    },
    duration: 1.1,
  });
}

export function flyToBuilding(viewer: Viewer, building: DigitalTwinBuilding) {
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(
      building.longitude,
      building.latitude,
      Math.max(building.heightM + 80, 120),
    ),
    orientation: {
      heading: CesiumMath.toRadians(20),
      pitch: CesiumMath.toRadians(-35),
      roll: 0,
    },
    duration: 1,
  });
}

export function flyToPOI(viewer: Viewer, poi: Pick<CampusPOI, 'latitude' | 'longitude'>) {
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(poi.longitude, poi.latitude, 140),
    orientation: {
      heading: CesiumMath.toRadians(20),
      pitch: CesiumMath.toRadians(-40),
      roll: 0,
    },
    duration: 1,
  });
}

export function flyToRoute(viewer: Viewer, route: TwinRouteOverlay) {
  const degrees = toCesiumDegreesArray(route.points);
  if (degrees.length < 4) {
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(CAMPUS_CENTER.lon, CAMPUS_CENTER.lat, 400),
      duration: 1,
    });
    return;
  }
  const positions = Cartesian3.fromDegreesArray(degrees);
  const sphere = BoundingSphere.fromPoints(positions);
  void viewer.camera.flyToBoundingSphere(sphere, { duration: 1.2 });
}
