import { describe, expect, it } from 'vitest';
import type { UnifiedMapValidationResult } from '@campusar/shared';
import {
  publishAllowedWithWarnings,
  publishBlockedByValidation,
  publishConfirmMessage,
} from './mapBuilderPublish';

function validation(
  errors: number,
  warnings: number,
): UnifiedMapValidationResult {
  return {
    version: { id: 'v1', versionNumber: 2, status: 'draft', label: null },
    valid: errors === 0,
    summary: { errors, warnings },
    issues: [],
  };
}

describe('mapBuilderPublish helpers', () => {
  it('blocks publish when validation has errors', () => {
    expect(publishBlockedByValidation(validation(2, 0))).toBe(true);
    expect(publishBlockedByValidation(validation(0, 3))).toBe(false);
    expect(publishBlockedByValidation(null)).toBe(false);
  });

  it('allows publish with warnings only', () => {
    expect(publishAllowedWithWarnings(validation(0, 5))).toBe(true);
    expect(publishAllowedWithWarnings(validation(1, 0))).toBe(false);
  });

  it('includes warning count in confirm message', () => {
    expect(publishConfirmMessage(2, 0)).toContain('Version 2');
    expect(publishConfirmMessage(2, 3)).toContain('3 validation warning');
  });
});
