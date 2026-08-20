import { useCallback, useEffect, useState } from 'react';
import type {
  Building,
  CrowdLevel,
  DangerZone,
  EmergencyContact,
  EmergencyExit,
  GraphEdge,
  GraphNode,
} from '@campusar/shared';
import { api } from '../../../lib/api';

export function useDigitalTwinSnapshot(token: string | null) {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [zones, setZones] = useState<DangerZone[]>([]);
  const [crowd, setCrowd] = useState<CrowdLevel[]>([]);
  const [exits, setExits] = useState<EmergencyExit[]>([]);
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.buildings(token),
      api.nodes(token),
      api.edges(token),
      api.zones(),
      api.iotCrowd().catch(() => [] as CrowdLevel[]),
      api.exits().catch(() => [] as EmergencyExit[]),
      api.contacts().catch(() => [] as EmergencyContact[]),
    ])
      .then(([b, n, e, z, c, x, contactsList]) => {
        setBuildings(b);
        setNodes(n);
        setEdges(e);
        setZones(z);
        setCrowd(c);
        setExits(x);
        setContacts(contactsList);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to load campus data.');
      })
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    reload();
  }, [reload]);

  return {
    buildings,
    nodes,
    edges,
    zones,
    crowd,
    exits,
    contacts,
    setCrowd,
    setZones,
    loading,
    error,
    reload,
  };
}

