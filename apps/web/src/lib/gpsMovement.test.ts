import { describe, expect, it } from 'vitest';
import {
  appendMovementSample,
  evaluateGpsMovement,
  MOVEMENT_START_M,
  MOVEMENT_STOP_M,
} from './gpsMovement';

describe('evaluateGpsMovement', () => {
  const t0 = 10_000;

  it('returns not walking with fewer than two samples', () => {
    expect(evaluateGpsMovement([{ latitude: 12.9, longitude: 77.51, timestamp: t0 }], false, t0)).toEqual({
      walking: false,
      displacementM: 0,
    });
  });

  it('starts walking after meaningful displacement', () => {
    const samples = [
      { latitude: 12.901, longitude: 77.518, timestamp: t0 },
      { latitude: 12.90103, longitude: 77.518, timestamp: t0 + 2000 },
    ];
    const r = evaluateGpsMovement(samples, false, t0 + 2000);
    expect(r.displacementM).toBeGreaterThan(MOVEMENT_START_M - 0.5);
    expect(r.walking).toBe(true);
  });

  it('does not start walking for GPS jitter below threshold', () => {
    const samples = [
      { latitude: 12.901, longitude: 77.518, timestamp: t0 },
      { latitude: 12.901002, longitude: 77.518001, timestamp: t0 + 1000 },
    ];
    const r = evaluateGpsMovement(samples, false, t0 + 1000);
    expect(r.walking).toBe(false);
  });

  it('keeps walking until displacement drops below stop threshold (hysteresis)', () => {
    const samples = [
      { latitude: 12.901, longitude: 77.518, timestamp: t0 },
      { latitude: 12.901018, longitude: 77.518, timestamp: t0 + 3000 },
    ];
    const r = evaluateGpsMovement(samples, true, t0 + 3000);
    expect(r.displacementM).toBeGreaterThan(MOVEMENT_STOP_M);
    expect(r.displacementM).toBeLessThan(MOVEMENT_START_M);
    expect(r.walking).toBe(true);
  });

  it('stops walking when displacement falls below stop threshold', () => {
    const samples = [
      { latitude: 12.901, longitude: 77.518, timestamp: t0 },
      { latitude: 12.901008, longitude: 77.518, timestamp: t0 + 3000 },
    ];
    const r = evaluateGpsMovement(samples, true, t0 + 3000);
    expect(r.displacementM).toBeLessThan(MOVEMENT_STOP_M);
    expect(r.walking).toBe(false);
  });
});

describe('appendMovementSample', () => {
  it('drops samples outside the movement window', () => {
    const now = 20_000;
    const kept = appendMovementSample(
      [{ latitude: 1, longitude: 1, timestamp: now - 10_000 }],
      { latitude: 2, longitude: 2, timestamp: now },
      now,
    );
    expect(kept).toHaveLength(1);
    expect(kept[0]!.latitude).toBe(2);
  });
});
