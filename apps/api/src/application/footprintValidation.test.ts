import { describe, expect, it } from 'vitest';
import { centroidDriftMeters } from './footprintValidation';

describe('centroidDriftMeters', () => {
  it('returns near zero when stored point matches footprint average', () => {
    const footprint = [
      { latitude: 12, longitude: 77 },
      { latitude: 12, longitude: 78 },
      { latitude: 13, longitude: 78 },
    ];
    const drift = centroidDriftMeters(footprint, 12.333333, 77.666667);
    expect(drift).toBeLessThan(1);
  });

  it('detects material drift', () => {
    const footprint = [
      { latitude: 12.901, longitude: 77.518 },
      { latitude: 12.902, longitude: 77.519 },
      { latitude: 12.903, longitude: 77.518 },
    ];
    const drift = centroidDriftMeters(footprint, 13.5, 78);
    expect(drift).toBeGreaterThan(1000);
  });
});
