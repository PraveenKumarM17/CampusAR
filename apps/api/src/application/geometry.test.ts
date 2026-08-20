import { describe, expect, it } from 'vitest';
import { closeRing, footprintFromGeoJson, ringToWkt } from './geometry';

describe('geometry helpers', () => {
  it('closes polygon rings for PostGIS WKT', () => {
    const ring = [
      { latitude: 12.9, longitude: 77.5 },
      { latitude: 12.901, longitude: 77.501 },
      { latitude: 12.902, longitude: 77.5 },
    ];
    const wkt = ringToWkt(ring);
    expect(wkt).toContain('POLYGON((');
    expect(wkt.split(',').length).toBe(4);
  });

  it('rejects rings with fewer than 3 vertices', () => {
    expect(() =>
      closeRing([
        { latitude: 1, longitude: 2 },
        { latitude: 3, longitude: 4 },
      ]),
    ).toThrow();
  });

  it('parses GeoJSON footprint from database', () => {
    const ring = footprintFromGeoJson({
      type: 'Polygon',
      coordinates: [
        [
          [77.5, 12.9],
          [77.501, 12.901],
          [77.5, 12.902],
          [77.5, 12.9],
        ],
      ],
    });
    expect(ring).toHaveLength(3);
    expect(ring![0]).toEqual({ latitude: 12.9, longitude: 77.5 });
  });
});
