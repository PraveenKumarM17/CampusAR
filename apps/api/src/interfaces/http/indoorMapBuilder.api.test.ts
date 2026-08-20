import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../interfaces/http/app';
import { pool } from '../../infrastructure/db/pool';

const app = createApp();

const ORG_C = 'cccccccc-0000-4000-8000-000000000199';
const SITE_C = 'cccccccc-0000-4000-8000-000000000198';

const ROOM_RECT = [
  { x: 2, y: 2 },
  { x: 6, y: 2 },
  { x: 6, y: 5 },
  { x: 2, y: 5 },
];

const CORRIDOR_RECT = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 2 },
  { x: 0, y: 2 },
];

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

async function seedSite() {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, type)
     VALUES ($1, 'Indoor Hospital', 'indoor-hospital', 'hospital')
     ON CONFLICT (id) DO NOTHING`,
    [ORG_C],
  );
  await pool.query(
    `INSERT INTO sites (id, organization_id, name, slug, latitude, longitude, timezone, status)
     VALUES ($1, $2, 'Main', 'main-indoor', 13.01, 77.55, 'Asia/Kolkata', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [SITE_C, ORG_C],
  );
}

async function cleanup() {
  await pool.query(`DELETE FROM floor_pois WHERE building_id IN (SELECT id FROM buildings WHERE site_id = $1)`, [SITE_C]);
  await pool.query(`DELETE FROM floor_corridors WHERE building_id IN (SELECT id FROM buildings WHERE site_id = $1)`, [SITE_C]);
  await pool.query(`DELETE FROM rooms WHERE building_id IN (SELECT id FROM buildings WHERE site_id = $1)`, [SITE_C]);
  await pool.query(`DELETE FROM floors WHERE building_id IN (SELECT id FROM buildings WHERE site_id = $1)`, [SITE_C]);
  await pool.query(`DELETE FROM buildings WHERE site_id = $1`, [SITE_C]);
  await pool.query(`DELETE FROM sites WHERE id = $1`, [SITE_C]);
  await pool.query(`DELETE FROM organizations WHERE id = $1`, [ORG_C]);
}

describe('indoor map builder', () => {
  beforeAll(async () => {
    if (canUseDb) await seedSite();
  });

  afterAll(async () => {
    if (canUseDb) await cleanup();
  });

  it.skipIf(!canUseDb)('creates floor, corridor, rooms, poi, validates and reloads layout', async () => {
    const token = await loginAdmin();
    const auth = { Authorization: `Bearer ${token}`, 'X-Site-Id': SITE_C };

    const building = await request(app)
      .post('/api/admin/buildings')
      .set(auth)
      .send({
        name: 'Main Wing',
        code: 'MAIN',
        description: null,
        latitude: 13.01,
        longitude: 77.55,
        floorsCount: 1,
      });
    expect(building.status).toBe(201);
    const buildingId = building.body.id as string;

    const dup = await request(app)
      .post('/api/admin/map-builder/indoor/floors')
      .set(auth)
      .send({ buildingId, level: 0, name: 'Ground Floor' });
    expect(dup.status).toBe(201);
    const floorId = dup.body.id as string;

    const dupLevel = await request(app)
      .post('/api/admin/map-builder/indoor/floors')
      .set(auth)
      .send({ buildingId, level: 0, name: 'Duplicate' });
    expect(dupLevel.status).toBe(422);

    const corridor = await request(app)
      .post('/api/admin/map-builder/indoor/corridors')
      .set(auth)
      .send({ buildingId, floorId, name: 'Main hall', localGeometry: CORRIDOR_RECT });
    expect(corridor.status).toBe(201);

    const roomA = await request(app)
      .post('/api/admin/map-builder/indoor/rooms')
      .set(auth)
      .send({
        buildingId,
        floorId,
        name: 'Room A',
        code: 'A-101',
        category: 'office',
        localGeometry: ROOM_RECT,
      });
    expect(roomA.status).toBe(201);

    const poi = await request(app)
      .post('/api/admin/map-builder/indoor/pois')
      .set(auth)
      .send({
        buildingId,
        floorId,
        name: 'Reception',
        category: 'reception',
        localX: 1,
        localY: 1,
      });
    expect(poi.status).toBe(201);

    const invalid = await request(app)
      .post('/api/admin/map-builder/indoor/rooms')
      .set(auth)
      .send({
        buildingId,
        floorId,
        name: 'Tiny',
        code: 'TINY',
        category: 'other',
        localGeometry: [
          { x: 0, y: 0 },
          { x: 0.01, y: 0 },
          { x: 0.01, y: 0.01 },
        ],
      });
    expect(invalid.status).toBe(422);

    const snapshot = await request(app)
      .get(`/api/admin/map-builder/indoor/snapshot?buildingId=${buildingId}`)
      .set(auth);
    expect(snapshot.status).toBe(200);
    expect(snapshot.body.rooms.length).toBeGreaterThanOrEqual(1);

    const validate = await request(app)
      .get(`/api/admin/map-builder/indoor/validate?buildingId=${buildingId}`)
      .set(auth);
    expect(validate.status).toBe(200);

    const layout = await request(app)
      .get(`/api/campus/buildings/${buildingId}/indoor-layout?floorId=${floorId}`)
      .set('X-Site-Id', SITE_C);
    expect(layout.status).toBe(200);
    expect(layout.body.rooms.length).toBe(1);

    const updated = await request(app)
      .put(`/api/admin/map-builder/indoor/rooms/${roomA.body.id}`)
      .set(auth)
      .send({
        localGeometry: [
          { x: 3, y: 2 },
          { x: 7, y: 2 },
          { x: 7, y: 5 },
          { x: 3, y: 5 },
        ],
        expectedUpdatedAt: roomA.body.updatedAt,
      });
    expect(updated.status).toBe(200);

    const stale = await request(app)
      .put(`/api/admin/map-builder/indoor/rooms/${roomA.body.id}`)
      .set(auth)
      .send({
        localGeometry: ROOM_RECT,
        expectedUpdatedAt: roomA.body.updatedAt,
      });
    expect(stale.status).toBe(409);

    const delFloor = await request(app).delete(`/api/admin/map-builder/indoor/floors/${floorId}`).set(auth);
    expect(delFloor.status).toBe(409);
  });
});
