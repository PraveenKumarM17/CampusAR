import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../interfaces/http/app';
import { pool } from '../../infrastructure/db/pool';

const app = createApp();

const ORG_G = 'dddddddd-0000-4000-8000-000000000299';
const SITE_G = 'dddddddd-0000-4000-8000-000000000298';
const SITE_OTHER = 'dddddddd-0000-4000-8000-000000000297';

async function dbReady(): Promise<boolean> {
  try {
    await pool.query('SELECT 1 FROM buildings LIMIT 1');
    return true;
  } catch {
    return false;
  }
}

const canUseDb = await dbReady();

async function loginAdmin(): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({
    email: 'admin@smartcampus.edu',
    password: 'admin123',
  });
  expect(res.status).toBe(200);
  return res.body.tokens.accessToken as string;
}

async function seedSites() {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, type)
     VALUES ($1, 'Graph Hospital', 'graph-hospital', 'hospital')
     ON CONFLICT (id) DO NOTHING`,
    [ORG_G],
  );
  await pool.query(
    `INSERT INTO sites (id, organization_id, name, slug, latitude, longitude, timezone, status)
     VALUES ($1, $2, 'Graph Site', 'graph-site', 13.01, 77.55, 'Asia/Kolkata', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [SITE_G, ORG_G],
  );
  await pool.query(
    `INSERT INTO sites (id, organization_id, name, slug, latitude, longitude, timezone, status)
     VALUES ($1, $2, 'Other Site', 'other-site', 13.02, 77.56, 'Asia/Kolkata', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [SITE_OTHER, ORG_G],
  );
}

async function cleanup() {
  await pool.query(
    `DELETE FROM indoor_handoffs WHERE building_id IN (SELECT id FROM buildings WHERE site_id = ANY($1::uuid[]))`,
    [[SITE_G, SITE_OTHER]],
  );
  await pool.query(
    `DELETE FROM indoor_places WHERE building_id IN (SELECT id FROM buildings WHERE site_id = ANY($1::uuid[]))`,
    [[SITE_G, SITE_OTHER]],
  );
  await pool.query(
    `DELETE FROM indoor_edges WHERE building_id IN (SELECT id FROM buildings WHERE site_id = ANY($1::uuid[]))`,
    [[SITE_G, SITE_OTHER]],
  );
  await pool.query(
    `DELETE FROM indoor_nodes WHERE building_id IN (SELECT id FROM buildings WHERE site_id = ANY($1::uuid[]))`,
    [[SITE_G, SITE_OTHER]],
  );
  await pool.query(
    `DELETE FROM indoor_maps WHERE building_id IN (SELECT id FROM buildings WHERE site_id = ANY($1::uuid[]))`,
    [[SITE_G, SITE_OTHER]],
  );
  await pool.query(`DELETE FROM floor_pois WHERE building_id IN (SELECT id FROM buildings WHERE site_id = ANY($1::uuid[]))`, [
    [SITE_G, SITE_OTHER],
  ]);
  await pool.query(`DELETE FROM floor_corridors WHERE building_id IN (SELECT id FROM buildings WHERE site_id = ANY($1::uuid[]))`, [
    [SITE_G, SITE_OTHER],
  ]);
  await pool.query(`DELETE FROM rooms WHERE building_id IN (SELECT id FROM buildings WHERE site_id = ANY($1::uuid[]))`, [
    [SITE_G, SITE_OTHER],
  ]);
  await pool.query(`DELETE FROM floors WHERE building_id IN (SELECT id FROM buildings WHERE site_id = ANY($1::uuid[]))`, [
    [SITE_G, SITE_OTHER],
  ]);
  await pool.query(`DELETE FROM nodes WHERE site_id = ANY($1::uuid[])`, [[SITE_G, SITE_OTHER]]);
  await pool.query(`DELETE FROM buildings WHERE site_id = ANY($1::uuid[])`, [[SITE_G, SITE_OTHER]]);
  await pool.query(`DELETE FROM sites WHERE id = ANY($1::uuid[])`, [[SITE_G, SITE_OTHER]]);
  await pool.query(`DELETE FROM organizations WHERE id = $1`, [ORG_G]);
}

describe('indoor graph map builder', () => {
  beforeAll(async () => {
    if (canUseDb) await seedSites();
  });

  afterAll(async () => {
    if (canUseDb) await cleanup();
  });

  it.skipIf(!canUseDb)('creates graph, links room, routes through connector', async () => {
    const token = await loginAdmin();
    const headers = { Authorization: `Bearer ${token}`, 'X-Site-Id': SITE_G };

    const buildingRes = await request(app)
      .post('/api/admin/buildings')
      .set(headers)
      .send({
        name: 'Tower',
        code: 'TWR',
        description: null,
        latitude: 13.01,
        longitude: 77.55,
        floorsCount: 2,
      });
    expect(buildingRes.status).toBe(201);
    const buildingId = buildingRes.body.id as string;

    const floor0 = await request(app)
      .post('/api/admin/map-builder/indoor/floors')
      .set(headers)
      .send({ buildingId, level: 0, name: 'Ground' });
    expect(floor0.status).toBe(201);

    const floor1 = await request(app)
      .post('/api/admin/map-builder/indoor/floors')
      .set(headers)
      .send({ buildingId, level: 1, name: 'Level 1' });
    expect(floor1.status).toBe(201);

    const room = await request(app)
      .post('/api/admin/map-builder/indoor/rooms')
      .set(headers)
      .send({
        buildingId,
        floorId: floor1.body.id,
        name: 'ICU',
        code: 'ICU-1',
        category: 'ward',
        localGeometry: [
          { x: 2, y: 2 },
          { x: 6, y: 2 },
          { x: 6, y: 5 },
          { x: 2, y: 5 },
        ],
      });
    expect(room.status).toBe(201);

    const mapRes = await request(app)
      .post('/api/admin/map-builder/indoor/graph/ensure-map')
      .set(headers)
      .send({ buildingId });
    expect(mapRes.status).toBe(201);
    const mapId = mapRes.body.id as string;

    const n1 = await request(app)
      .post('/api/admin/map-builder/indoor/graph/nodes')
      .set(headers)
      .send({ buildingId, floorId: floor0.body.id, planX: 1, planY: 1, mapId, kind: 'corridor' });
    expect(n1.status).toBe(201);

    const n2 = await request(app)
      .post('/api/admin/map-builder/indoor/graph/nodes')
      .set(headers)
      .send({ buildingId, floorId: floor0.body.id, planX: 5, planY: 1, mapId, kind: 'elevator' });
    expect(n2.status).toBe(201);

    const n3 = await request(app)
      .post('/api/admin/map-builder/indoor/graph/nodes')
      .set(headers)
      .send({ buildingId, floorId: floor1.body.id, planX: 5, planY: 1, mapId, kind: 'elevator' });
    expect(n3.status).toBe(201);

    const edgeWalk = await request(app)
      .post('/api/admin/map-builder/indoor/graph/edges')
      .set(headers)
      .send({ buildingId, mapId, fromNodeId: n1.body.id, toNodeId: n2.body.id });
    expect(edgeWalk.status).toBe(201);

    const edgeLift = await request(app)
      .post('/api/admin/map-builder/indoor/graph/edges')
      .set(headers)
      .send({
        buildingId,
        mapId,
        fromNodeId: n2.body.id,
        toNodeId: n3.body.id,
        kind: 'elevator',
      });
    expect(edgeLift.status).toBe(201);

    const dup = await request(app)
      .post('/api/admin/map-builder/indoor/graph/edges')
      .set(headers)
      .send({ buildingId, mapId, fromNodeId: n1.body.id, toNodeId: n2.body.id });
    expect(dup.status).toBe(409);

    const link = await request(app)
      .post('/api/admin/map-builder/indoor/graph/rooms/link')
      .set(headers)
      .send({ buildingId, mapId, roomId: room.body.id, createEntrance: true });
    expect(link.status).toBe(201);
    expect(link.body.category).toBe('room');

    await request(app).put(`/api/indoor/maps/${mapId}`).set(headers).send({ status: 'published' });

    const search = await request(app)
      .get(`/api/indoor/places/search?q=ICU&buildingId=${buildingId}`);
    expect(search.status).toBe(200);
    expect(search.body.some((p: { name: string }) => p.name === 'ICU')).toBe(true);

    const move = await request(app)
      .put(`/api/admin/map-builder/indoor/graph/nodes/${n1.body.id}`)
      .set(headers)
      .send({ planX: 1.5, planY: 1.5 });
    expect(move.status).toBe(200);

    const validate = await request(app)
      .get(`/api/admin/map-builder/indoor/validate?buildingId=${buildingId}`)
      .set(headers);
    expect(validate.status).toBe(200);

    const snapshot = await request(app)
      .get(`/api/admin/map-builder/indoor/graph/snapshot?buildingId=${buildingId}`)
      .set(headers);
    expect(snapshot.status).toBe(200);
    expect(snapshot.body.nodes.length).toBeGreaterThanOrEqual(3);
    expect(snapshot.body.roomLinks[room.body.id]).toBeTruthy();
  });

  it.skipIf(!canUseDb)('rejects cross-site graph edge via foreign building', async () => {
    const token = await loginAdmin();
    const headersA = { Authorization: `Bearer ${token}`, 'X-Site-Id': SITE_G };
    const headersB = { Authorization: `Bearer ${token}`, 'X-Site-Id': SITE_OTHER };

    const bA = await request(app)
      .post('/api/admin/buildings')
      .set(headersA)
      .send({
        name: 'A',
        code: 'A1',
        description: null,
        latitude: 13.01,
        longitude: 77.55,
        floorsCount: 1,
      });
    const bB = await request(app)
      .post('/api/admin/buildings')
      .set(headersB)
      .send({
        name: 'B',
        code: 'B1',
        description: null,
        latitude: 13.02,
        longitude: 77.56,
        floorsCount: 1,
      });

    const fA = await request(app)
      .post('/api/admin/map-builder/indoor/floors')
      .set(headersA)
      .send({ buildingId: bA.body.id, level: 0, name: 'G' });
    const fB = await request(app)
      .post('/api/admin/map-builder/indoor/floors')
      .set(headersB)
      .send({ buildingId: bB.body.id, level: 0, name: 'G' });

    const mapA = await request(app)
      .post('/api/admin/map-builder/indoor/graph/ensure-map')
      .set(headersA)
      .send({ buildingId: bA.body.id });

    const nA = await request(app)
      .post('/api/admin/map-builder/indoor/graph/nodes')
      .set(headersA)
      .send({ buildingId: bA.body.id, floorId: fA.body.id, planX: 1, planY: 1, mapId: mapA.body.id });

    const mapB = await request(app)
      .post('/api/admin/map-builder/indoor/graph/ensure-map')
      .set(headersB)
      .send({ buildingId: bB.body.id });

    const nB = await request(app)
      .post('/api/admin/map-builder/indoor/graph/nodes')
      .set(headersB)
      .send({ buildingId: bB.body.id, floorId: fB.body.id, planX: 2, planY: 2, mapId: mapB.body.id });

    const cross = await request(app)
      .post('/api/admin/map-builder/indoor/graph/edges')
      .set(headersA)
      .send({
        buildingId: bA.body.id,
        mapId: mapA.body.id,
        fromNodeId: nA.body.id,
        toNodeId: nB.body.id,
      });
    expect(cross.status).toBe(422);
    expect(cross.body.code).toBe('CROSS_SITE_REFERENCE');
  });
});
