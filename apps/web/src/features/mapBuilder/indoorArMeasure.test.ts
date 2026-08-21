import { describe, expect, it } from 'vitest';
import {
  arSessionToFloorPlan,
  distance2D,
  distance3D,
  floorElevationM,
  formatMeasureDistance,
  geometryFromMeasurePoints,
  polylineLength2D,
  verticalSpan3D,
} from './indoorArMeasure';

describe('indoorArMeasure (AR-Measure distance logic)', () => {
  it('distance3D matches Pythagorean 3-4-5 triangle', () => {
    expect(distance3D({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 })).toBe(5);
  });

  it('distance2D matches plan segment length', () => {
    expect(distance2D({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('formatMeasureDistance uses cm under 1 m', () => {
    expect(formatMeasureDistance(0.42)).toBe('42.00 cm');
    expect(formatMeasureDistance(2.5)).toBe('2.50 m');
  });

  it('geometryFromMeasurePoints builds rectangle from two corners', () => {
    const ring = geometryFromMeasurePoints([
      { x: 1, y: 2 },
      { x: 5, y: 8 },
    ]);
    expect(ring).toHaveLength(4);
    expect(ring[0]).toEqual({ x: 1, y: 2 });
    expect(ring[2]).toEqual({ x: 5, y: 8 });
  });

  it('polylineLength2D sums segment distances', () => {
    const len = polylineLength2D([
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 4 },
    ]);
    expect(len).toBe(7);
  });

  it('arSessionToFloorPlan projects XZ to floor plan', () => {
    const origin = { x: 1, y: 0, z: 2 };
    const plan = arSessionToFloorPlan(
      [
        { x: 1, y: 0, z: 2 },
        { x: 4, y: 0, z: 6 },
      ],
      origin,
    );
    expect(plan[1]).toEqual({ x: 3, y: 4 });
  });

  it('verticalSpan3D returns Y range', () => {
    expect(
      verticalSpan3D([
        { x: 0, y: 1, z: 0 },
        { x: 0, y: 4.5, z: 0 },
      ]),
    ).toBeCloseTo(3.5);
  });

  it('floorElevationM uses configurable floor height factor', () => {
    expect(floorElevationM(2, 3.5)).toBe(7);
    expect(floorElevationM(3, 4)).toBe(12);
  });
});
