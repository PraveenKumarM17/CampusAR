import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../interfaces/http/app';
import { pool } from '../../infrastructure/db/pool';
import { mapVersionService } from '../../application/mapVersionService';
import { campusRepository } from '../../infrastructure/repositories/campusRepository';
import { mapVersionRepository } from '../../infrastructure/repositories/mapVersionRepository';
import {
  setCloneTestFailureAfter,
} from '../../application/mapVersionCloneService';

const app = createApp();

const ORG_S = 'eeeeeeee-0000-4000-8000-000000000196';
const SITE_S = 'eeeeeeee-0000-4000-8000-000000000195';
const RNSIT_SITE = 'c0000001-0000-4000-8000-000000000010';
const RNSIT_BUILDING = 'b1000001-0000-0000-0000-000000000001';

async function dbReady(): Promise<boolean> {
  try {
    await pool.query('SELECT map_version_id FROM buildings LIMIT 1');
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
     VALUES ($1, 'Spatial Version Org', 'spatial-version-org', 'corporate')
     ON CONFLICT (id) DO NOTHING`,
    [ORG_S],
  );
  await pool.query(
    `INSERT INTO sites (id, organization_id, name, slug, latitude, longitude, timezone, status)
     VALUES ($1, $2, 'Spatial Version Site', 'spatial-version-site', 13.01, 77.55, 'Asia/Kolkata', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [SITE_S, ORG_S],
  );
  await mapVersionService.getPublishedVersion(SITE_S);
}

async function cleanup() {
  await pool.query(`DELETE FROM site_map_versions WHERE site_id = $1`, [SITE_S]);
  await pool.query(`UPDATE sites SET published_map_version_id = NULL WHERE id = $1`, [SITE_S]);
  await pool.query(`DELETE FROM sites WHERE id = $1`, [SITE_S]);
  await pool.query(`DELETE FROM organizations WHERE id = $1`, [ORG_S]);
}

describe('site map spatial versioning (Step 2)', () => {
  beforeAll(async () => {
    if (canUseDb) await seedSite();
  });

  afterAll(async () => {
    if (canUseDb) await cleanup();
  });

  it.skipIf(!canUseDb)('backfills RNSIT building with published map_version_id unchanged UUID', async () => {
    const published = await mapVersionService.getPublishedVersion(RNSIT_SITE);
    const { rows } = await pool.query(
      `SELECT id, map_version_id FROM buildings WHERE id = $1`,
      [RNSIT_BUILDING],
    );
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(RNSIT_BUILDING);
    expect(rows[0].map_version_id).toBe(published.id);
  });

  it.skipIf(!canUseDb)('draft clone creates independent building UUIDs with same logical content', async () => {
    const token = await loginAdmin();
    const headers = { Authorization: `Bearer ${token}`, 'X-Site-Id': RNSIT_SITE };
    const published = await mapVersionService.getPublishedVersion(RNSIT_SITE);

    const draftRes = await request(app).post('/api/admin/map-builder/draft').set(headers);
    expect([200, 201]).toContain(draftRes.status);
    const draftId = draftRes.body.id as string;

    const { rows: pubRows } = await pool.query(
      `SELECT id, code, name FROM buildings WHERE site_id = $1 AND map_version_id = $2`,
      [RNSIT_SITE, published.id],
    );
    const { rows: draftRows } = await pool.query(
      `SELECT id, code, name FROM buildings WHERE site_id = $1 AND map_version_id = $2`,
      [RNSIT_SITE, draftId],
    );
    expect(pubRows.length).toBeGreaterThan(0);
    expect(draftRows.length).toBe(pubRows.length);
    expect(draftRows.some((d: { id: string }) => d.id === RNSIT_BUILDING)).toBe(false);
    expect(new Set(draftRows.map((d: { code: string }) => d.code))).toEqual(
      new Set(pubRows.map((p: { code: string }) => p.code)),
    );
  });

  it.skipIf(!canUseDb)('published isolation: editing draft does not change public buildings', async () => {
    const token = await loginAdmin();
    const headers = { Authorization: `Bearer ${token}`, 'X-Site-Id': RNSIT_SITE };
    await request(app).post('/api/admin/map-builder/draft').set(headers);

    const snap = await request(app).get('/api/admin/map-builder/snapshot').set(headers);
    expect(snap.status).toBe(200);
    expect(snap.body.version?.status).toBe('draft');
    const draftBuilding = snap.body.buildings[0];
    expect(draftBuilding).toBeTruthy();

    const renamed = `Draft Only ${Date.now()}`;
    const put = await request(app)
      .put(`/api/admin/buildings/${draftBuilding.id}`)
      .set(headers)
      .send({ name: renamed });
    expect(put.status).toBe(200);

    const publicRes = await request(app).get('/api/campus/buildings').set('X-Site-Id', RNSIT_SITE);
    expect(publicRes.status).toBe(200);
    const pub = publicRes.body.find((b: { id: string }) => b.id === RNSIT_BUILDING);
    expect(pub).toBeTruthy();
    expect(pub.name).not.toBe(renamed);
  });

  it.skipIf(!canUseDb)('map builder snapshot returns draft version metadata and data', async () => {
    const token = await loginAdmin();
    const headers = { Authorization: `Bearer ${token}`, 'X-Site-Id': RNSIT_SITE };
    await request(app).post('/api/admin/map-builder/draft').set(headers);
    const snap = await request(app).get('/api/admin/map-builder/snapshot').set(headers);
    expect(snap.status).toBe(200);
    expect(snap.body.version.id).toBeTruthy();
    expect(snap.body.version.status).toBe('draft');
    expect(Array.isArray(snap.body.buildings)).toBe(true);
  });

  it.skipIf(!canUseDb)('draft edges do not reference published nodes', async () => {
    const published = await mapVersionService.getPublishedVersion(RNSIT_SITE);
    const draft = await mapVersionService.getOrCreateDraftVersion(RNSIT_SITE, null);

    const { rows: pubNodes } = await pool.query(`SELECT id FROM nodes WHERE map_version_id = $1`, [
      published.id,
    ]);
    const pubNodeIds = new Set(pubNodes.map((r: { id: string }) => r.id));

    const { rows: draftEdges } = await pool.query(
      `SELECT from_node_id, to_node_id FROM edges WHERE map_version_id = $1`,
      [draft.id],
    );
    for (const e of draftEdges) {
      expect(pubNodeIds.has(e.from_node_id)).toBe(false);
      expect(pubNodeIds.has(e.to_node_id)).toBe(false);
    }
  });

  it.skipIf(!canUseDb)('creating draft twice is idempotent', async () => {
    const token = await loginAdmin();
    const headers = { Authorization: `Bearer ${token}`, 'X-Site-Id': SITE_S };
    const a = await request(app).post('/api/admin/map-builder/draft').set(headers);
    const b = await request(app).post('/api/admin/map-builder/draft').set(headers);
    expect(a.body.id).toBe(b.body.id);
    const { rows } = await pool.query(
      `SELECT COUNT(*)::text AS count FROM site_map_versions WHERE site_id = $1 AND status = 'draft'`,
      [SITE_S],
    );
    expect(Number(rows[0]?.count)).toBe(1);
  });

  it.skipIf(!canUseDb)('empty site can create editable empty draft', async () => {
    const token = await loginAdmin();
    const headers = { Authorization: `Bearer ${token}`, 'X-Site-Id': SITE_S };
    const draft = await request(app).post('/api/admin/map-builder/draft').set(headers);
    expect([200, 201]).toContain(draft.status);
    const snap = await request(app).get('/api/admin/map-builder/snapshot').set(headers);
    expect(snap.status).toBe(200);
    expect(snap.body.buildings).toEqual([]);
    expect(snap.body.nodes).toEqual([]);
  });

  it.skipIf(!canUseDb)('rejects cross-version outdoor edge in draft editor', async () => {
    const token = await loginAdmin();
    const headers = { Authorization: `Bearer ${token}`, 'X-Site-Id': RNSIT_SITE };
    const published = await mapVersionService.getPublishedVersion(RNSIT_SITE);
    await mapVersionService.getOrCreateDraftVersion(RNSIT_SITE, null);

    const snap = await request(app).get('/api/admin/map-builder/snapshot').set(headers);
    const draftNode = snap.body.nodes[0];
    const { rows: pubNodes } = await pool.query(
      `SELECT id FROM nodes WHERE map_version_id = $1 LIMIT 1`,
      [published.id],
    );
    const pubNodeId = pubNodes[0]?.id;
    if (!draftNode || !pubNodeId) return;

    const res = await request(app)
      .post('/api/admin/paths/edges')
      .set(headers)
      .send({
        fromNodeId: draftNode.id,
        toNodeId: pubNodeId,
      });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('CROSS_VERSION_REFERENCE');
  });

  it.skipIf(!canUseDb)('clone rollback: forced failure leaves no partial draft and published unchanged', async () => {
    const published = await mapVersionService.getPublishedVersion(RNSIT_SITE);
    const { rows: pubBefore } = await pool.query(
      `SELECT id, name FROM buildings WHERE map_version_id = $1 ORDER BY code`,
      [published.id],
    );

    await pool.query(`DELETE FROM site_map_versions WHERE site_id = $1 AND status = 'draft'`, [
      RNSIT_SITE,
    ]);

    setCloneTestFailureAfter('after-buildings');

    await expect(
      mapVersionRepository.createDraftInTransaction(
        RNSIT_SITE,
        null,
        published.id,
        2,
        published.id,
      ),
    ).rejects.toThrow();

    setCloneTestFailureAfter(null);

    const { rows: draftVersions } = await pool.query(
      `SELECT id FROM site_map_versions WHERE site_id = $1 AND status = 'draft'`,
      [RNSIT_SITE],
    );
    expect(draftVersions).toHaveLength(0);

    const { rows: orphanBuildings } = await pool.query(
      `SELECT id FROM buildings WHERE site_id = $1 AND map_version_id <> $2`,
      [RNSIT_SITE, published.id],
    );
    expect(orphanBuildings).toHaveLength(0);

    const { rows: pubAfter } = await pool.query(
      `SELECT id, name FROM buildings WHERE map_version_id = $1 ORDER BY code`,
      [published.id],
    );
    expect(pubAfter).toEqual(pubBefore);

    const draft = await mapVersionRepository.createDraftInTransaction(
      RNSIT_SITE,
      null,
      published.id,
      2,
      published.id,
    );
    expect(draft.status).toBe('draft');
    const { rows: draftBuildings } = await pool.query(
      `SELECT id FROM buildings WHERE map_version_id = $1`,
      [draft.id],
    );
    expect(draftBuildings.length).toBe(pubBefore.length);
  });

  it.skipIf(!canUseDb)('public routing uses published graph only', async () => {
    const published = await mapVersionService.getPublishedVersion(RNSIT_SITE);
    const nodes = await campusRepository.listActiveNodes(RNSIT_SITE, published.id);
    if (nodes.length < 2) return;
    const a = nodes[0]!;
    const b = nodes[1]!;
    const res = await request(app)
      .post('/api/navigation/route')
      .set('X-Site-Id', RNSIT_SITE)
      .send({ sourceNodeId: a.id, destinationNodeId: b.id });
    expect([200, 404]).toContain(res.status);
    if (res.status === 422 && res.body.code === 'CROSS_VERSION_REFERENCE') {
      throw new Error('Public route rejected published nodes');
    }
  });
});
