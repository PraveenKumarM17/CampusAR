import http from 'http';
import { createApp } from './interfaces/http/app';
import { env } from './infrastructure/config/env';
import { attachWebsocket } from './infrastructure/realtime/wsHub';
import { maybeStartIotSimulator } from './infrastructure/iot/simulator';

const app = createApp();
const server = http.createServer(app);
attachWebsocket(server);

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `\nCampusAR API could not bind to port ${env.port} (already in use).\n` +
        `  • If Docker is running the API: docker ps --filter name=campusar-api\n` +
        `    You do NOT need "npm run dev:api" — use http://localhost:${env.port}/api from mobile/web.\n` +
        `  • To run the API locally instead: stop Docker's api service (docker compose stop api)\n` +
        `    or set API_PORT to another port in .env (e.g. API_PORT=4001).\n`,
    );
    process.exit(1);
  }
  throw err;
});

server.listen(env.port, () => {
  console.log(`CampusAR API listening on :${env.port}`);
  console.log(`Swagger UI at http://localhost:${env.port}/api/docs`);
  console.log(`WebSocket at ws://localhost:${env.port}/ws`);
  if (env.nodeEnv !== 'test') {
    maybeStartIotSimulator();
  }
});
