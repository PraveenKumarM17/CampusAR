import { describe, expect, it } from 'vitest';
import { ScheduleEwmaPredictor } from './crowdPredictor';
import { diurnalCrowdFactor } from './diurnal';

describe('diurnalCrowdFactor', () => {
  it('is low overnight and higher near class-change hours', () => {
    const night = new Date('2026-03-15T03:00:00');
    const peak = new Date('2026-03-15T12:00:00');
    expect(diurnalCrowdFactor(night)).toBeLessThan(0.2);
    expect(diurnalCrowdFactor(peak)).toBeGreaterThan(0.5);
  });
});

describe('ScheduleEwmaPredictor', () => {
  it('raises forecast when class change is within horizon', () => {
    const predictor = new ScheduleEwmaPredictor(20);
    const beforePeak = new Date('2026-03-15T11:45:00');
    const quiet = new Date('2026-03-15T03:00:00');
    const edgeId = 'aaaaaaaa-0000-0000-0000-000000000001';
    const peakForecast = predictor.predictEdgeCrowd(edgeId, 0.2, beforePeak);
    const nightForecast = predictor.predictEdgeCrowd(edgeId, 0.2, quiet);
    expect(peakForecast).toBeGreaterThan(nightForecast);
    expect(peakForecast).toBeGreaterThan(0.35);
  });
});
