import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../interfaces/http/app';
import { pool } from '../../infrastructure/db/pool';

const app = createApp();

const RNSIT_SITE_ID = 'c0000001-0000-4000-8000-000000000010';
const ADMIN_BUILDING_ID = 'b1000001-0000-0000-0000-000000000001';
const ORG_B = 'aaaaaaaa-0000-4000-8000-000000000099';
const SITE_B = 'aaaaaaaa-0000-4000-8000-000000000098';
const BUILDING_B = 'aaaaaaaa-0000-4000-8000-000000000097';
const NODE_B1 = 'aaaaaaaa-0000-4000-8000-000000000096';
const NODE_B2 = 'aaaaaaaa-0000-4000-8000-000000000095';

async function dbReady(): Promise<boolean> {
  try {
    await pool.query('SELECT 1 FROM sites LIMIT 1');
    return true;
  } catch {
    return false;
  }
}

const canUseDb = await dbReady();

async function seedOtherSite() {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, type)
     VALUES ($1, 'City Hospital', 'city-hospital-test', 'hospital')
     ON CONFLICT (id) DO NOTHING`,
    [ORG_B],
  );
  await pool.query(
    `INSERT INTO sites (id, organization_id, name, slug, latitude, longitude, timezone, status)
     VALUES ($1, $2, 'Hospital Main', 'hospital-main-test', 13.0, 77.6, 'Asia/Kolkata', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [SITE_B, ORG_B],
  );
  await pool.query(
    `INSERT INTO site_map_versions (site_id, version_number, status, label, published_at, created_at, updated_at)
     SELECT $1, 1, 'published', 'Initial published map', NOW(), NOW(), NOW()
     WHERE NOT EXISTS (SELECT 1 FROM site_map_versions WHERE site_id = $1 AND status = 'published')`,
    [SITE_B],
  );
  await pool.query(
    `UPDATE sites s SET published_map_version_id = v.id
     FROM site_map_versions v
     WHERE v.site_id = s.id AND v.status = 'published' AND s.id = $1 AND s.published_map_version_id IS NULL`,
    [SITE_B],
  );
  const { rows: versionRows } = await pool.query<{ id: string }>(
    `SELECT id FROM site_map_versions WHERE site_id = $1 AND status = 'published' LIMIT 1`,
    [SITE_B],
  );
  const versionId = versionRows[0]?.id;
  if (!versionId) throw new Error('missing published version for test site');

  await pool.query(
    `INSERT INTO buildings (id, site_id, name, code, description, latitude, longitude, floors_count, map_version_id)
     VALUES ($1, $2, 'Hospital Tower', 'HOSP', 'Isolation test building', 13.001, 77.601, 4, $3)
     ON CONFLICT (id) DO UPDATE SET site_id = EXCLUDED.site_id, map_version_id = EXCLUDED.map_version_id`,
    [BUILDING_B, SITE_B, versionId],
  );
  await pool.query(
    `INSERT INTO nodes (id, site_id, name, latitude, longitude, kind, active, map_version_id)
     VALUES
       ($1, $3, 'Hospital Gate', 13.001, 77.601, 'outdoor', TRUE, $4),
       ($2, $3, 'Hospital Lobby', 13.002, 77.602, 'outdoor', TRUE, $4)
     ON CONFLICT (id) DO UPDATE SET site_id = EXCLUDED.site_id, map_version_id = EXCLUDED.map_version_id`,
    [NODE_B1, NODE_B2, SITE_B, versionId],
  );
}

async function cleanupOtherSite() {
  await pool.query(`DELETE FROM nodes WHERE id IN ($1, $2)`, [NODE_B1, NODE_B2]);
  await pool.query(`DELETE FROM buildings WHERE id = $1`, [BUILDING_B]);
  await pool.query(`DELETE FROM site_map_versions WHERE site_id = $1`, [SITE_B]);
  await pool.query(`UPDATE sites SET published_map_version_id = NULL WHERE id = $1`, [SITE_B]);
  await pool.query(`DELETE FROM sites WHERE id = $1`, [SITE_B]);
  await pool.query(`DELETE FROM organizations WHERE id = $1`, [ORG_B]);
}

describe('site isolation', () => {
  afterAll(async () => {
    if (canUseDb) await cleanupOtherSite();
  });

  it.skipIf(!canUseDb)('lists the seeded RNSIT site with preserved building UUIDs', async () => {
    const sites = await request(app).get('/api/sites');
    expect(sites.status).toBe(200);
    const list = sites.body as Array<{ id: string; slug: string }>;
    expect(list.some((s) => s.id === RNSIT_SITE_ID && s.slug === 'rnsit-main')).toBe(true);

    const buildings = await request(app)
      .get('/api/campus/buildings')
      .set('X-Site-Id', RNSIT_SITE_ID);
    expect(buildings.status).toBe(200);
    const rows = buildings.body as Array<{ id: string; siteId?: string }>;
    expect(rows.some((b) => b.id === ADMIN_BUILDING_ID)).toBe(true);
    expect(rows.every((b) => b.siteId === RNSIT_SITE_ID)).toBe(true);
  });

  it.skipIf(!canUseDb)('does not return site A buildings when requesting site B', async () => {
    await seedOtherSite();
    const res = await request(app).get('/api/campus/buildings').set('X-Site-Id', SITE_B);
    expect(res.status).toBe(200);
    const rows = res.body as Array<{ id: string }>;
    expect(rows.map((b) => b.id)).toContain(BUILDING_B);
    expect(rows.map((b) => b.id)).not.toContain(ADMIN_BUILDING_ID);
  });

  it.skipIf(!canUseDb)('rejects routing that mixes two sites', async () => {
    await seedOtherSite();
    const places = await request(app).get('/api/campus/places').set('X-Site-Id', RNSIT_SITE_ID);
    expect(places.status).toBe(200);
    const source = (places.body as Array<{ id: string }>)[0]?.id;
    expect(source).toBeTruthy();

    const mixed = await request(app)
      .post('/api/navigation/route')
      .set('X-Site-Id', RNSIT_SITE_ID)
      .send({ sourceNodeId: source, destinationNodeId: NODE_B1 });
    expect(mixed.status).toBe(422);
    expect(mixed.body.code).toBe('CROSS_SITE_ROUTE');
  });

  it.skipIf(!canUseDb)('rejects a cross-site edge', async () => {
    await seedOtherSite();
    const login = await request(app).post('/api/auth/login').send({
      email: 'admin@smartcampus.edu',
      password: 'admin123',
    });
    expect(login.status).toBe(200);
    const token = login.body.tokens.accessToken as string;

    const places = await request(app).get('/api/campus/places').set('X-Site-Id', RNSIT_SITE_ID);
    const fromId = (places.body as Array<{ id: string }>)[0]?.id;

    const res = await request(app)
      .post('/api/admin/paths/edges')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Site-Id', RNSIT_SITE_ID)
      .send({
        fromNodeId: fromId,
        toNodeId: NODE_B1,
        distanceM: 40,
        kind: 'walkway',
        bidirectional: true,
        blocked: false,
        safetyScore: 0.9,
        crowdScore: 0.1,
        accessibilityScore: 0.9,
      });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('CROSS_SITE_EDGE');
  });
});
