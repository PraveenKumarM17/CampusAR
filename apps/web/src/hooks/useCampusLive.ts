import { useEffect, useRef, useState } from 'react';
import type { CrowdLevel, DangerZone, IotStatus, SensorReading, WsMessage } from '@campusar/shared';
import { resolveWebSocketUrl } from '../lib/clientUrls';
import { liveEventBelongsToSite } from '../lib/liveEvents';
import { useSiteStore } from '../stores/siteStore';

export interface CampusLiveState {
  connected: boolean;
  crowd: CrowdLevel[];
  sensors: SensorReading[];
  zones: DangerZone[];
  status: IotStatus | null;
  lastEmergency: string | null;
}

export function useCampusLive(): CampusLiveState {
  const [connected, setConnected] = useState(false);
  const [crowd, setCrowd] = useState<CrowdLevel[]>([]);
  const [sensors, setSensors] = useState<SensorReading[]>([]);
  const [zones, setZones] = useState<DangerZone[]>([]);
  const [status, setStatus] = useState<IotStatus | null>(null);
  const [lastEmergency, setLastEmergency] = useState<string | null>(null);
  const activeSiteId = useSiteStore((s) => s.activeSiteId);
  const siteIdRef = useRef(activeSiteId);
  siteIdRef.current = activeSiteId;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (closed) return;
      ws = new WebSocket(resolveWebSocketUrl(import.meta.env.VITE_WS_URL, window.location));
      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!closed) retry = setTimeout(connect, 3000);
      };
      ws.onerror = () => ws?.close();
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as WsMessage;
          if (!liveEventBelongsToSite(msg.siteId, siteIdRef.current)) {
            return;
          }
          if (msg.type === 'crowd') {
            const levels = (msg.payload as { levels: CrowdLevel[] }).levels ?? [];
            setCrowd(
              levels.map((l, i) => ({
                id: String(i),
                edgeId: l.edgeId ?? null,
                nodeId: l.nodeId ?? null,
                intensity: l.intensity,
                label: l.label ?? null,
                updatedAt: msg.at,
              })),
            );
          } else if (msg.type === 'sensors') {
            setSensors((msg.payload as { readings: SensorReading[] }).readings ?? []);
          } else if (msg.type === 'hazard') {
            const z = (msg.payload as { zones: DangerZone[] }).zones ?? [];
            setZones(z);
            if (z.some((x) => x.type === 'fire' || x.type === 'construction')) {
              setLastEmergency(z[0]?.name ?? 'Hazard alert');
            }
          } else if (msg.type === 'iot_status') {
            setStatus(msg.payload as IotStatus);
          }
        } catch {
          /* ignore malformed */
        }
      };
    }

    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      ws?.close();
    };
  }, []);

  return { connected, crowd, sensors, zones, status, lastEmergency };
}
