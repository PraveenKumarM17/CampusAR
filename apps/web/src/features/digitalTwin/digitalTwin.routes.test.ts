import { describe, expect, it } from 'vitest';
import { DIGITAL_TWIN_LEGACY_PATH, DIGITAL_TWIN_PATH } from './types/digitalTwin';

describe('Digital Twin routes', () => {
  it('exposes /digital-twin as the canonical path and keeps /twin as a legacy alias', () => {
    expect(DIGITAL_TWIN_PATH).toBe('/digital-twin');
    expect(DIGITAL_TWIN_LEGACY_PATH).toBe('/twin');
  });
});
