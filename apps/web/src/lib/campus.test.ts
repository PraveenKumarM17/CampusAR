import { describe, expect, it } from 'vitest';
import {
  EMPTY_SITE_MESSAGE,
  resolveActiveSiteId,
  siteHasPublishedMap,
  siteLabel,
  siteMapCenter,
} from './campus';
import type { Site } from '@campusar/shared';

const hospital: Site = {
  id: 'site-hospital',
  organizationId: 'org-hospital',
  organizationName: 'City Hospital',
  organizationSlug: 'city-hospital',
  name: 'Main Building',
  slug: 'main',
  latitude: 13.05,
  longitude: 77.62,
  timezone: 'Asia/Kolkata',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('site metadata helpers', () => {
  it('uses site latitude/longitude for the map center', () => {
    expect(siteMapCenter(hospital)).toEqual([13.05, 77.62]);
  });

  it('labels the active organization and site without hardcoded campus names', () => {
    expect(siteLabel(hospital)).toBe('City Hospital · Main Building');
  });

  it('keeps a persisted site when it is still accessible', () => {
    expect(resolveActiveSiteId([hospital], hospital.id)).toBe(hospital.id);
  });

  it('falls back to the first accessible site when the previous id is gone', () => {
    expect(resolveActiveSiteId([hospital], 'missing')).toBe(hospital.id);
    expect(resolveActiveSiteId([], hospital.id)).toBeNull();
  });

  it('treats an empty graph as unpublished map data', () => {
    expect(siteHasPublishedMap({ buildings: 0, nodes: 0, edges: 0 })).toBe(false);
    expect(siteHasPublishedMap({ buildings: 1, nodes: 0, edges: 0 })).toBe(true);
    expect(EMPTY_SITE_MESSAGE).toMatch(/No map data has been published/i);
  });
});
