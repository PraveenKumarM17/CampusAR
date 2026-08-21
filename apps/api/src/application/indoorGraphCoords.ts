import type { LocalVec2, LocalVec3 } from '@campusar/shared';

/** Floor-plan meters (2D) → AR local meters (Y-up, XZ horizontal plane). */
export function floorPlanToLocalVec3(point: LocalVec2, elevationM = 0): LocalVec3 {
  return { x: point.x, y: elevationM, z: point.y };
}

export function localVec3ToFloorPlan(vec: LocalVec3): LocalVec2 {
  return { x: vec.x, y: vec.z };
}

export function nodeKindDefaultEdgeKind(
  kind: string,
): 'walk' | 'stairs' | 'elevator' | 'ramp' | 'escalator' {
  if (kind === 'stairs') return 'stairs';
  if (kind === 'elevator') return 'elevator';
  if (kind === 'ramp') return 'ramp';
  if (kind === 'escalator') return 'escalator';
  return 'walk';
}

export function connectorEdgeDefaults(kind: 'stairs' | 'elevator' | 'ramp' | 'escalator'): {
  kind: typeof kind;
  wheelchairAccessible: boolean;
} {
  if (kind === 'elevator') return { kind, wheelchairAccessible: true };
  if (kind === 'ramp') return { kind, wheelchairAccessible: true };
  if (kind === 'stairs') return { kind, wheelchairAccessible: false };
  return { kind, wheelchairAccessible: false };
}
