#!/usr/bin/env node
/**
 * F-002 Docker integration test.
 *
 * Builds an isolated Compose project, then verifies through nginx:
 *   GET /health              → API JSON (not the SPA)
 *   GET /api/campus/buildings → API JSON (path prefix preserved)
 *   WS  /ws                  → HTTP 101 upgrade
 *
 * Usage (from repo root):
 *   npm run test:docker
 *
 * Always tears down the throwaway project, including on failure.
 * Does not use the default Compose project name, so a developer stack can stay up
 * if host ports 18080/18400/18543 are free.
 */
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT = 'campusar-proxy-test';
const WEB_PORT = process.env.WEB_HOST_PORT || '18080';
const API_PORT = process.env.API_HOST_PORT || '18400';
const DB_PORT = process.env.POSTGRES_HOST_PORT || '18543';
const BASE = `http://127.0.0.1:${WEB_PORT}`;
const UP_TIMEOUT_MS = 180_000;

function run(command, args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, ...extraEnv },
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited ${code}`));
    });
  });
}

const composeEnv = {
  WEB_HOST_PORT: WEB_PORT,
  API_HOST_PORT: API_PORT,
  POSTGRES_HOST_PORT: DB_PORT,
  VITE_API_URL: '/api',
};

async function compose(args) {
  await run('docker', ['compose', '-p', PROJECT, '-f', 'docker-compose.yml', ...args], composeEnv);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForHttp(url, timeoutMs) {
  const start = Date.now();
  let lastErr = 'not started';
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      const text = await res.text();
      if (res.ok && !text.includes('<html') && !text.includes('<!DOCTYPE')) {
        return { res, text };
      }
      lastErr = `HTTP ${res.status} ${text.slice(0, 120)}`;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
    await sleep(2000);
  }
  throw new Error(`Timeout waiting for ${url}: ${lastErr}`);
}

async function get(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const text = await res.text();
  return { status: res.status, text, contentType: res.headers.get('content-type') ?? '' };
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function testWebSocketUpgrade() {
  return new Promise((resolve, reject) => {
    const key = crypto.randomBytes(16).toString('base64');
    const req = http.request({
      hostname: '127.0.0.1',
      port: Number(WEB_PORT),
      path: '/ws',
      method: 'GET',
      headers: {
        Host: `127.0.0.1:${WEB_PORT}`,
        Upgrade: 'websocket',
        Connection: 'Upgrade',
        'Sec-WebSocket-Key': key,
        'Sec-WebSocket-Version': '13',
      },
    });
    const timer = setTimeout(() => {
      req.destroy();
      reject(new Error('WebSocket upgrade timed out'));
    }, 10_000);
    req.on('upgrade', (res, socket) => {
      clearTimeout(timer);
      const status = res.statusCode;
      socket.end();
      if (status === 101) resolve(101);
      else reject(new Error(`WebSocket upgrade status ${status}`));
    });
    req.on('response', (res) => {
      clearTimeout(timer);
      reject(
        new Error(
          `Expected WebSocket 101 through nginx, got HTTP ${res.statusCode} (SPA fallback or missing /ws proxy)`,
        ),
      );
    });
    req.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    req.end();
  });
}

let cleaned = false;
async function cleanup() {
  if (cleaned) return;
  cleaned = true;
  try {
    await compose(['down', '--volumes', '--remove-orphans']);
  } catch (err) {
    console.error('cleanup failed:', err);
  }
}

process.on('SIGINT', () => {
  cleanup().finally(() => process.exit(130));
});
process.on('SIGTERM', () => {
  cleanup().finally(() => process.exit(143));
});

async function main() {
  console.log(`F-002 proxy test — project ${PROJECT}, nginx ${BASE}`);
  try {
    await compose(['up', '--build', '-d']);
    const health = await waitForHttp(`${BASE}/health`, UP_TIMEOUT_MS);
    const healthJson = JSON.parse(health.text);
    assert(healthJson.status === 'ok', `unexpected /health body: ${health.text}`);
    assert(
      healthJson.service === 'campusar-api',
      `/health did not reach the API: ${health.text}`,
    );
    console.log('PASS  GET /health → API JSON');

    const buildings = await get(`${BASE}/api/campus/buildings`);
    assert(buildings.status === 200, `/api/campus/buildings HTTP ${buildings.status}`);
    assert(
      !buildings.text.includes('<!DOCTYPE') && !buildings.text.includes('<html'),
      '/api/campus/buildings returned SPA HTML — nginx is not proxying /api',
    );
    const list = JSON.parse(buildings.text);
    assert(Array.isArray(list), '/api/campus/buildings is not a JSON array');
    console.log(`PASS  GET /api/campus/buildings → ${list.length} buildings`);

    const sites = await get(`${BASE}/api/sites`);
    assert(sites.status === 200, `/api/sites HTTP ${sites.status}`);
    assert(
      !sites.text.includes('<!DOCTYPE') && !sites.text.includes('<html'),
      '/api/sites returned SPA HTML — nginx is not proxying /api',
    );
    const siteList = JSON.parse(sites.text);
    assert(Array.isArray(siteList) && siteList.length > 0, '/api/sites is empty');
    assert(
      typeof siteList[0].latitude === 'number' && typeof siteList[0].id === 'string',
      '/api/sites missing site metadata',
    );
    console.log(`PASS  GET /api/sites → ${siteList.length} site(s)`);

    const spa = await get(`${BASE}/`);
    assert(spa.status === 200, `GET / HTTP ${spa.status}`);
    assert(
      spa.text.includes('<div id="root"') && spa.text.toLowerCase().includes('<html'),
      'GET / did not look like the SPA',
    );
    console.log('PASS  GET / → SPA');

    const twin = await get(`${BASE}/digital-twin`);
    assert(twin.status === 200, `GET /digital-twin HTTP ${twin.status}`);
    assert(
      twin.text.includes('<div id="root"') && twin.text.toLowerCase().includes('<html'),
      'GET /digital-twin did not look like the SPA — nginx SPA fallback is broken',
    );
    console.log('PASS  GET /digital-twin → SPA');

    const wsStatus = await testWebSocketUpgrade();
    assert(wsStatus === 101, `WebSocket status ${wsStatus}`);
    console.log('PASS  WS /ws → HTTP 101 upgrade');

    console.log('F-002 Docker proxy integration test passed.');
  } finally {
    await cleanup();
  }
}

main().catch((err) => {
  console.error('F-002 Docker proxy integration test FAILED:', err.message);
  cleanup().finally(() => process.exit(1));
});
