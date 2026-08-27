import { describe, expect, it } from 'vitest';
import {
  arSessionToFloorPlan,
  collectMeasureSnapTargets,
  distance2D,
  distance3D,
  floorElevationM,
  formatMeasureDistance,
  geometryFromMeasurePoints,
  measuredRoomExtents,
  measureLabelRotationDeg,
  polylineLength2D,
  projectWorldToScreen,
  snapMeasurePoint,
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

  it('stores the longer room span as length', () => {
    expect(
      measuredRoomExtents([
        { x: 2, y: 3 },
        { x: 7, y: 3 },
        { x: 7, y: 6 },
        { x: 2, y: 6 },
      ]),
    ).toEqual({ lengthM: 5, widthM: 3 });
  });

  it('keeps measure labels readable (not upside-down)', () => {
    expect(measureLabelRotationDeg({ x: 0, y: 0 }, { x: 2, y: 0 })).toBe(0);
    expect(measureLabelRotationDeg({ x: 0, y: 0 }, { x: -2, y: 0 })).toBe(0);
    expect(measureLabelRotationDeg({ x: 0, y: 0 }, { x: 0, y: 2 })).toBe(90);
  });

  it('snaps to the nearest candidate within tolerance', () => {
    const snapped = snapMeasurePoint({ x: 1.1, y: 2.05 }, [
      { x: 0, y: 0 },
      { x: 1, y: 2 },
    ]);
    expect(snapped).toEqual({ x: 1, y: 2 });
    expect(snapMeasurePoint({ x: 10, y: 10 }, [{ x: 1, y: 2 }])).toEqual({ x: 10, y: 10 });
  });

  it('collects snap targets from nodes, POIs, and polygon corners', () => {
    const pts = collectMeasureSnapTargets({
      nodes: [{ localX: 1, localY: 0, localZ: 4 }],
      pois: [{ localX: 2, localY: 3 }],
      rooms: [{ localGeometry: [{ x: 5, y: 6 }] }],
      corridors: [{ localGeometry: [{ x: 7, y: 8 }] }],
    });
    expect(pts).toEqual([
      { x: 1, y: 4 },
      { x: 2, y: 3 },
      { x: 5, y: 6 },
      { x: 7, y: 8 },
    ]);
  });

  it('projects a point at NDC origin to the overlay center', () => {
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const screen = projectWorldToScreen({ x: 0, y: 0, z: 0 }, identity, identity, 200, 100);
    expect(screen).toEqual({ x: 100, y: 50 });
  });

  it('rejects points behind the camera (w <= 0)', () => {
    const view = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const proj = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1];
    expect(projectWorldToScreen({ x: 0, y: 0, z: 0 }, view, proj, 100, 100)).toBeNull();
  });
});
