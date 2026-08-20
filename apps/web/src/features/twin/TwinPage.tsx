import { Suspense, lazy, useEffect, useState } from 'react';
import type { Building, CrowdLevel, DangerZone, GraphEdge, GraphNode } from '@campusar/shared';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { useCampusLive } from '../../hooks/useCampusLive';
import { useGeolocation } from '../../hooks/useGeolocation';

const CesiumDigitalTwin = lazy(() =>
  import('../../components/twin/CesiumDigitalTwin').then((m) => ({
    default: m.CesiumDigitalTwin,
  })),
);

function TwinLoading() {
  return (
    <div className="flex h-full items-center justify-center bg-ink-950 text-sm text-ink-mute">
      Loading 3D campus twin…
    </div>
  );
}

export function TwinPage() {
  const token = useAuthStore((s) => s.accessToken);
  const live = useCampusLive();
  const { pose } = useGeolocation(true);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [zones, setZones] = useState<DangerZone[]>([]);
  const [crowd, setCrowd] = useState<CrowdLevel[]>([]);

  useEffect(() => {
    Promise.all([
      api.buildings(token),
      api.nodes(token),
      api.edges(token),
      api.zones(),
      api.iotCrowd().catch(() => [] as CrowdLevel[]),
    ]).then(([b, n, e, z, c]) => {
      setBuildings(b);
      setNodes(n);
      setEdges(e);
      setZones(z);
      setCrowd(c);
    });
  }, [token]);

  useEffect(() => {
    if (live.crowd.length) setCrowd(live.crowd);
    if (live.zones.length) setZones(live.zones);
  }, [live.crowd, live.zones]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="page-title">Digital Twin</h1>
          <p className="page-sub">
            Cesium 3D campus view with live crowd paths, buildings, and hazard zones.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="border border-line bg-paper-raised px-3 py-2 text-sm">
            WS: {live.connected ? 'live' : 'reconnecting…'}
          </span>
          <span className="border border-line bg-paper-raised px-3 py-2 text-sm">
            Simulator: {live.status?.running ? 'on' : 'off'}
          </span>
          <span className="inline-flex items-center gap-2 border border-line bg-paper-raised px-3 py-2 text-sm">
            <span className="h-2 w-2 rounded-full bg-[#0f6b63]" /> light
            <span className="h-2 w-2 rounded-full bg-[#c47a12]" /> moderate
            <span className="h-2 w-2 rounded-full bg-[#b42318]" /> heavy
          </span>
        </div>
      </div>
      <div className="h-[70vh] overflow-hidden rounded-md border border-line bg-ink-950">
        <Suspense fallback={<TwinLoading />}>
          <CesiumDigitalTwin
            buildings={buildings}
            nodes={nodes}
            edges={edges}
            crowd={crowd}
            zones={zones}
            userLatitude={pose?.latitude}
            userLongitude={pose?.longitude}
            className="min-h-[70vh]"
          />
        </Suspense>
      </div>
    </div>
  );
}
