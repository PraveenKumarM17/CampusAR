import { createApp } from './interfaces/http/app';
import { env } from './infrastructure/config/env';

const app = createApp();

app.listen(env.port, () => {
  console.log(`CampusAR API listening on :${env.port}`);
  console.log(`Swagger UI at http://localhost:${env.port}/api/docs`);
});
