import { describe, expect, it } from 'vitest';
import type { CameraFrame, SpatialPoint } from '@campusar/shared';
import { MeasurementEngine } from './measurementEngine';

const frame = { trackingState: 'normal' } as Pick<CameraFrame, 'trackingState'>;

function point(id: string, x: number, y: number, z: number): SpatialPoint {
  return {
    id,
    worldPosition: { x, y, z },
    raycastTarget: { type: 'plane', confidence: 1 },
    estimatedAccuracy: 10,
  };
}

describe('MeasurementEngine', () => {
  it('calculates Euclidean distance in millimeters', () => {
    expect(new MeasurementEngine().calculateDistance(point('a', 0, 0, 0), point('b', 300, 400, 0))).toBe(500);
  });

  it('creates an uncertainty range around the world-space distance', () => {
    const result = new MeasurementEngine().createMeasurement(
      'm1',
      point('a', 0, 0, 0),
      point('b', 1000, 0, 0),
      frame,
    );
    expect(result.distanceMM).toBe(1000);
    expect(result.uncertaintyRange).toEqual([950, 1050]);
    expect(result.trackingQualityAtMeasure).toBe('normal');
  });
});