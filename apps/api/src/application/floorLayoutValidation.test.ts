import { describe, expect, it } from 'vitest';
import { validateLocalPolygon, validateLocalPoint } from './floorLayoutValidation';

describe('floorLayoutValidation', () => {
  it('accepts valid rectangle polygon', () => {
    expect(() =>
      validateLocalPolygon([
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 5, y: 4 },
        { x: 0, y: 4 },
      ]),
    ).not.toThrow();
  });

  it('rejects tiny geometry', () => {
    expect(() =>
      validateLocalPolygon([
        { x: 0, y: 0 },
        { x: 0.01, y: 0 },
        { x: 0.01, y: 0.01 },
      ]),
    ).toThrow();
  });

  it('validates local points', () => {
    expect(() => validateLocalPoint(2, 3)).not.toThrow();
    expect(() => validateLocalPoint(Number.NaN, 1)).toThrow();
  });
});
