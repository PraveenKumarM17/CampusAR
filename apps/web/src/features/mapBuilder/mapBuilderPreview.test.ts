import { describe, expect, it, beforeEach } from 'vitest';
import { syncPreviewSite, usePreviewStore } from '../../stores/previewStore';

describe('previewStore', () => {
  beforeEach(() => {
    usePreviewStore.getState().exitPreview();
  });

  it('enters and exits preview with version metadata', () => {
    usePreviewStore.getState().enterPreview({
      versionId: 'draft-1',
      versionNumber: 2,
      siteId: 'site-a',
      validation: {
        version: { id: 'draft-1', versionNumber: 2, status: 'draft', label: null },
        valid: false,
        summary: { errors: 1, warnings: 2 },
        issues: [],
      },
    });

    const active = usePreviewStore.getState();
    expect(active.active).toBe(true);
    expect(active.versionId).toBe('draft-1');
    expect(active.versionNumber).toBe(2);
    expect(active.siteId).toBe('site-a');

    usePreviewStore.getState().exitPreview();
    const cleared = usePreviewStore.getState();
    expect(cleared.active).toBe(false);
    expect(cleared.versionId).toBeNull();
    expect(cleared.validation).toBeNull();
  });

  it('clears preview when site switches to a different site', () => {
    usePreviewStore.getState().enterPreview({
      versionId: 'draft-1',
      versionNumber: 2,
      siteId: 'site-a',
      validation: {
        version: { id: 'draft-1', versionNumber: 2, status: 'draft', label: null },
        valid: true,
        summary: { errors: 0, warnings: 0 },
        issues: [],
      },
    });

    syncPreviewSite('site-b');
    expect(usePreviewStore.getState().active).toBe(false);
  });

  it('retains preview when site id unchanged', () => {
    usePreviewStore.getState().enterPreview({
      versionId: 'draft-1',
      versionNumber: 2,
      siteId: 'site-a',
      validation: {
        version: { id: 'draft-1', versionNumber: 2, status: 'draft', label: null },
        valid: true,
        summary: { errors: 0, warnings: 0 },
        issues: [],
      },
    });

    syncPreviewSite('site-a');
    expect(usePreviewStore.getState().active).toBe(true);
  });
});
