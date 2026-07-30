import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../interfaces/http/app';

const app = createApp();
const hasDb = Boolean(process.env.DATABASE_URL);

describe('API integration', () => {
  it('health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it.skipIf(!hasDb)('guest auth and campus search', async () => {
    const guest = await request(app).post('/api/auth/guest').send({ name: 'Tester' });
    expect(guest.status).toBe(201);
    expect(guest.body.tokens.accessToken).toBeTruthy();

    const search = await request(app)
      .get('/api/campus/search')
      .query({ q: 'library' })
      .set('Authorization', `Bearer ${guest.body.tokens.accessToken}`);
    expect(search.status).toBe(200);
    expect(Array.isArray(search.body)).toBe(true);
  });

  it.skipIf(!hasDb)('computes a route between seeded nodes', async () => {
    const res = await request(app).post('/api/navigation/route').send({
      sourceNodeId: 'a1000001-0000-0000-0000-000000000001',
      destinationNodeId: 'a1000001-0000-0000-0000-000000000014',
    });
    expect(res.status).toBe(200);
    expect(res.body.nodeIds[0]).toBe('a1000001-0000-0000-0000-000000000001');
    expect(res.body.totalDistanceM).toBeGreaterThan(0);
    expect(res.body.path.length).toBeGreaterThan(1);
  });
});
