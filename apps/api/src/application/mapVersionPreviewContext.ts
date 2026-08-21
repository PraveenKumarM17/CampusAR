import type { SiteMapVersion } from '@campusar/shared';
import { AppError } from '../domain/errors';
import type { AuthedRequest } from '../interfaces/http/middleware/auth';
import { resolveEditorSiteId } from './siteContext';
import { mapVersionService } from './mapVersionService';

export type PreviewMapScope = {
  siteId: string;
  mapVersionId: string;
  version: SiteMapVersion;
};

/** Authorizes an explicit draft version for editor preview reads. Never falls back to published. */
export async function resolveEditorPreviewScope(
  req: AuthedRequest,
  versionId: string,
): Promise<PreviewMapScope> {
  const siteId = await resolveEditorSiteId(req);
  const version = await mapVersionService.getVersion(siteId, versionId);
  if (version.status !== 'draft') {
    throw new AppError(
      'PREVIEW_DRAFT_ONLY',
      'Only draft map versions can be previewed',
      422,
      { versionId, status: version.status },
    );
  }
  return { siteId, mapVersionId: version.id, version };
}
