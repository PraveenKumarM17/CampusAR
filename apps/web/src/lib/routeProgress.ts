import type { RouteStep } from '@campusar/shared';
import { haversineMeters } from './geo';

export const STEP_ADVANCE_BUFFER_M = 22;
export const ARRIVAL_RADIUS_M = 28;
export const ARRIVAL_HOLD_MS = 3000;
export const OFF_ROUTE_RECALC_M = 45;
export const RECALC_COOLDOWN_MS = 15_000;
export const OFF_ROUTE_HOLD_MS = 2_500;

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters <= 0) return '0 m';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function pointToSegment(
  p: { latitude: number; longitude: number },
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): { distM: number; t: number } {
  const ax = a.longitude;
  const ay = a.latitude;
  const bx = b.longitude;
  const by = b.latitude;
  const px = p.longitude;
  const py = p.latitude;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) {
    return { distM: haversineMeters(py, px, ay, ax), t: 0 };
  }
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const projLat = ay + t * dy;
  const projLon = ax + t * dx;
  return { distM: haversineMeters(py, px, projLat, projLon), t };
}

function segmentLengthM(a: RouteStep, b: RouteStep): number {
  return haversineMeters(a.latitude, a.longitude, b.latitude, b.longitude);
}

export interface RouteProgress {
  stepIndex: number;
  distanceRemainingM: number;
  alongRouteM: number;
  totalRouteM: number;
  /** Shortest distance from the user to the route polyline (m). */
  distanceToRouteM: number;
}

/** Project GPS onto the route polyline and derive step index + remaining distance. */
export function computeRouteProgress(
  pose: { latitude: number; longitude: number },
  path: RouteStep[],
): RouteProgress {
  if (path.length === 0) {
    return {
      stepIndex: 0,
      distanceRemainingM: 0,
      alongRouteM: 0,
      totalRouteM: 0,
      distanceToRouteM: Infinity,
    };
  }
  if (path.length === 1) {
    const d = haversineMeters(
      pose.latitude,
      pose.longitude,
      path[0].latitude,
      path[0].longitude,
    );
    return {
      stepIndex: 0,
      distanceRemainingM: d,
      alongRouteM: 0,
      totalRouteM: 0,
      distanceToRouteM: d,
    };
  }

  const cumulative: number[] = [0];
  for (let i = 1; i < path.length; i++) {
    cumulative.push(cumulative[i - 1]! + segmentLengthM(path[i - 1]!, path[i]!));
  }
  const totalRouteM = cumulative[cumulative.length - 1]!;

  let bestSeg = 0;
  let bestT = 0;
  let bestDist = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const hit = pointToSegment(pose, path[i]!, path[i + 1]!);
    if (hit.distM < bestDist) {
      bestDist = hit.distM;
      bestSeg = i;
      bestT = hit.t;
    }
  }

  const segLen = segmentLengthM(path[bestSeg]!, path[bestSeg + 1]!);
  const alongRouteM = cumulative[bestSeg]! + segLen * bestT;
  const distanceRemainingM = Math.max(0, totalRouteM - alongRouteM);

  let stepIndex = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const threshold = cumulative[i + 1]! - STEP_ADVANCE_BUFFER_M;
    if (alongRouteM >= threshold) {
      stepIndex = i + 1;
    } else {
      break;
    }
  }
  stepIndex = Math.min(stepIndex, path.length - 1);

  return {
    stepIndex,
    distanceRemainingM,
    alongRouteM,
    totalRouteM,
    distanceToRouteM: bestDist,
  };
}

/** Distance along the route polyline from the user to the next step waypoint. */
export function distanceToNextWaypointM(progress: RouteProgress, path: RouteStep[]): number {
  if (path.length <= 1) return 0;
  const targetIdx = Math.min(progress.stepIndex + 1, path.length - 1);
  if (targetIdx <= progress.stepIndex) return 0;

  const cumulative: number[] = [0];
  for (let i = 1; i < path.length; i++) {
    cumulative.push(cumulative[i - 1]! + segmentLengthM(path[i - 1]!, path[i]!));
  }
  return Math.max(0, cumulative[targetIdx]! - progress.alongRouteM);
}

export interface OffRouteRecalcDecision {
  shouldRecalc: boolean;
  offRouteSince: number | null;
  isOffRoute: boolean;
}

/** Decide whether to recalculate after sustained off-route with cooldown. */
export function evaluateOffRouteRecalc(input: {
  distanceToRouteM: number;
  now: number;
  lastRecalcAt: number;
  offRouteSince: number | null;
  loadingRoute: boolean;
}): OffRouteRecalcDecision {
  const isOffRoute = input.distanceToRouteM > OFF_ROUTE_RECALC_M;
  if (!isOffRoute) {
    return { shouldRecalc: false, offRouteSince: null, isOffRoute: false };
  }
  const since = input.offRouteSince ?? input.now;
  const sustained = input.now - since >= OFF_ROUTE_HOLD_MS;
  const cooledDown = input.now - input.lastRecalcAt >= RECALC_COOLDOWN_MS;
  return {
    isOffRoute: true,
    offRouteSince: since,
    shouldRecalc: sustained && cooledDown && !input.loadingRoute,
  };
}

export function isNearDestination(
  pose: { latitude: number; longitude: number },
  path: RouteStep[],
  radiusM = ARRIVAL_RADIUS_M,
): boolean {
  if (path.length === 0) return false;
  const dest = path[path.length - 1]!;
  return (
    haversineMeters(pose.latitude, pose.longitude, dest.latitude, dest.longitude) <= radiusM
  );
}

/** Debounced arrival: must stay near destination for holdMs. */
export function updateArrivalHold(
  nearDest: boolean,
  now: number,
  state: { since: number | null },
  holdMs = ARRIVAL_HOLD_MS,
): { arrived: boolean; since: number | null } {
  if (!nearDest) {
    return { arrived: false, since: null };
  }
  const since = state.since ?? now;
  if (now - since >= holdMs) {
    return { arrived: true, since };
  }
  return { arrived: false, since };
}
