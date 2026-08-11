import { haversineMeters } from './geo';

/** Minimum displacement (m) in the window to start walking. */
export const MOVEMENT_START_M = 2.5;
/** Hysteresis: stop walking below this displacement (m). */
export const MOVEMENT_STOP_M = 1.2;
/** Look-back window for movement samples (ms). */
export const MOVEMENT_WINDOW_MS = 4_000;

export interface GpsMovementSample {
  latitude: number;
  longitude: number;
  timestamp: number;
}

export interface GpsMovementState {
  walking: boolean;
  displacementM: number;
}

/**
 * Track whether the user is actually moving from GPS displacement (visual only).
 * Uses hysteresis so GPS jitter does not flip walk/idle constantly.
 */
export function evaluateGpsMovement(
  samples: GpsMovementSample[],
  currentlyWalking: boolean,
  now = Date.now(),
): GpsMovementState {
  const recent = samples.filter((s) => now - s.timestamp <= MOVEMENT_WINDOW_MS);
  if (recent.length < 2) {
    return { walking: false, displacementM: 0 };
  }

  const oldest = recent[0]!;
  const newest = recent[recent.length - 1]!;
  const displacementM = haversineMeters(
    oldest.latitude,
    oldest.longitude,
    newest.latitude,
    newest.longitude,
  );

  const walking = currentlyWalking
    ? displacementM >= MOVEMENT_STOP_M
    : displacementM >= MOVEMENT_START_M;

  return { walking, displacementM };
}

/** Append a sample and prune entries outside the movement window. */
export function appendMovementSample(
  samples: GpsMovementSample[],
  sample: GpsMovementSample,
  now = Date.now(),
): GpsMovementSample[] {
  return [...samples.filter((s) => now - s.timestamp <= MOVEMENT_WINDOW_MS), sample];
}
