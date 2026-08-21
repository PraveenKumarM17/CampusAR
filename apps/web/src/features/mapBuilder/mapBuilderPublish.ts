import type { UnifiedMapValidationResult } from '@campusar/shared';

/** Publish is blocked only when the latest validation snapshot reports errors. */
export function publishBlockedByValidation(validation: UnifiedMapValidationResult | null): boolean {
  return validation != null && validation.summary.errors > 0;
}

/** Warnings alone do not block publishing. */
export function publishAllowedWithWarnings(validation: UnifiedMapValidationResult | null): boolean {
  if (!validation) return true;
  return validation.summary.errors === 0;
}

export function publishConfirmMessage(versionNumber: number, warningCount: number): string {
  const base = `Publish this map version?\n\nVersion ${versionNumber} will become the live map for this site.\nThe currently published version will be archived.`;
  if (warningCount <= 0) return base;
  return `${base}\n\nThis draft has ${warningCount} validation warning(s). You can still publish.`;
}
