import { describe, expect, it } from 'vitest';
import {
  classifyTurn,
  dampRelativeBearing,
  relativeBearingDeg,
} from './navigationHeading';

describe('relativeBearingDeg', () => {
  it('normalizes 350° heading to 10° target as small right turn', () => {
    expect(relativeBearingDeg(10, 350)).toBeCloseTo(20, 5);
  });

  it('handles north → east as +90°', () => {
    expect(relativeBearingDeg(90, 0)).toBe(90);
  });

  it('handles east → south as +90°', () => {
    expect(relativeBearingDeg(180, 90)).toBe(90);
  });

  it('handles south → west as +90°', () => {
    expect(relativeBearingDeg(270, 180)).toBe(90);
  });

  it('handles west → north as +90° (wrap)', () => {
    expect(relativeBearingDeg(0, 270)).toBe(90);
  });

  it('returns negative for left turns across 0/360 boundary', () => {
    expect(relativeBearingDeg(350, 10)).toBeCloseTo(-20, 5);
  });

  it('stays within −180…180', () => {
    const r = relativeBearingDeg(200, 10);
    expect(r).toBeGreaterThan(-180);
    expect(r).toBeLessThanOrEqual(180);
  });
});

describe('classifyTurn', () => {
  it('classifies straight within dead zone', () => {
    expect(classifyTurn(5)).toBe('straight');
    expect(classifyTurn(-10)).toBe('straight');
  });

  it('classifies slight and sharp turns', () => {
    expect(classifyTurn(30)).toBe('slight-right');
    expect(classifyTurn(60)).toBe('right');
    expect(classifyTurn(100)).toBe('sharp-right');
    expect(classifyTurn(-30)).toBe('slight-left');
    expect(classifyTurn(-100)).toBe('sharp-left');
  });

  it('classifies u-turn', () => {
    expect(classifyTurn(170)).toBe('u-turn');
    expect(classifyTurn(-170)).toBe('u-turn');
  });
});

describe('dampRelativeBearing', () => {
  it('limits per-step change', () => {
    expect(dampRelativeBearing(0, 90, 10)).toBe(10);
    expect(dampRelativeBearing(0, -90, 10)).toBe(-10);
  });

  it('does not overshoot small deltas', () => {
    expect(dampRelativeBearing(5, 8, 10)).toBe(8);
  });
});
