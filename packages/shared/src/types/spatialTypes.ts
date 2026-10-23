/** 3D position in millimeters relative to an AR session origin. */
export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

/** Quaternion used by WebXR poses. */
export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** Column-major 4x4 transform matrix. */
export type Matrix4x4 = number[];

export type RaycastTargetType = 'plane' | 'feature' | 'depth' | 'manual';
export type TrackingState = 'notAvailable' | 'limited' | 'normal';

export interface CameraFrame {
  timestamp: number;
  position: Vector3D;
  orientation: Quaternion;
  worldToCamera: Matrix4x4;
  cameraToWorld: Matrix4x4;
  projectionMatrix: Matrix4x4;
  intrinsics: {
    focalLengthX: number;
    focalLengthY: number;
    principalPointX: number;
    principalPointY: number;
    imageWidth: number;
    imageHeight: number;
  };
  trackingState: TrackingState;
  featureDensity: number;
  depthAvailable: boolean;
}

/** Canonical persisted representation of an AR measurement point. */
export interface SpatialPoint {
  id?: string;
  worldPosition: Vector3D;
  worldTransform?: Matrix4x4;
  raycastTarget?: {
    type: RaycastTargetType;
    confidence: number;
  };
  spatialAnchor?: {
    id: string;
    transform: Matrix4x4;
  };
  trackingQuality?: {
    state: TrackingState;
    featureDensity: number;
    depthAvailable: boolean;
    cameraMotionSmoothed: boolean;
  };
  estimatedAccuracy?: number;
  revisitCount?: number;
  label?: string;
  color?: string;
  floorId?: string | null;
  buildingId?: string | null;
  roomId?: string | null;
  createdAt?: number;
  lastModified?: number;
}

export interface DistanceMeasurement {
  id: string;
  pointAId: string;
  pointBId: string;
  distanceMM: number;
  confidence: number;
  uncertaintyRange: [number, number];
  trackingQualityAtMeasure: TrackingState;
  timestamp: number;
  label?: string;
}
