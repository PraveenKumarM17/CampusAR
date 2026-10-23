import http from 'http';
import { createApp } from './interfaces/http/app';
import { env } from './infrastructure/config/env';
import { attachWebsocket } from './infrastructure/realtime/wsHub';
import { maybeStartIotSimulator } from './infrastructure/iot/simulator';
import {
  pinPointRepository,
  pinStoreEnabled,
} from './infrastructure/repositories/pinPointRepository';

const app = createApp();
const server = http.createServer(app);
attachWebsocket(server);

server.listen(env.port, () => {
  console.log(`CampusAR API listening on :${env.port}`);
  console.log(`Swagger UI at http://localhost:${env.port}/api/docs`);
  console.log(`WebSocket at ws://localhost:${env.port}/ws`);
  if (env.nodeEnv !== 'test') {
    maybeStartIotSimulator();
  }
  if (pinStoreEnabled()) {
    void pinPointRepository
      .syncAll()
      .then((count) => console.log(`Pin points stored in MongoDB (${count})`))
      .catch((err: unknown) => console.error('Pin point MongoDB sync failed', err));
  }
});
