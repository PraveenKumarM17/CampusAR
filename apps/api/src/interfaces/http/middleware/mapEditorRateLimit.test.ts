import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { errorHandler } from './errorHandler';
import {
  __mapEditorRateLimitTest,
  mapEditorHeavyRateLimit,
  mapEditorRateLimit,
  mapEditorWriteRateLimit,
} from './mapEditorRateLimit';
import type { AuthedRequest } from './auth';

function buildApp() {
  const app = express();
  app.use((req, _res, next) => {
    (req as AuthedRequest).user = {
      sub: 'user-rate-limit-test',
      role: 'admin',
      name: 'Rate Limit Tester',
      email: 'rl@test.local',
    };
    next();
  });
  app.use(mapEditorRateLimit);
  app.use(mapEditorWriteRateLimit);
  app.get('/snapshot', (_req, res) => res.json({ ok: true }));
  app.post('/nodes', (_req, res) => res.status(201).json({ ok: true }));
  app.post('/publish', mapEditorHeavyRateLimit, (_req, res) => res.json({ published: true }));
  app.use(errorHandler);
  return app;
}

describe('mapEditorRateLimit', () => {
  const prevForce = process.env.MAP_EDITOR_RATE_LIMIT_FORCE;

  beforeEach(() => {
    process.env.MAP_EDITOR_RATE_LIMIT_FORCE = 'true';
    __mapEditorRateLimitTest.resetBuckets();
  });

  afterEach(() => {
    if (prevForce === undefined) delete process.env.MAP_EDITOR_RATE_LIMIT_FORCE;
    else process.env.MAP_EDITOR_RATE_LIMIT_FORCE = prevForce;
    __mapEditorRateLimitTest.resetBuckets();
  });

  it('allows requests under the write limit and returns RateLimit headers', async () => {
    const app = buildApp();
    const res = await request(app).post('/nodes');
    expect(res.status).toBe(201);
    expect(res.headers['ratelimit-limit']).toBeDefined();
    expect(res.headers['ratelimit-remaining']).toBeDefined();
  });

  it('returns 429 RATE_LIMITED when the write limit is exceeded', async () => {
    const app = buildApp();
    const max = __mapEditorRateLimitTest.writeMax;

    for (let i = 0; i < max; i += 1) {
      const ok = await request(app).post('/nodes');
      expect(ok.status).toBe(201);
    }

    const blocked = await request(app).post('/nodes');
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('RATE_LIMITED');
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('does not apply the write limiter to GET requests', async () => {
    const app = buildApp();
    const max = __mapEditorRateLimitTest.writeMax;

    for (let i = 0; i < max + 5; i += 1) {
      const res = await request(app).get('/snapshot');
      expect(res.status).toBe(200);
    }
  });

  it('applies a stricter heavy limit on publish', async () => {
    const app = buildApp();
    const max = __mapEditorRateLimitTest.heavyMax;

    for (let i = 0; i < max; i += 1) {
      const ok = await request(app).post('/publish');
      expect(ok.status).toBe(200);
    }

    const blocked = await request(app).post('/publish');
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('RATE_LIMITED');
  });
});
