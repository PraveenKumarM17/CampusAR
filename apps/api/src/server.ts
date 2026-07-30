import http from 'http';
import { createApp } from './interfaces/http/app';
import { env } from './infrastructure/config/env';
import { attachWebsocket } from './infrastructure/realtime/wsHub';
import { maybeStartIotSimulator } from './infrastructure/iot/simulator';

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
});
