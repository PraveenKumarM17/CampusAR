import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../interfaces/http/app';
import { pool } from '../../infrastructure/db/pool';

const app = createApp();

async function dbReady(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

async function loadPlaces(): Promise<Array<{ id: string; name: string }>> {
  const res = await request(app).get('/api/campus/places');
  expect(res.status).toBe(200);
  return res.body as Array<{ id: string; name: string }>;
}

const canUseDb = await dbReady();

describe('API integration', () => {
  it('health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it.skipIf(!canUseDb)('guest auth and campus search', async () => {
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

  it.skipIf(!canUseDb)('lists named navigable places', async () => {
    const places = await loadPlaces();
    expect(places.length).toBeGreaterThan(1);
    for (const place of places) {
      expect(typeof place.id).toBe('string');
      expect(typeof place.name).toBe('string');
      expect(place.name.trim().length).toBeGreaterThan(0);
    }
  });

  it.skipIf(!canUseDb)('computes a route between campus places', async () => {
    const places = await loadPlaces();
    const sourceNodeId = places[0].id;
    const destinationNodeId = places[1].id;

    const res = await request(app).post('/api/navigation/route').send({
      sourceNodeId,
      destinationNodeId,
      usePrediction: true,
    });
    expect(res.status).toBe(200);
    expect(res.body.nodeIds[0]).toBe(sourceNodeId);
    expect(res.body.totalDistanceM).toBeGreaterThan(0);
    expect(res.body.path.length).toBeGreaterThan(1);
    expect(res.body.predictionUsed).toBe(true);
    expect(res.body.source.id).toBe(sourceNodeId);
    expect(res.body.destination.id).toBe(destinationNodeId);
  });

  it.skipIf(!canUseDb)('recalculate returns the same response shape as route', async () => {
    const places = await loadPlaces();
    const body = {
      sourceNodeId: places[0].id,
      destinationNodeId: places[1].id,
      accessibility: { avoidStairs: true },
      usePrediction: false,
    };
    const route = await request(app).post('/api/navigation/route').send(body);
    const recalc = await request(app).post('/api/navigation/recalculate').send(body);
    expect(route.status).toBe(200);
    expect(recalc.status).toBe(200);
    expect(recalc.body.nodeIds).toEqual(route.body.nodeIds);
    expect(recalc.body.totalDistanceM).toBe(route.body.totalDistanceM);
    expect(recalc.body.predictionUsed).toBe(false);
  });

  it.skipIf(!canUseDb)('rejects invalid source node', async () => {
    const places = await loadPlaces();
    const res = await request(app).post('/api/navigation/route').send({
      sourceNodeId: '00000000-0000-0000-0000-000000000099',
      destinationNodeId: places[0].id,
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INVALID_NODE');
  });

  it.skipIf(!canUseDb)('rejects invalid destination node', async () => {
    const places = await loadPlaces();
    const res = await request(app).post('/api/navigation/route').send({
      sourceNodeId: places[0].id,
      destinationNodeId: '00000000-0000-0000-0000-000000000099',
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INVALID_NODE');
  });

  it.skipIf(!canUseDb)('rejects invalid accessibility payload', async () => {
    const places = await loadPlaces();
    const res = await request(app).post('/api/navigation/route').send({
      sourceNodeId: places[0].id,
      destinationNodeId: places[1].id,
      accessibility: { avoidStairs: 'yes' },
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it.skipIf(!canUseDb)('rejects unnamed admin node as route endpoint', async () => {
    const places = await loadPlaces();
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO nodes (name, latitude, longitude, kind, site_id)
       VALUES (NULL, 12.901, 77.518, 'outdoor', 'c0000001-0000-4000-8000-000000000010')
       RETURNING id`,
    );
    const unnamedId = rows[0].id;
    const res = await request(app).post('/api/navigation/route').send({
      sourceNodeId: unnamedId,
      destinationNodeId: places[0].id,
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INVALID_NODE');
    expect(res.body.details.reason).toBe('unnamed');
    await pool.query(`DELETE FROM nodes WHERE id = $1`, [unnamedId]);
  });

  it.skipIf(!canUseDb)('rejects inactive place for routing', async () => {
    const places = await loadPlaces();
    const inactiveId = places[places.length - 1].id;
    await pool.query(`UPDATE nodes SET active = FALSE WHERE id = $1`, [inactiveId]);
    const res = await request(app).post('/api/navigation/route').send({
      sourceNodeId: places[0].id,
      destinationNodeId: inactiveId,
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INVALID_NODE');
    expect(res.body.details.reason).toBe('inactive');
    await pool.query(`UPDATE nodes SET active = TRUE WHERE id = $1`, [inactiveId]);
  });

  it.skipIf(!canUseDb)('excludes inactive places from place list', async () => {
    const places = await loadPlaces();
    const inactiveId = places[places.length - 1].id;
    await pool.query(`UPDATE nodes SET active = FALSE WHERE id = $1`, [inactiveId]);
    const res = await request(app).get('/api/campus/places');
    expect(res.body.some((p: { id: string }) => p.id === inactiveId)).toBe(false);
    await pool.query(`UPDATE nodes SET active = TRUE WHERE id = $1`, [inactiveId]);
  });

  it.skipIf(!canUseDb)('resolves valid share link endpoints', async () => {
    const places = await loadPlaces();
    const res = await request(app).get('/api/navigation/resolve').query({
      from: places[0].id,
      to: places[1].id,
    });
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.source.id).toBe(places[0].id);
    expect(res.body.destination.id).toBe(places[1].id);
  });

  it.skipIf(!canUseDb)('resolve reports missing share-link destination', async () => {
    const places = await loadPlaces();
    const res = await request(app).get('/api/navigation/resolve').query({
      from: places[0].id,
      to: '00000000-0000-0000-0000-000000000099',
    });
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.errors[0].field).toBe('to');
  });

  it.skipIf(!canUseDb)('handles concurrent route requests safely', async () => {
    const places = await loadPlaces();
    const body = {
      sourceNodeId: places[0].id,
      destinationNodeId: places[1].id,
    };
    const [a, b] = await Promise.all([
      request(app).post('/api/navigation/route').send(body),
      request(app).post('/api/navigation/recalculate').send(body),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.totalDistanceM).toBe(b.body.totalDistanceM);
  });
});
