import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../interfaces/http/app';
import { pool } from '../../infrastructure/db/pool';
import { mapVersionService } from '../../application/mapVersionService';

const app = createApp();

const ORG_V = 'eeeeeeee-0000-4000-8000-000000000199';
const SITE_V = 'eeeeeeee-0000-4000-8000-000000000198';
const SITE_OTHER = 'eeeeeeee-0000-4000-8000-000000000197';
const RNSIT_SITE = 'c0000001-0000-4000-8000-000000000010';
const RNSIT_BUILDING = 'b1000001-0000-0000-0000-000000000001';

async function dbReady(): Promise<boolean> {
  try {
    await pool.query('SELECT 1 FROM site_map_versions LIMIT 1');
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
     VALUES ($1, 'Version Org', 'version-org', 'corporate')
     ON CONFLICT (id) DO NOTHING`,
    [ORG_V],
  );
  await pool.query(
    `INSERT INTO sites (id, organization_id, name, slug, latitude, longitude, timezone, status)
     VALUES ($1, $2, 'Version Site', 'version-site', 13.01, 77.55, 'Asia/Kolkata', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [SITE_V, ORG_V],
  );
  await pool.query(
    `INSERT INTO sites (id, organization_id, name, slug, latitude, longitude, timezone, status)
     VALUES ($1, $2, 'Other Site', 'other-version-site', 13.02, 77.56, 'Asia/Kolkata', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [SITE_OTHER, ORG_V],
  );
}

async function cleanup() {
  await pool.query(`DELETE FROM site_map_versions WHERE site_id IN ($1, $2)`, [SITE_V, SITE_OTHER]);
  await pool.query(
    `UPDATE sites SET published_map_version_id = NULL WHERE id IN ($1, $2)`,
    [SITE_V, SITE_OTHER],
  );
  await pool.query(`DELETE FROM sites WHERE id IN ($1, $2)`, [SITE_V, SITE_OTHER]);
  await pool.query(`DELETE FROM organizations WHERE id = $1`, [ORG_V]);
}

describe('site map versioning foundation', () => {
  beforeAll(async () => {
    if (canUseDb) await seedSites();
  });

  afterAll(async () => {
    if (canUseDb) await cleanup();
  });

  it.skipIf(!canUseDb)('backfills exactly one published version for RNSIT site', async () => {
    const published = await mapVersionService.getPublishedVersion(RNSIT_SITE);
    expect(published.status).toBe('published');
    expect(published.versionNumber).toBe(1);

    const { rows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM site_map_versions
       WHERE site_id = $1 AND status = 'published'`,
      [RNSIT_SITE],
    );
    expect(Number(rows[0]?.count)).toBe(1);

    const { rows: siteRows } = await pool.query<{ ptr: string }>(
      `SELECT published_map_version_id AS ptr FROM sites WHERE id = $1`,
      [RNSIT_SITE],
    );
    expect(siteRows[0]?.ptr).toBe(published.id);
  });

  it.skipIf(!canUseDb)('preserves RNSIT building UUIDs after versioning migration', async () => {
    const { rows } = await pool.query(`SELECT id FROM buildings WHERE id = $1`, [RNSIT_BUILDING]);
    expect(rows.length).toBe(1);
  });

  it.skipIf(!canUseDb)('creates draft idempotently and increments version numbers', async () => {
    const token = await loginAdmin();
    const headers = { Authorization: `Bearer ${token}`, 'X-Site-Id': SITE_V };

    await mapVersionService.getPublishedVersion(SITE_V);

    const first = await request(app).post('/api/admin/map-builder/draft').set(headers);
    expect(first.status).toBe(201);
    expect(first.body.status).toBe('draft');
    expect(first.body.basedOnVersionId).toBeTruthy();
    expect(first.body.versionNumber).toBeGreaterThan(1);

    const second = await request(app).post('/api/admin/map-builder/draft').set(headers);
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);

    const list = await request(app).get('/api/admin/map-builder/versions').set(headers);
    expect(list.status).toBe(200);
    expect(list.body.some((v: { status: string }) => v.status === 'published')).toBe(true);
    expect(list.body.filter((v: { status: string }) => v.status === 'draft')).toHaveLength(1);
  });

  it.skipIf(!canUseDb)('concurrent draft creation returns a single active draft', async () => {
    const token = await loginAdmin();
    const headers = { Authorization: `Bearer ${token}`, 'X-Site-Id': SITE_OTHER };
    await mapVersionService.getPublishedVersion(SITE_OTHER);

    const results = await Promise.all([
      request(app).post('/api/admin/map-builder/draft').set(headers),
      request(app).post('/api/admin/map-builder/draft').set(headers),
      request(app).post('/api/admin/map-builder/draft').set(headers),
    ]);
    const ids = new Set(results.map((r) => r.body.id));
    expect(ids.size).toBe(1);

    const { rows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM site_map_versions WHERE site_id = $1 AND status = 'draft'`,
      [SITE_OTHER],
    );
    expect(Number(rows[0]?.count)).toBe(1);
  });

  it.skipIf(!canUseDb)('rejects cross-site version access', async () => {
    const token = await loginAdmin();
    const published = await mapVersionService.getPublishedVersion(SITE_V);
    const res = await request(app)
      .get(`/api/admin/map-builder/versions/${published.id}`)
      .set({ Authorization: `Bearer ${token}`, 'X-Site-Id': SITE_OTHER });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('CROSS_SITE_REFERENCE');
  });

  it.skipIf(!canUseDb)('member cannot create draft via map builder', async () => {
    const login = await request(app).post('/api/auth/login').send({
      email: 'student@smartcampus.edu',
      password: 'student123',
    });
    expect(login.status).toBe(200);
    const token = login.body.tokens.accessToken as string;

    const res = await request(app)
      .post('/api/admin/map-builder/draft')
      .set({ Authorization: `Bearer ${token}`, 'X-Site-Id': RNSIT_SITE });
    expect(res.status).toBe(403);
  });

  it.skipIf(!canUseDb)('public campus reads continue resolving live published spatial data', async () => {
    const res = await request(app).get('/api/campus/buildings').set('X-Site-Id', RNSIT_SITE);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.some((b: { id: string }) => b.id === RNSIT_BUILDING)).toBe(true);
  });

  it.skipIf(!canUseDb)('database prevents two published versions per site', async () => {
    await expect(
      pool.query(
        `INSERT INTO site_map_versions (site_id, version_number, status, label)
         VALUES ($1, 99, 'published', 'duplicate')`,
        [RNSIT_SITE],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });
});
