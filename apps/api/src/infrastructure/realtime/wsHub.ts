import type { IotStatus, SensorKind, WsMessage } from '@campusar/shared';
import { IOT_TICK_MS } from '@campusar/shared';
import type { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

let wss: WebSocketServer | null = null;

export function attachWebsocket(server: HttpServer): WebSocketServer {
  wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (socket) => {
    socket.send(
      JSON.stringify({
        type: 'ping',
        payload: { ok: true },
        at: new Date().toISOString(),
      } satisfies WsMessage),
    );
  });
  return wss;
}

export function broadcast<T>(type: WsMessage['type'], payload: T, siteId?: string | null): void {
  if (!wss) return;
  const message: WsMessage<T> = {
    type,
    payload,
    at: new Date().toISOString(),
    siteId: siteId ?? null,
  };
  const raw = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(raw);
    }
  }
}

export type { SensorKind, IotStatus };
export { IOT_TICK_MS };
