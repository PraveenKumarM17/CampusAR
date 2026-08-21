import type { SiteMapVersion, UnifiedMapValidationResult } from '@campusar/shared';
import { AppError } from '../domain/errors';
import { mapVersionRepository } from '../infrastructure/repositories/mapVersionRepository';
import { validateMapVersion } from './mapVersionValidationService';
import { broadcast } from '../infrastructure/realtime/wsHub';

/** @internal Integration tests inject a failure during publish transactions. */
export type PublishTestFailureStep = 'after-archive' | 'before-pointer-update';

let publishTestFailureAfter: PublishTestFailureStep | null = null;

export function setPublishTestFailureAfter(step: PublishTestFailureStep | null): void {
  publishTestFailureAfter = step;
}

function maybeInjectPublishTestFailure(step: PublishTestFailureStep): void {
  if (publishTestFailureAfter === step) {
    throw new AppError('PUBLISH_TEST_FAILURE', `Injected publish failure ${step}`, 500);
  }
}

export type MapVersionPublishSuccess = {
  published: true;
  version: SiteMapVersion;
  previousVersion: SiteMapVersion | null;
};

export type MapVersionPublishBlocked = {
  published: false;
  version: SiteMapVersion;
  validation: UnifiedMapValidationResult;
};

export type MapVersionPublishResult = MapVersionPublishSuccess | MapVersionPublishBlocked;

export const mapVersionPublishService = {
  async publishDraft(
    siteId: string,
    versionId: string,
    userId: string | null,
  ): Promise<MapVersionPublishResult> {
    const outcome = await mapVersionRepository.publishDraftInTransaction(
      siteId,
      versionId,
      userId,
      async (draft) => validateMapVersion(siteId, draft),
      maybeInjectPublishTestFailure,
    );

    if (outcome.published) {
      broadcast(
        'map_published',
        {
          siteId,
          versionId: outcome.version.id,
          versionNumber: outcome.version.versionNumber,
        },
        siteId,
      );
    }

    return outcome;
  },
};
