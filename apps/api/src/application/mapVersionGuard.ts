import { AppError } from '../domain/errors';

/** Reject when a spatial resource belongs to a different map version than expected. */
export function assertResourceInMapVersion(
  resourceVersionId: string | null | undefined,
  expectedVersionId: string,
  resourceLabel = 'Resource',
): void {
  if (!resourceVersionId) {
    throw new AppError('VERSION_CONTEXT_REQUIRED', `${resourceLabel} has no map version`, 422);
  }
  if (resourceVersionId !== expectedVersionId) {
    throw new AppError(
      'CROSS_VERSION_REFERENCE',
      `${resourceLabel} does not belong to the active map version`,
      422,
    );
  }
}

/** Map builder must not mutate published-version rows. */
export function assertDraftWritable(
  resourceVersionId: string | null | undefined,
  draftVersionId: string,
  publishedVersionId: string,
  resourceLabel = 'Resource',
): void {
  if (!resourceVersionId) {
    throw new AppError('VERSION_CONTEXT_REQUIRED', `${resourceLabel} has no map version`, 422);
  }
  if (resourceVersionId === publishedVersionId) {
    throw new AppError(
      'PUBLISHED_VERSION_READ_ONLY',
      `${resourceLabel} belongs to the published map and cannot be edited in draft mode`,
      422,
    );
  }
  assertResourceInMapVersion(resourceVersionId, draftVersionId, resourceLabel);
}
