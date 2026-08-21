import { create } from 'zustand';
import type { UnifiedMapValidationResult } from '@campusar/shared';

type PreviewState = {
  active: boolean;
  versionId: string | null;
  versionNumber: number | null;
  siteId: string | null;
  validation: UnifiedMapValidationResult | null;
  enterPreview: (input: {
    versionId: string;
    versionNumber: number;
    siteId: string;
    validation: UnifiedMapValidationResult;
  }) => void;
  exitPreview: () => void;
};

export const usePreviewStore = create<PreviewState>((set) => ({
  active: false,
  versionId: null,
  versionNumber: null,
  siteId: null,
  validation: null,
  enterPreview: ({ versionId, versionNumber, siteId, validation }) =>
    set({
      active: true,
      versionId,
      versionNumber,
      siteId,
      validation,
    }),
  exitPreview: () =>
    set({
      active: false,
      versionId: null,
      versionNumber: null,
      siteId: null,
      validation: null,
    }),
}));

/** Clears preview when the active site no longer matches the preview site. */
export function syncPreviewSite(siteId: string | null): void {
  const state = usePreviewStore.getState();
  if (state.active && state.siteId && siteId && state.siteId !== siteId) {
    state.exitPreview();
  }
}
