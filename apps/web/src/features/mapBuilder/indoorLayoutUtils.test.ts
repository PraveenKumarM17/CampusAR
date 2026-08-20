import { describe, expect, it } from 'vitest';
import { rectFromDrag, ringsEqual, cloneRing } from '../../features/mapBuilder/indoorLayoutUtils';

describe('indoorLayoutUtils', () => {
  it('builds rectangle from drag', () => {
    const rect = rectFromDrag({ x: 0, y: 0 }, { x: 4, y: 3 });
    expect(rect).toHaveLength(4);
    expect(rect[0]).toEqual({ x: 0, y: 0 });
    expect(rect[2]).toEqual({ x: 4, y: 3 });
  });

  it('clones and compares rings', () => {
    const ring = [
      { x: 1, y: 2 },
      { x: 3, y: 4 },
      { x: 5, y: 6 },
    ];
    expect(ringsEqual(ring, cloneRing(ring))).toBe(true);
    expect(ringsEqual(ring, [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }])).toBe(false);
  });
});
