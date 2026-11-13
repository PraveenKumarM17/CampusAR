#!/usr/bin/env node
/**
 * Prints how to start mobile when port 4000 may already be served by Docker.
 */
import net from 'net';

const port = Number(process.env.API_PORT ?? 4000);

function portInUse(p) {
  return new Promise((resolve) => {
    const tester = net
      .createServer()
      .once('error', () => resolve(true))
      .once('listening', () => tester.close(() => resolve(false)))
      .listen(p, '127.0.0.1');
  });
}

let dockerLikely = await portInUse(port);
try {
  const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2000) });
  if (res.ok) dockerLikely = true;
} catch {
  /* not reachable */
}

console.log('CampusAR mobile dev preflight\n');
if (dockerLikely) {
  console.log(`Port ${port} is in use (often campusar-api in Docker).`);
  console.log('Skip "npm run dev:api" and use the existing API at:');
  console.log(`  http://localhost:${port}/api\n`);
  console.log('Then in separate terminals:');
  console.log('  npm run dev:mobile');
  console.log('  npm run android:mobile');
} else {
  console.log(`Port ${port} is free. Start the API, then Metro and Android:`);
  console.log('  npm run dev:api');
  console.log('  npm run dev:mobile');
  console.log('  npm run android:mobile');
}
