import type { EmergencyContact, EmergencyExit, GraphNode } from '@campusar/shared';
import type { CampusPOI, CampusPoiCategory } from '../types/digitalTwin';
import { isValidWgs84 } from './coordinates';

function poiCategoryFromName(name: string, kind?: GraphNode['kind']): CampusPoiCategory {
  if (/gate/i.test(name)) return 'gate';
  if (/plaza/i.test(name)) return 'plaza';
  if (/junction|crossroad/i.test(name)) return 'junction';
  if (kind === 'exit') return 'emergency_exit';
  return 'landmark';
}

function keyOf(lat: number, lng: number): string {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

/**
 * Campus POIs from real named outdoor graph nodes, emergency exits, and contacts.
 * Skips unnamed nodes, indoor nodes, and building-attached nodes (those are buildings/entrances).
 */
export function campusPoisFromSources(input: {
  nodes: GraphNode[];
  exits?: EmergencyExit[];
  contacts?: EmergencyContact[];
}): CampusPOI[] {
  const pois: CampusPOI[] = [];
  const seen = new Set<string>();

  for (const node of input.nodes) {
    if (node.kind !== 'outdoor') continue;
    if (node.buildingId) continue;
    if (!node.name?.trim()) continue;
    if (!isValidWgs84(node)) continue;
    const id = `poi-node-${node.id}`;
    seen.add(keyOf(node.latitude, node.longitude));
    pois.push({
      id,
      name: node.name,
      category: poiCategoryFromName(node.name, node.kind),
      latitude: node.latitude,
      longitude: node.longitude,
      metadata: { nodeId: node.id, kind: node.kind },
    });
  }

  const entranceNodeIds = new Set(
    input.nodes.filter((n) => n.kind === 'entrance').map((n) => n.id),
  );

  for (const exit of input.exits ?? []) {
    if (!isValidWgs84(exit)) continue;
    if (entranceNodeIds.has(exit.nodeId)) continue;
    const k = keyOf(exit.latitude, exit.longitude);
    if (seen.has(k)) continue;
    seen.add(k);
    pois.push({
      id: `poi-exit-${exit.id}`,
      name: exit.name,
      category: 'emergency_exit',
      latitude: exit.latitude,
      longitude: exit.longitude,
      metadata: { nodeId: exit.nodeId, buildingId: exit.buildingId },
    });
  }

  for (const contact of input.contacts ?? []) {
    if (contact.latitude == null || contact.longitude == null) continue;
    if (!isValidWgs84({ latitude: contact.latitude, longitude: contact.longitude })) continue;
    const k = keyOf(contact.latitude, contact.longitude);
    if (seen.has(k)) continue;
    seen.add(k);
    const category: CampusPoiCategory =
      contact.kind === 'medical' ? 'medical' : contact.kind === 'security' ? 'security' : 'other';
    pois.push({
      id: `poi-contact-${contact.id}`,
      name: contact.name,
      category,
      latitude: contact.latitude,
      longitude: contact.longitude,
      metadata: { kind: contact.kind, phone: contact.phone, nodeId: contact.nodeId },
    });
  }

  return pois;
}

export function poiEntityId(poiId: string): string {
  return poiId.startsWith('poi-') ? poiId : `poi-${poiId}`;
}

export function parsePoiEntityId(entityId: string | undefined): string | null {
  if (!entityId?.startsWith('poi-')) return null;
  return entityId;
}
