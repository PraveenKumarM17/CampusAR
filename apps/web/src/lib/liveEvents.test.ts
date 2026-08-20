import { describe, expect, it } from 'vitest';
import { liveEventBelongsToSite } from './liveEvents';

describe('liveEventBelongsToSite', () => {
  it('ignores events tagged for another site', () => {
    expect(liveEventBelongsToSite('site-b', 'site-a')).toBe(false);
  });

  it('applies events for the active site', () => {
    expect(liveEventBelongsToSite('site-a', 'site-a')).toBe(true);
  });

  it('applies untagged events such as iot_status', () => {
    expect(liveEventBelongsToSite(null, 'site-a')).toBe(true);
    expect(liveEventBelongsToSite('site-a', null)).toBe(true);
  });
});
