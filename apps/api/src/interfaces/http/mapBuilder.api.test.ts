import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../interfaces/http/app';
import { pool } from '../../infrastructure/db/pool';

const app = createApp();

const RNSIT_SITE_ID = 'c0000001-0000-4000-8000-000000000010';
const ORG_B = 'bbbbbbbb-0000-4000-8000-000000000199';
const SITE_B = 'bbbbbbbb-0000-4000-8000-000000000198';

const VALID_FOOTPRINT = [
  { latitude: 12.901, longitude: 77.518 },
  { latitude: 12.901, longitude: 77.519 },
  { latitude: 12.902, longitude: 77.519 },
  { latitude: 12.902, longitude: 77.518 },
];

const UPDATED_FOOTPRINT = [
  { latitude: 12.9015, longitude: 77.5185 },
  { latitude: 12.9015, longitude: 77.5195 },
  { latitude: 12.9025, longitude: 77.5195 },
  { latitude: 12.9025, longitude: 77.5185 },
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

async function seedEmptySite() {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, type)
     VALUES ($1, 'Stabilization Hospital', 'stab-hospital', 'hospital')
     ON CONFLICT (id) DO NOTHING`,
    [ORG_B],
  );
  await pool.query(
    `INSERT INTO sites (id, organization_id, name, slug, latitude, longitude, timezone, status)
     VALUES ($1, $2, 'Main Campus', 'main-stab', 13.01, 77.55, 'Asia/Kolkata', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [SITE_B, ORG_B],
  );
}

async function cleanupSite() {
  await pool.query(`DELETE FROM edges WHERE site_id = $1`, [SITE_B]);
  await pool.query(`DELETE FROM nodes WHERE site_id = $1`, [SITE_B]);
  await pool.query(`DELETE FROM site_areas WHERE site_id = $1`, [SITE_B]);
  await pool.query(`DELETE FROM buildings WHERE site_id = $1`, [SITE_B]);
  await pool.query(`DELETE FROM sites WHERE id = $1`, [SITE_B]);
  await pool.query(`DELETE FROM organizations WHERE id = $1`, [ORG_B]);
}

