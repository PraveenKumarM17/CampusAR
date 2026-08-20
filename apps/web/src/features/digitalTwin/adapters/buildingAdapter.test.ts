import { describe, expect, it } from 'vitest';
import { resolveBuildingGeometry } from './buildingAdapter';

describe('buildingAdapter footprint hierarchy', () => {
  it('prefers API footprint over fallback box', () => {
    const geometry = resolveBuildingGeometry({
      id: 'b-test',
      latitude: 12.901,
      longitude: 77.518,
      floorsCount: 4,
      footprint: [
        { latitude: 12.9005, longitude: 77.5175 },
        { latitude: 12.9005, longitude: 77.5185 },
        { latitude: 12.9015, longitude: 77.5185 },
        { latitude: 12.9015, longitude: 77.5175 },
      ],
    });
    expect(geometry?.kind).toBe('footprint');
    expect(geometry?.footprint).toHaveLength(5);
  });

  it('falls back to box when no footprint exists', () => {
    const geometry = resolveBuildingGeometry({
      id: 'legacy-building',
      latitude: 12.901,
      longitude: 77.518,
      floorsCount: 2,
    });
    expect(geometry?.kind).toBe('fallback');
  });
});
