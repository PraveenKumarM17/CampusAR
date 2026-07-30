import { describe, expect, it } from 'vitest';
import { DEFAULT_ROUTE_WEIGHTS } from '@campusar/shared';

describe('shared defaults', () => {
  it('route weights sum of soft weights is positive', () => {
    const sum =
      DEFAULT_ROUTE_WEIGHTS.wDistance +
      DEFAULT_ROUTE_WEIGHTS.wSafety +
      DEFAULT_ROUTE_WEIGHTS.wCrowd +
      DEFAULT_ROUTE_WEIGHTS.wAccessibility;
    expect(sum).toBeGreaterThan(0.9);
    expect(sum).toBeLessThanOrEqual(1.1);
  });
});
