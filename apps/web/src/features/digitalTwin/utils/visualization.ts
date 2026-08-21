import {
  CROWD_BAND_COLORS,
  ROUTE_KIND_COLORS,
  type TwinRouteKind,
} from '../types/digitalTwin';

/** Centralized Digital Twin visual styles. Cesium components must import from here. */
export const TWIN_STYLES = {
  walkway: {
    width: 3,
    color: '#94a3b8',
    alpha: 0.55,
  },
  walkwayCrowd: {
    width: 3.5,
    alpha: 0.8,
  },
  walkwayBlocked: {
    width: 5,
    color: '#b42318',
    alpha: 0.95,
  },
  walkwayAccessible: {
    color: '#7c3aed',
    alpha: 0.75,
  },
  route: {
    width: 10,
    alpha: 0.95,
  },
  routeStart: '#16a34a',
  routeEnd: '#b42318',
  routeWaypoint: '#0f766e',
  entrance: '#0f766e',
  poi: '#1d4ed8',
  parking: '#a16207',
  greenArea: '#3f6212',
  boundary: '#334155',
  user: '#2563eb',
  buildingOutline: '#148a80',
  /** Default extruded building fill — must stay readable on satellite imagery. */
  buildingFill: '#2dd4bf',
} as const;

export const ACCESSIBLE_WALKWAY_THRESHOLD = 0.5;

export function walkwayStroke(input: {
  blocked: boolean;
  accessibilityScore: number;
  liveCrowdHex?: string | null;
}): { color: string; width: number; alpha: number } {
  if (input.blocked) {
    return {
      color: TWIN_STYLES.walkwayBlocked.color,
      width: TWIN_STYLES.walkwayBlocked.width,
      alpha: TWIN_STYLES.walkwayBlocked.alpha,
    };
  }
  if (input.liveCrowdHex) {
    return {
      color: input.liveCrowdHex,
      width: TWIN_STYLES.walkwayCrowd.width,
      alpha: TWIN_STYLES.walkwayCrowd.alpha,
    };
  }
  if (input.accessibilityScore < ACCESSIBLE_WALKWAY_THRESHOLD) {
    return {
      color: TWIN_STYLES.walkwayAccessible.color,
      width: TWIN_STYLES.walkway.width,
      alpha: TWIN_STYLES.walkwayAccessible.alpha,
    };
  }
  return {
    color: TWIN_STYLES.walkway.color,
    width: TWIN_STYLES.walkway.width,
    alpha: TWIN_STYLES.walkway.alpha,
  };
}

export function routeStroke(kind: TwinRouteKind): { color: string; width: number; alpha: number } {
  return {
    color: ROUTE_KIND_COLORS[kind],
    width: TWIN_STYLES.route.width,
    alpha: TWIN_STYLES.route.alpha,
  };
}

export function crowdBandHex(band: keyof typeof CROWD_BAND_COLORS): string {
  return CROWD_BAND_COLORS[band];
}
