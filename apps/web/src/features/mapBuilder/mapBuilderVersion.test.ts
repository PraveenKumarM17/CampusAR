import { describe, expect, it } from 'vitest';
import type { MapBuilderSnapshot, SiteMapVersion } from '@campusar/shared';

describe('MapBuilderSnapshot version metadata', () => {
  it('accepts draft version on snapshot without hardcoded version ids', () => {
    const version: SiteMapVersion = {
      id: 'aaaaaaaa-0000-4000-8000-000000000001',
      siteId: 'bbbbbbbb-0000-4000-8000-000000000002',
      versionNumber: 2,
      status: 'draft',
      label: 'Draft',
      description: null,
      basedOnVersionId: 'cccccccc-0000-4000-8000-000000000003',
      createdBy: null,
      publishedBy: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      publishedAt: null,
      archivedAt: null,
    };
    const snap: MapBuilderSnapshot = {
      siteId: version.siteId,
      version,
      buildings: [],
      nodes: [],
      edges: [],
      areas: [],
    };
    expect(snap.version.status).toBe('draft');
    expect(snap.buildings).toEqual([]);
  });
});
