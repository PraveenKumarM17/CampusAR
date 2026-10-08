import type {
  CameraFrame,
  DistanceMeasurement,
  SpatialPoint,
  TrackingState,
} from '@campusar/shared';

export class MeasurementEngine {
  calculateDistance(pointA: SpatialPoint, pointB: SpatialPoint): number {
    const dx = pointB.worldPosition.x - pointA.worldPosition.x;
    const dy = pointB.worldPosition.y - pointA.worldPosition.y;
    const dz = pointB.worldPosition.z - pointA.worldPosition.z;
    return Math.hypot(dx, dy, dz);
  }

  createMeasurement(
    id: string,
    pointA: SpatialPoint,
    pointB: SpatialPoint,
    frame: Pick<CameraFrame, 'trackingState'>,
  ): DistanceMeasurement {
    const distanceMM = this.calculateDistance(pointA, pointB);
    const errorMM = this.estimateError(pointA, pointB, distanceMM);
    const trackingQualityAtMeasure: TrackingState = frame.trackingState;
    const placementConfidence = Math.min(
      pointA.raycastTarget?.confidence ?? 0.5,
      pointB.raycastTarget?.confidence ?? 0.5,
    );

    return {
      id,
      pointAId: pointA.id ?? id,
      pointBId: pointB.id ?? id,
      distanceMM,
      confidence: Math.max(0, Math.min(1, placementConfidence * trackingScore(trackingQualityAtMeasure))),
      uncertaintyRange: [Math.max(0, distanceMM - errorMM), distanceMM + errorMM],
      trackingQualityAtMeasure,
      timestamp: Date.now(),
    };
  }

  private estimateError(pointA: SpatialPoint, pointB: SpatialPoint, distanceMM: number): number {
    const base = Math.max(pointA.estimatedAccuracy ?? 50, pointB.estimatedAccuracy ?? 50);
    const drift = (distanceMM / 1000) * 50;
    const depthBonus = pointA.trackingQuality?.depthAvailable && pointB.trackingQuality?.depthAvailable ? 0.7 : 1;
    return Math.max(base, drift) * depthBonus;
  }
}

function trackingScore(state: TrackingState): number {
  if (state === 'normal') return 1;
  if (state === 'limited') return 0.6;
  return 0.2;
}