import { describe, expect, it } from 'vitest';
import { cloneGeoRing, ringsEqual } from './mapBuilderUtils';

describe('mapBuilderUtils', () => {
  it('clones geo rings without shared references', () => {
    const ring = [
      { latitude: 12.9, longitude: 77.5 },
      { latitude: 12.901, longitude: 77.501 },
    ];
    const copy = cloneGeoRing(ring);
    copy[0].latitude = 0;
    expect(ring[0].latitude).toBe(12.9);
  });

  it('compares rings for equality', () => {
    const a = [
      { latitude: 1, longitude: 2 },
      { latitude: 3, longitude: 4 },
    ];
    expect(ringsEqual(a, cloneGeoRing(a))).toBe(true);
    expect(ringsEqual(a, [{ latitude: 1, longitude: 2 }, { latitude: 9, longitude: 4 }])).toBe(false);
  });
});
