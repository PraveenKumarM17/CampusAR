/** Normalize compass delta into −180…180 (shortest turn). */
export function relativeBearingDeg(targetBearing: number, heading: number): number {
  return ((targetBearing - heading + 540) % 360) - 180;
}

export type TurnClass =
  | 'straight'
  | 'slight-left'
  | 'left'
  | 'sharp-left'
  | 'u-turn'
  | 'slight-right'
  | 'right'
  | 'sharp-right';

/** Classify turn from relative bearing (target − heading), with dead zone. */
export function classifyTurn(relativeDeg: number, deadZoneDeg = 15): TurnClass {
  const d = relativeDeg;
  if (Math.abs(d) <= deadZoneDeg) return 'straight';
  if (d > deadZoneDeg && d <= 45) return 'slight-right';
  if (d > 45 && d <= 90) return 'right';
  if (d > 90 && d < 135) return 'sharp-right';
  if (d >= 135 || d <= -135) return 'u-turn';
  if (d < -deadZoneDeg && d >= -45) return 'slight-left';
  if (d < -45 && d >= -90) return 'left';
  return 'sharp-left';
}

/** Limit per-frame angular change to reduce flicker (degrees). */
export function dampRelativeBearing(
  currentRelDeg: number,
  targetRelDeg: number,
  maxStepDeg: number,
): number {
  const delta = targetRelDeg - currentRelDeg;
  const wrapped =
    delta > 180 ? delta - 360 : delta < -180 ? delta + 360 : delta;
  const step = Math.max(-maxStepDeg, Math.min(maxStepDeg, wrapped));
  let next = currentRelDeg + step;
  if (next > 180) next -= 360;
  if (next < -180) next += 360;
  return next;
}
