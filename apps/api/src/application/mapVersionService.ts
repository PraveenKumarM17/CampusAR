import type { SiteMapVersion, SiteMapVersionSummary } from '@campusar/shared';
import { AppError } from '../domain/errors';
import { mapVersionRepository } from '../infrastructure/repositories/mapVersionRepository';
import { assertResourceInSite } from './siteContext';

export const mapVersionService = {
  /** Public and routing consumers — published version only. */
  async getPublishedVersion(siteId: string): Promise<SiteMapVersion> {
    const pointer = await mapVersionRepository.getSitePublishedPointer(siteId);
    if (pointer) {
      const version = await mapVersionRepository.getById(pointer);
      if (version && version.status === 'published') return version;
    }
    const published = await mapVersionRepository.getPublishedBySite(siteId);
    if (published) return published;
    return mapVersionRepository.ensureInitialPublished(siteId);
  },

  async getDraftVersion(siteId: string): Promise<SiteMapVersion | null> {
    return mapVersionRepository.getDraftBySite(siteId);
  },

  /** Idempotent draft creation with full spatial clone from published version. */
  async getOrCreateDraftVersion(siteId: string, userId: string | null): Promise<SiteMapVersion> {
    const published = await this.getPublishedVersion(siteId);
    const existing = await mapVersionRepository.getDraftBySite(siteId);
    if (existing) {
      const hasSpatial = await mapVersionRepository.draftHasSpatialData(existing.id);
      if (hasSpatial) return existing;
    }

    const versionNumber = existing
      ? existing.versionNumber
      : await mapVersionRepository.nextVersionNumber(siteId);
    try {
      return await mapVersionRepository.createDraftInTransaction(
        siteId,
        userId,
        published.id,
        versionNumber,
        published.id,
      );
    } catch (err: unknown) {
      const pg = err as { code?: string };
      if (pg.code === '23505') {
        const draft = await mapVersionRepository.getDraftBySite(siteId);
        if (draft) return draft;
      }
      if (err instanceof Error && err.message === 'SITE_NOT_FOUND') {
        throw new AppError('NOT_FOUND', 'Site not found', 404);
      }
      throw err;
    }
  },

  async listVersions(siteId: string): Promise<SiteMapVersion[]> {
    await this.getPublishedVersion(siteId);
    return mapVersionRepository.listBySite(siteId);
  },

  async getVersion(siteId: string, versionId: string): Promise<SiteMapVersion> {
    const version = await mapVersionRepository.getById(versionId);
    if (!version) throw new AppError('NOT_FOUND', 'Map version not found', 404);
    await assertResourceInSite(version.siteId, siteId, 'Map version');
    return version;
  },

  async getVersionSummary(siteId: string): Promise<SiteMapVersionSummary> {
    const [publishedVersion, draftVersion] = await Promise.all([
      this.getPublishedVersion(siteId),
      this.getDraftVersion(siteId),
    ]);
    return { publishedVersion, draftVersion };
  },

  /** Reject access to draft versions for non-editor contexts. */
  assertPublicReadable(version: SiteMapVersion): void {
    if (version.status !== 'published') {
      throw new AppError('NOT_FOUND', 'Map version is not published', 404);
    }
  },
};
