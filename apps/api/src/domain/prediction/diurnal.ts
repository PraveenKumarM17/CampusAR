/** Diurnal crowd curve: peaks near class-change hours. */
export function diurnalCrowdFactor(date = new Date()): number {
  const hour = date.getHours() + date.getMinutes() / 60;
  const peaks = [8.5, 10.0, 12.0, 14.0, 16.0, 18.0];
  let best = 0.15;
  for (const p of peaks) {
    const d = Math.abs(hour - p);
    const bump = Math.exp(-(d * d) / (2 * 0.55 * 0.55));
    best = Math.max(best, 0.2 + 0.75 * bump);
  }
  if (hour < 7 || hour > 21) return 0.08;
  return best;
}
