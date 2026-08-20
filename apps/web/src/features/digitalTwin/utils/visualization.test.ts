import { describe, expect, it } from 'vitest';
import { walkwayStroke, routeStroke, TWIN_STYLES } from './visualization';

describe('centralized twin styles', () => {
  it('keeps active routes visually stronger than normal walkways', () => {
    const walk = walkwayStroke({ blocked: false, accessibilityScore: 1 });
    const route = routeStroke('WALKING');
    expect(route.width).toBeGreaterThan(walk.width);
    expect(walk.color).toBe(TWIN_STYLES.walkway.color);
  });

  it('marks blocked walkways with the high-attention style', () => {
    const blocked = walkwayStroke({ blocked: true, accessibilityScore: 1, liveCrowdHex: '#0f6b63' });
    expect(blocked.color).toBe(TWIN_STYLES.walkwayBlocked.color);
    expect(blocked.width).toBe(TWIN_STYLES.walkwayBlocked.width);
  });
});
