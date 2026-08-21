import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../interfaces/http/app';
import { pool } from '../../infrastructure/db/pool';

const app = createApp();

const ORG_I = 'dddddddd-0000-4000-8000-000000000197';
const SITE_I = 'dddddddd-0000-4000-8000-000000000196';

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
     VALUES ($1, 'Idempotency Org', 'idempotency-org', 'corporate')
     ON CONFLICT (id) DO NOTHING`,
    [ORG_I],
  );
  await pool.query(
    `INSERT INTO sites (id, organization_id, name, slug, latitude, longitude, timezone, status)
     VALUES ($1, $2, 'Idempotency Site', 'idempotency-site', 13.01, 77.55, 'Asia/Kolkata', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [SITE_I, ORG_I],
  );
}

async function cleanupSite() {
  await pool.query(`DELETE FROM nodes WHERE site_id = $1`, [SITE_I]);
  await pool.query(`DELETE FROM sites WHERE id = $1`, [SITE_I]);
  await pool.query(`DELETE FROM organizations WHERE id = $1`, [ORG_I]);
}

describe('map-builder idempotency', () => {
  beforeAll(async () => {
    if (canUseDb) await seedSite();
  });

  afterAll(async () => {
    if (canUseDb) await cleanupSite();
  });

  it.skipIf(!canUseDb)(
    'replays cached response for a repeated Idempotency-Key instead of creating a duplicate node',
    async () => {
      const token = await loginAdmin();
      const idempotencyKey = `test-key-${Date.now()}`;
      const payload = { latitude: 13.01, longitude: 77.55, kind: 'outdoor', name: 'Idempotent Node' };

      const first = await request(app)
        .post('/api/admin/paths/nodes')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Site-Id', SITE_I)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);
      expect(first.status).toBe(201);

      const second = await request(app)
        .post('/api/admin/paths/nodes')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Site-Id', SITE_I)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);
      expect(second.status).toBe(201);
      expect(second.body).toEqual(first.body);

      const { rows } = await pool.query(
        `SELECT id FROM nodes WHERE site_id = $1 AND name = $2`,
        [SITE_I, 'Idempotent Node'],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(first.body.id);
    },
  );
});
