import type { GraphNode } from '@campusar/shared';
import type { EntranceRole, TwinEntrance } from '../types/digitalTwin';
import { isValidWgs84 } from './coordinates';

export function entranceRoleFromName(name: string | null): EntranceRole {
  if (!name) return 'main';
  if (/accessible|ramp|wheelchair/i.test(name)) return 'accessible';
  if (/side|rear|east|west|north|south/i.test(name) && /entrance|door/i.test(name)) return 'side';
  return 'main';
}

/**
 * Real outdoor entrance nodes (`kind === 'entrance'`) with WGS84 coordinates.
 * Does not fabricate doors. Role is inferred from the existing node name only.
 */
export function entrancesFromNodes(nodes: GraphNode[]): TwinEntrance[] {
  const out: TwinEntrance[] = [];
  for (const node of nodes) {
    if (node.kind !== 'entrance') continue;
    if (!isValidWgs84(node)) continue;
    out.push({
      id: node.id,
      name: node.name?.trim() || 'Entrance',
      buildingId: node.buildingId,
      latitude: node.latitude,
      longitude: node.longitude,
      nodeId: node.id,
      role: entranceRoleFromName(node.name),
    });
  }
  return out;
}

export function entranceEntityId(nodeId: string): string {
  return `entrance-${nodeId}`;
}

export function parseEntranceEntityId(entityId: string | undefined): string | null {
  if (!entityId?.startsWith('entrance-')) return null;
  return entityId.slice('entrance-'.length) || null;
}
