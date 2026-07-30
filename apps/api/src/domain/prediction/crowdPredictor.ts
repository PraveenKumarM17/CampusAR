import { PREDICTION_HORIZON_MINUTES } from '@campusar/shared';
import { diurnalCrowdFactor } from './diurnal';

export interface CrowdPredictor {
  /** Predicted crowd intensity in [0, 1] for an edge at horizon minutes ahead. */
  predictEdgeCrowd(edgeId: string, liveIntensity: number, at?: Date): number;
}

/**
 * Schedule + EWMA style predictor (LSTM-ready interface).
 * Class-change peaks drive proactive penalties 15–30 minutes ahead.
 */
export class ScheduleEwmaPredictor implements CrowdPredictor {
  constructor(private readonly horizonMinutes = PREDICTION_HORIZON_MINUTES) {}

  predictEdgeCrowd(edgeId: string, liveIntensity: number, at = new Date()): number {
    const future = new Date(at.getTime() + this.horizonMinutes * 60_000);
    const schedule = diurnalCrowdFactor(future);
    const edgeBias = ((edgeId.charCodeAt(4) || 0) % 5) / 25;
    const forecast = 0.45 * liveIntensity + 0.55 * Math.min(1, schedule + edgeBias);
    return Math.max(0, Math.min(1, forecast));
  }
}

export const defaultCrowdPredictor: CrowdPredictor = new ScheduleEwmaPredictor();
