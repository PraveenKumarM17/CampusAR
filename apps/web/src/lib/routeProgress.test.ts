import { describe, expect, it } from 'vitest';
import type { RouteStep } from '@campusar/shared';
import {
  ARRIVAL_RADIUS_M,
  computeRouteProgress,
  distanceToNextWaypointM,
  evaluateOffRouteRecalc,
  formatDistance,
  isNearDestination,
  OFF_ROUTE_HOLD_MS,
  OFF_ROUTE_RECALC_M,
  RECALC_COOLDOWN_MS,
  updateArrivalHold,
} from './routeProgress';

const path: RouteStep[] = [
  {
    nodeId: 'a',
    latitude: 12.901,
    longitude: 77.518,
    instruction: 'Start',
    distanceM: 0,
    bearing: 0,
  },
  {
    nodeId: 'b',
    latitude: 12.902,
    longitude: 77.518,
    instruction: 'Go north',
    distanceM: 111,
    bearing: 0,
  },
  {
    nodeId: 'c',
    latitude: 12.903,
    longitude: 77.518,
    instruction: 'Arrive',
    distanceM: 111,
    bearing: 0,
  },
];

describe('formatDistance', () => {
  it('formats meters and kilometers', () => {
    expect(formatDistance(50)).toBe('50 m');
    expect(formatDistance(1500)).toBe('1.5 km');
  });
});

describe('computeRouteProgress', () => {
  it('returns remaining distance near start', () => {
    const p = computeRouteProgress({ latitude: 12.901, longitude: 77.518 }, path);
    expect(p.stepIndex).toBe(0);
    expect(p.distanceRemainingM).toBeGreaterThan(200);
  });

  it('advances step index near middle', () => {
    const p = computeRouteProgress({ latitude: 12.902, longitude: 77.518 }, path);
    expect(p.stepIndex).toBeGreaterThanOrEqual(1);
    expect(p.distanceToRouteM).toBeLessThan(5);
  });

  it('computes distance to next waypoint along route', () => {
    const p = computeRouteProgress({ latitude: 12.9015, longitude: 77.518 }, path);
    const d = distanceToNextWaypointM(p, path);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(p.distanceRemainingM + 1);
  });
});

describe('evaluateOffRouteRecalc', () => {
  it('does not recalc immediately when off route', () => {
    const now = 10_000;
    const d = evaluateOffRouteRecalc({
      distanceToRouteM: OFF_ROUTE_RECALC_M + 10,
      now,
      lastRecalcAt: 0,
      offRouteSince: now,
      loadingRoute: false,
    });
    expect(d.isOffRoute).toBe(true);
    expect(d.shouldRecalc).toBe(false);
  });

  it('recalcs after sustained off-route and cooldown', () => {
    const now = 20_000;
    const d = evaluateOffRouteRecalc({
      distanceToRouteM: OFF_ROUTE_RECALC_M + 5,
      now,
      lastRecalcAt: now - RECALC_COOLDOWN_MS - 1,
      offRouteSince: now - OFF_ROUTE_HOLD_MS - 1,
      loadingRoute: false,
    });
    expect(d.shouldRecalc).toBe(true);
  });

  it('clears off-route state when back on route', () => {
    const d = evaluateOffRouteRecalc({
      distanceToRouteM: 5,
      now: 5000,
      lastRecalcAt: 0,
      offRouteSince: 1000,
      loadingRoute: false,
    });
    expect(d.isOffRoute).toBe(false);
    expect(d.offRouteSince).toBeNull();
  });

  it('does not recalc while a request is in flight', () => {
    const now = 30_000;
    const d = evaluateOffRouteRecalc({
      distanceToRouteM: OFF_ROUTE_RECALC_M + 20,
      now,
      lastRecalcAt: 0,
      offRouteSince: now - OFF_ROUTE_HOLD_MS - 100,
      loadingRoute: true,
    });
    expect(d.shouldRecalc).toBe(false);
  });
});

describe('isNearDestination', () => {
  it('detects proximity to final node', () => {
    expect(
      isNearDestination({ latitude: 12.903, longitude: 77.518 }, path, ARRIVAL_RADIUS_M),
    ).toBe(true);
    expect(
      isNearDestination({ latitude: 12.901, longitude: 77.518 }, path, ARRIVAL_RADIUS_M),
    ).toBe(false);
  });
});

describe('updateArrivalHold', () => {
  it('requires hold duration before arrived', () => {
    const t0 = 1000;
    const first = updateArrivalHold(true, t0, { since: null });
    expect(first.arrived).toBe(false);
    expect(first.since).toBe(t0);
    expect(updateArrivalHold(true, t0 + 1000, { since: t0 }).arrived).toBe(false);
    expect(updateArrivalHold(true, t0 + 3000, { since: t0 }).arrived).toBe(true);
  });

  it('resets when user leaves destination radius', () => {
    expect(updateArrivalHold(false, 5000, { since: 1000 }).since).toBeNull();
  });
});