describe('map builder stabilization', () => {
  beforeAll(async () => {
    if (canUseDb) await seedEmptySite();
  });

  afterAll(async () => {
    if (canUseDb) await cleanupSite();
  });

  it.skipIf(!canUseDb)('creates point building, adds footprint with server centroid, edits with concurrency', async () => {
    const token = await loginAdmin();

    const created = await request(app)
      .post('/api/admin/buildings')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Site-Id', SITE_B)
      .send({
        name: 'Emergency Wing',
        code: 'EMRG',
        description: null,
        latitude: 13.01,
        longitude: 77.55,
        floorsCount: 3,
      });
    expect(created.status).toBe(201);
    const buildingId = created.body.id as string;
    expect(created.body.footprint).toBeUndefined();

    const withFootprint = await request(app)
      .put(`/api/admin/buildings/${buildingId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Site-Id', SITE_B)
      .send({ footprint: VALID_FOOTPRINT, expectedUpdatedAt: created.body.updatedAt });
    expect(withFootprint.status).toBe(200);
    expect(withFootprint.body.footprint?.length).toBeGreaterThanOrEqual(3);
    expect(withFootprint.body.latitude).not.toBe(13.01);
    const firstUpdatedAt = withFootprint.body.updatedAt as string;

    const reload = await request(app)
      .get('/api/admin/map-builder/snapshot')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Site-Id', SITE_B);
    expect(reload.status).toBe(200);
    const reloaded = (reload.body.buildings as Array<{ id: string }>).find((b) => b.id === buildingId);
    expect(reloaded).toBeTruthy();

    const edited = await request(app)
      .put(`/api/admin/buildings/${buildingId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Site-Id', SITE_B)
      .send({ footprint: UPDATED_FOOTPRINT, expectedUpdatedAt: firstUpdatedAt });
    expect(edited.status).toBe(200);
    expect(edited.body.id).toBe(buildingId);

    const stale = await request(app)
      .put(`/api/admin/buildings/${buildingId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Site-Id', SITE_B)
      .send({ footprint: VALID_FOOTPRINT, expectedUpdatedAt: firstUpdatedAt });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('STALE_EDIT');

    const invalid = await request(app)
      .put(`/api/admin/buildings/${buildingId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Site-Id', SITE_B)
      .send({
        footprint: [
          { latitude: 13, longitude: 77 },
          { latitude: 13.000001, longitude: 77 },
          { latitude: 13.000002, longitude: 77.000001 },
        ],
      });
    expect(invalid.status).toBe(422);
    expect(invalid.body.code).toBe('INVALID_GEOMETRY');
  });

  it.skipIf(!canUseDb)('rejects independent lat/lon edits when footprint exists', async () => {
    const token = await loginAdmin();
    const created = await request(app)
      .post('/api/admin/buildings')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Site-Id', SITE_B)
      .send({
        name: 'Clinic',
        code: 'CLIN',
        description: null,
        latitude: 13.011,
        longitude: 77.551,
        floorsCount: 2,
        footprint: VALID_FOOTPRINT,
      });
    expect(created.status).toBe(201);
    const res = await request(app)
      .put(`/api/admin/buildings/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Site-Id', SITE_B)
      .send({ latitude: 14, longitude: 78 });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('FOOTPRINT_IS_AUTHORITATIVE');
  });

  it.skipIf(!canUseDb)('moves node and recalculates edge distance', async () => {
    const token = await loginAdmin();
    const n1 = await request(app)
      .post('/api/admin/paths/nodes')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Site-Id', SITE_B)
      .send({ latitude: 13.01, longitude: 77.55, kind: 'outdoor', name: 'A' });
    const n2 = await request(app)
      .post('/api/admin/paths/nodes')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Site-Id', SITE_B)
      .send({ latitude: 13.011, longitude: 77.551, kind: 'outdoor', name: 'B' });
    expect(n1.status).toBe(201);
    expect(n2.status).toBe(201);

    const edge = await request(app)
      .post('/api/admin/paths/edges')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Site-Id', SITE_B)
      .send({
        fromNodeId: n1.body.id,
        toNodeId: n2.body.id,
        distanceM: 100,
        kind: 'walkway',
        bidirectional: true,
        blocked: false,
        safetyScore: 0.9,
        crowdScore: 0.2,
        accessibilityScore: 0.9,
      });
    expect(edge.status).toBe(201);
    const before = edge.body.distanceM as number;

    await request(app)
      .put(`/api/admin/paths/nodes/${n2.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Site-Id', SITE_B)
      .send({ latitude: 13.02, longitude: 77.56 });

    const edges = await request(app)
      .get('/api/admin/paths/edges')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Site-Id', SITE_B);
    const updated = (edges.body as Array<{ id: string; distanceM: number }>).find((e) => e.id === edge.body.id);
    expect(updated).toBeTruthy();
    expect(updated!.distanceM).not.toBe(before);
  });

  it.skipIf(!canUseDb)('validates empty site and graph warnings', async () => {
    const token = await loginAdmin();
    const res = await request(app)
      .get('/api/admin/map-builder/validate')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Site-Id', SITE_B);
    expect(res.status).toBe(200);
    expect(res.body.warningCount).toBeGreaterThanOrEqual(0);
  });

  it.skipIf(!canUseDb)('rejects cross-site building update', async () => {
    const token = await loginAdmin();
    const rnsit = await request(app)
      .get('/api/campus/buildings')
      .set('X-Site-Id', RNSIT_SITE_ID);
    const buildingId = rnsit.body[0].id as string;
    const res = await request(app)
      .put(`/api/admin/buildings/${buildingId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Site-Id', SITE_B)
      .send({ name: 'Hijack' });
    expect(res.status).toBe(422);
  });
});
