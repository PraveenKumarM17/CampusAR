import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../interfaces/http/app';
import { pool } from '../../infrastructure/db/pool';
import { mapVersionService } from '../../application/mapVersionService';

const app = createApp();

const ORG_V = 'dddddddd-0000-4000-8000-000000000196';
const SITE_V = 'dddddddd-0000-4000-8000-000000000195';
const SITE_OTHER = 'dddddddd-0000-4000-8000-000000000194';
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

async function loginStudent(): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({
    email: 'student@smartcampus.edu',
    password: 'student123',
  });
  expect(res.status).toBe(200);
  return res.body.tokens.accessToken as string;
}

async function seedSites() {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, type)
     VALUES ($1, 'Unified Validate Org', 'unified-validate-org', 'corporate')
     ON CONFLICT (id) DO NOTHING`,
    [ORG_V],
  );
  await pool.query(
    `INSERT INTO sites (id, organization_id, name, slug, latitude, longitude, timezone, status)
     VALUES ($1, $2, 'Unified Validate Site', 'unified-validate-site', 13.01, 77.55, 'Asia/Kolkata', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [SITE_V, ORG_V],
  );
  await pool.query(
    `INSERT INTO sites (id, organization_id, name, slug, latitude, longitude, timezone, status)
     VALUES ($1, $2, 'Unified Validate Other', 'unified-validate-other', 13.02, 77.56, 'Asia/Kolkata', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [SITE_OTHER, ORG_V],
  );
  await mapVersionService.getPublishedVersion(SITE_V);
  await mapVersionService.getPublishedVersion(SITE_OTHER);
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

async function ensureDraft(siteId: string, token: string): Promise<string> {
  const res = await request(app)
    .post('/api/admin/map-builder/draft')
    .set({ Authorization: `Bearer ${token}`, 'X-Site-Id': siteId });
  expect([200, 201]).toContain(res.status);
  return res.body.id as string;
}

describe('unified draft map validation (Step 3A)', () => {
  beforeAll(async () => {
    if (canUseDb) await seedSites();
  });

  afterAll(async () => {
    if (canUseDb) await cleanup();
  });

  it.skipIf(!canUseDb)('valid draft returns valid: true when outdoor graph is complete', async () => {
    const token = await loginAdmin();
    const draftId = await ensureDraft(SITE_V, token);

    const n1 = await request(app)
      .post('/api/admin/paths/nodes')
      .set({ Authorization: `Bearer ${token}`, 'X-Site-Id': SITE_V })
      .send({ latitude: 13.01, longitude: 77.55, kind: 'outdoor', name: 'Gate' });
    const n2 = await request(app)
      .post('/api/admin/paths/nodes')
      .set({ Authorization: `Bearer ${token}`, 'X-Site-Id': SITE_V })
      .send({ latitude: 13.011, longitude: 77.551, kind: 'outdoor', name: 'Plaza' });
    expect(n1.status).toBe(201);
    expect(n2.status).toBe(201);

    await request(app)
      .post('/api/admin/paths/edges')
      .set({ Authorization: `Bearer ${token}`, 'X-Site-Id': SITE_V })
      .send({
        fromNodeId: n1.body.id,
        toNodeId: n2.body.id,
        distanceM: 120,
        kind: 'walkway',
        bidirectional: true,
        blocked: false,
        safetyScore: 0.9,
        crowdScore: 0.2,
        accessibilityScore: 0.9,
      });

    const res = await request(app)
      .get(`/api/admin/map-builder/versions/${draftId}/validate`)
      .set({ Authorization: `Bearer ${token}`, 'X-Site-Id': SITE_V });

    expect(res.status).toBe(200);
    expect(res.body.version.id).toBe(draftId);
    expect(res.body.summary.errors).toBe(0);
    expect(res.body.valid).toBe(true);
  });

  it.skipIf(!canUseDb)('outdoor validation issues are detected only in the draft version', async () => {
    const token = await loginAdmin();
    const draftId = await ensureDraft(SITE_V, token);

    const n1 = await request(app)
      .post('/api/admin/paths/nodes')
      .set({ Authorization: `Bearer ${token}`, 'X-Site-Id': SITE_V })
      .send({ latitude: 13.01, longitude: 77.55, kind: 'outdoor', name: 'A' });
    const n2 = await request(app)
      .post('/api/admin/paths/nodes')
      .set({ Authorization: `Bearer ${token}`, 'X-Site-Id': SITE_V })
      .send({ latitude: 13.011, longitude: 77.551, kind: 'outdoor', name: 'B' });
    await request(app)
      .post('/api/admin/paths/edges')
      .set({ Authorization: `Bearer ${token}`, 'X-Site-Id': SITE_V })
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

    await pool.query(`DELETE FROM edges WHERE from_node_id = $1 OR to_node_id = $1`, [n1.body.id]);

    const draftValidate = await request(app)
      .get(`/api/admin/map-builder/versions/${draftId}/validate`)
      .set({ Authorization: `Bearer ${token}`, 'X-Site-Id': SITE_V });
    expect(draftValidate.status).toBe(200);
    expect(
      draftValidate.body.issues.some(
        (i: { code: string }) => i.code === 'ISOLATED_NODE' || i.code === 'DISCONNECTED_GRAPH',
      ),
    ).toBe(true);
  });

  it.skipIf(!canUseDb)('indoor layout issues are detected in the draft version', async () => {
    const token = await loginAdmin();
    const draftId = await ensureDraft(RNSIT_SITE, token);

    const outdoorSnap = await request(app)
      .get('/api/admin/map-builder/snapshot')
      .set({ Authorization: `Bearer ${token}`, 'X-Site-Id': RNSIT_SITE });
    const draftAdminBuilding = outdoorSnap.body.buildings.find(
      (b: { code: string }) => b.code === 'ADMIN',
    );
    expect(draftAdminBuilding).toBeTruthy();

    const snap = await request(app)
      .get('/api/admin/map-builder/indoor/snapshot')
      .set({ Authorization: `Bearer ${token}`, 'X-Site-Id': RNSIT_SITE })
      .query({ buildingId: draftAdminBuilding.id });
    expect(snap.status).toBe(200);
    const room = snap.body.rooms[0];
    if (!room) return;

    await pool.query(`UPDATE rooms SET local_geometry = NULL WHERE id = $1`, [room.id]);

    const res = await request(app)
      .get(`/api/admin/map-builder/versions/${draftId}/validate`)
      .set({ Authorization: `Bearer ${token}`, 'X-Site-Id': RNSIT_SITE });
    expect(res.status).toBe(200);
    expect(res.body.issues.some((i: { code: string }) => i.code === 'INVALID_ROOM_GEOMETRY')).toBe(true);
    expect(res.body.valid).toBe(false);
  });

  it.skipIf(!canUseDb)('indoor graph issues are detected in the draft version', async () => {
    const token = await loginAdmin();
    const headers = { Authorization: `Bearer ${token}`, 'X-Site-Id': SITE_OTHER };
    const draftId = await ensureDraft(SITE_OTHER, token);

    const buildingRes = await request(app)
      .post('/api/admin/buildings')
      .set(headers)
      .send({
        name: 'Validate Tower',
        code: 'VTWR',
        description: null,
        latitude: 13.02,
        longitude: 77.56,
        floorsCount: 1,
      });
    expect(buildingRes.status).toBe(201);
    const buildingId = buildingRes.body.id as string;

    const floorRes = await request(app)
      .post('/api/admin/map-builder/indoor/floors')
      .set(headers)
      .send({ buildingId, level: 0, name: 'Ground' });
    expect(floorRes.status).toBe(201);
    const floorId = floorRes.body.id as string;

    const mapRes = await request(app)
      .post('/api/admin/map-builder/indoor/graph/ensure-map')
      .set(headers)
      .send({ buildingId });
    expect(mapRes.status).toBe(201);
    const mapId = mapRes.body.id as string;

    const n1 = await request(app)
      .post('/api/admin/map-builder/indoor/graph/nodes')
      .set(headers)
      .send({ buildingId, floorId, planX: 1, planY: 1, mapId, kind: 'corridor' });
    const n2 = await request(app)
      .post('/api/admin/map-builder/indoor/graph/nodes')
      .set(headers)
      .send({ buildingId, floorId, planX: 5, planY: 1, mapId, kind: 'corridor' });
    expect(n1.status).toBe(201);
    expect(n2.status).toBe(201);

    const edgeRes = await request(app)
      .post('/api/admin/map-builder/indoor/graph/edges')
      .set(headers)
      .send({ buildingId, mapId, fromNodeId: n1.body.id, toNodeId: n2.body.id });
    expect(edgeRes.status).toBe(201);

    await pool.query(`UPDATE indoor_nodes SET active = FALSE WHERE id = $1`, [n2.body.id]);

    const res = await request(app)
      .get(`/api/admin/map-builder/versions/${draftId}/validate`)
      .set(headers);
    expect(res.status).toBe(200);
    expect(res.body.issues.some((i: { code: string }) => i.code === 'DANGLING_INDOOR_EDGE')).toBe(
      true,
    );
  });

  it.skipIf(!canUseDb)('aggregates errors and warnings into summary counts', async () => {
    const token = await loginAdmin();
    const draftId = await ensureDraft(SITE_V, token);

    const res = await request(app)
      .get(`/api/admin/map-builder/versions/${draftId}/validate`)
      .set({ Authorization: `Bearer ${token}`, 'X-Site-Id': SITE_V });

    expect(res.status).toBe(200);
    expect(res.body.summary.errors).toBe(
      res.body.issues.filter((i: { level: string }) => i.level === 'error').length,
    );
    expect(res.body.summary.warnings).toBe(
      res.body.issues.filter((i: { level: string }) => i.level === 'warning').length,
    );
    expect(res.body.valid).toBe(res.body.summary.errors === 0);
  });

  it.skipIf(!canUseDb)('published V1 spatial data remains unaffected by draft validation edits', async () => {
    const token = await loginAdmin();
    const published = await mapVersionService.getPublishedVersion(RNSIT_SITE);
    const draftId = await ensureDraft(RNSIT_SITE, token);

    const snap = await request(app)
      .get('/api/admin/map-builder/snapshot')
      .set({ Authorization: `Bearer ${token}`, 'X-Site-Id': RNSIT_SITE });
    const draftBuilding = snap.body.buildings[0];
    await request(app)
      .put(`/api/admin/buildings/${draftBuilding.id}`)
      .set({ Authorization: `Bearer ${token}`, 'X-Site-Id': RNSIT_SITE })
      .send({ name: `Validation Draft Only ${Date.now()}` });

    await request(app)
      .get(`/api/admin/map-builder/versions/${draftId}/validate`)
      .set({ Authorization: `Bearer ${token}`, 'X-Site-Id': RNSIT_SITE });

    const pub = await request(app).get('/api/campus/buildings').set('X-Site-Id', RNSIT_SITE);
    const adminBlock = pub.body.find((b: { id: string }) => b.id === RNSIT_BUILDING);
    expect(adminBlock).toBeTruthy();
    expect(adminBlock.name).toBe('Admin Block');

    const { rows } = await pool.query(`SELECT name FROM buildings WHERE id = $1 AND map_version_id = $2`, [
      RNSIT_BUILDING,
      published.id,
    ]);
    expect(rows[0]?.name).toBe('Admin Block');
  });

  it.skipIf(!canUseDb)('reports cross-version references injected into draft data', async () => {
    const token = await loginAdmin();
    const published = await mapVersionService.getPublishedVersion(RNSIT_SITE);
    const draftId = await ensureDraft(RNSIT_SITE, token);

    const snap = await request(app)
      .get('/api/admin/map-builder/snapshot')
      .set({ Authorization: `Bearer ${token}`, 'X-Site-Id': RNSIT_SITE });
    const draftEdge = snap.body.edges[0];
    const { rows: pubNodes } = await pool.query(
      `SELECT id FROM nodes WHERE map_version_id = $1 LIMIT 1`,
      [published.id],
    );
    if (!draftEdge || !pubNodes[0]) return;

    const originalToNodeId = draftEdge.toNodeId as string;
    await pool.query(`UPDATE edges SET to_node_id = $2 WHERE id = $1`, [
      draftEdge.id,
      pubNodes[0].id,
    ]);

    try {
      const res = await request(app)
        .get(`/api/admin/map-builder/versions/${draftId}/validate`)
        .set({ Authorization: `Bearer ${token}`, 'X-Site-Id': RNSIT_SITE });
      expect(res.status).toBe(200);
      expect(
        res.body.issues.some((i: { code: string }) => i.code === 'CROSS_VERSION_REFERENCE'),
      ).toBe(true);
      expect(res.body.valid).toBe(false);
    } finally {
      await pool.query(`UPDATE edges SET to_node_id = $2 WHERE id = $1`, [
        draftEdge.id,
        originalToNodeId,
      ]);
    }
  });

  it.skipIf(!canUseDb)('rejects cross-site access to another sites draft version', async () => {
    const token = await loginAdmin();
    const draftId = await ensureDraft(SITE_V, token);

    const res = await request(app)
      .get(`/api/admin/map-builder/versions/${draftId}/validate`)
      .set({ Authorization: `Bearer ${token}`, 'X-Site-Id': SITE_OTHER });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('CROSS_SITE_REFERENCE');
  });

  it.skipIf(!canUseDb)('members cannot validate drafts', async () => {
    const adminToken = await loginAdmin();
    const draftId = await ensureDraft(RNSIT_SITE, adminToken);
    const studentToken = await loginStudent();

    const res = await request(app)
      .get(`/api/admin/map-builder/versions/${draftId}/validate`)
      .set({ Authorization: `Bearer ${studentToken}`, 'X-Site-Id': RNSIT_SITE });

    expect(res.status).toBe(403);
  });

  it.skipIf(!canUseDb)('rejects validating published version through draft-only workflow', async () => {
    const token = await loginAdmin();
    const published = await mapVersionService.getPublishedVersion(RNSIT_SITE);

    const res = await request(app)
      .get(`/api/admin/map-builder/versions/${published.id}/validate`)
      .set({ Authorization: `Bearer ${token}`, 'X-Site-Id': RNSIT_SITE });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_DRAFT_ONLY');
  });

  it.skipIf(!canUseDb)('never falls back to published when validating a specific draft id', async () => {
    const token = await loginAdmin();
    const published = await mapVersionService.getPublishedVersion(RNSIT_SITE);
    const draftId = await ensureDraft(RNSIT_SITE, token);
    expect(draftId).not.toBe(published.id);

    const res = await request(app)
      .get(`/api/admin/map-builder/versions/${draftId}/validate`)
      .set({ Authorization: `Bearer ${token}`, 'X-Site-Id': RNSIT_SITE });

    expect(res.status).toBe(200);
    expect(res.body.version.id).toBe(draftId);
    expect(res.body.version.status).toBe('draft');

    const { rows: draftNodeCount } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM nodes WHERE map_version_id = $1`,
      [draftId],
    );
    const { rows: publishedNodeCount } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM nodes WHERE map_version_id = $1`,
      [published.id],
    );
    expect(Number(draftNodeCount[0]?.count)).toBe(Number(publishedNodeCount[0]?.count));
  });

  it.skipIf(!canUseDb)('empty draft site produces expected empty-map warnings', async () => {
    const token = await loginAdmin();
    await pool.query(`DELETE FROM edges WHERE site_id = $1`, [SITE_V]);
    await pool.query(`DELETE FROM nodes WHERE site_id = $1`, [SITE_V]);
    await pool.query(`DELETE FROM buildings WHERE site_id = $1`, [SITE_V]);
    const draftId = await ensureDraft(SITE_V, token);

    const res = await request(app)
      .get(`/api/admin/map-builder/versions/${draftId}/validate`)
      .set({ Authorization: `Bearer ${token}`, 'X-Site-Id': SITE_V });

    expect(res.status).toBe(200);
    expect(res.body.issues.some((i: { code: string }) => i.code === 'EMPTY_SITE_GRAPH')).toBe(true);
    expect(res.body.summary.warnings).toBeGreaterThan(0);
  });
});
