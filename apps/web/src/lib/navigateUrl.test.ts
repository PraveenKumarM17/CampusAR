import { describe, expect, it } from 'vitest';
import { buildNavigateShareUrl, isValidNodeId, parseNavigateParams } from './navigateUrl';

describe('navigateUrl', () => {
  it('validates UUID node ids', () => {
    expect(isValidNodeId('a1000001-0000-0000-0000-000000000001')).toBe(true);
    expect(isValidNodeId('not-a-uuid')).toBe(false);
  });

  it('parses from/to query params', () => {
    const { from, to } = parseNavigateParams(
      '?from=a1000001-0000-0000-0000-000000000001&to=a1000001-0000-0000-0000-000000000010',
    );
    expect(from).toBe('a1000001-0000-0000-0000-000000000001');
    expect(to).toBe('a1000001-0000-0000-0000-000000000010');
  });

  it('builds share URL with stable ids', () => {
    const url = buildNavigateShareUrl(
      'a1000001-0000-0000-0000-000000000001',
      'a1000001-0000-0000-0000-000000000010',
    );
    expect(url).toContain('/navigate');
    expect(url).toContain('from=a1000001-0000-0000-0000-000000000001');
    expect(url).toContain('to=a1000001-0000-0000-0000-000000000010');
  });
});
