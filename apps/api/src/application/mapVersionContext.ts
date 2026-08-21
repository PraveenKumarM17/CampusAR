import type { SiteMapVersion } from '@campusar/shared';
import { mapVersionService } from './mapVersionService';

/** Resolves the live published map version for public site reads. */
export async function resolvePublishedMapVersion(siteId: string): Promise<SiteMapVersion> {
  return mapVersionService.getPublishedVersion(siteId);
}

/** Resolves editable draft for map builder (includes spatial clone on first create). */
export async function resolveEditorDraftMapVersion(
  siteId: string,
  userId: string | null,
): Promise<SiteMapVersion> {
  return mapVersionService.getOrCreateDraftVersion(siteId, userId);
}
