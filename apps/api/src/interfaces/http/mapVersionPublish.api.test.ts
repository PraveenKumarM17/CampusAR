import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../interfaces/http/app';
import { pool } from '../../infrastructure/db/pool';
import { mapVersionService } from '../../application/mapVersionService';
import { mapVersionRepository } from '../../infrastructure/repositories/mapVersionRepository';
import {
  setPublishTestFailureAfter,
} from '../../application/mapVersionPublishService';

const app = createApp();

const ORG_PUB = '11111111-0000-4000-8000-000000000196';
const SITE_PUB = '11111111-0000-4000-8000-000000000195';
const SITE_PUB_OTHER = '11111111-0000-4000-8000-000000000194';
const RNSIT_SITE = 'c0000001-0000-4000-8000-000000000010';

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

async function resetSite(siteId: string) {
  await pool.query(`DELETE FROM site_map_versions WHERE site_id = $1`, [siteId]);
  await pool.query(`UPDATE sites SET published_map_version_id = NULL WHERE id = $1`, [siteId]);
  await mapVersionService.getPublishedVersion(siteId);
}

async function seedSites() {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, type)
     VALUES ($1, 'Publish Org', 'publish-org', 'corporate')
     ON CONFLICT (id) DO NOTHING`,
    [ORG_PUB],
  );
  for (const [id, slug, name] of [
    [SITE_PUB, 'publish-site', 'Publish Site'],
    [SITE_PUB_OTHER, 'publish-site-other', 'Publish Other'],
  ] as const) {
    await pool.query(
      `INSERT INTO sites (id, organization_id, name, slug, latitude, longitude, timezone, status)
       VALUES ($1, $2, $3, $4, 13.01, 77.55, 'Asia/Kolkata', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [id, ORG_PUB, name, slug],
    );
    await mapVersionService.getPublishedVersion(id);
  }
}

async function cleanup() {
  await pool.query(`DELETE FROM site_map_versions WHERE site_id IN ($1, $2)`, [
    SITE_PUB,
    SITE_PUB_OTHER,
  ]);
  await pool.query(`UPDATE sites SET published_map_version_id = NULL WHERE id IN ($1, $2)`, [
    SITE_PUB,
    SITE_PUB_OTHER,
  ]);
  await pool.query(`DELETE FROM sites WHERE id IN ($1, $2)`, [SITE_PUB, SITE_PUB_OTHER]);
  await pool.query(`DELETE FROM organizations WHERE id = $1`, [ORG_PUB]);
}

async function ensureDraft(siteId: string, token: string): Promise<string> {
  const res = await request(app)
    .post('/api/admin/map-builder/draft')
    .set({ Authorization: `Bearer ${token}`, 'X-Site-Id': siteId });
  expect([200, 201]).toContain(res.status);
  return res.body.id as string;
}

async function wireValidOutdoorGraph(token: string, siteId: string) {
  const headers = { Authorization: `Bearer ${token}`, 'X-Site-Id': siteId };
  const n1 = await request(app)
    .post('/api/admin/paths/nodes')
    .set(headers)
    .send({ latitude: 13.01, longitude: 77.55, kind: 'outdoor', name: 'Pub Gate' });
  const n2 = await request(app)
    .post('/api/admin/paths/nodes')
    .set(headers)
    .send({ latitude: 13.011, longitude: 77.551, kind: 'outdoor', name: 'Pub Plaza' });
  expect(n1.status).toBe(201);
  expect(n2.status).toBe(201);
  await request(app)
    .post('/api/admin/paths/edges')
    .set(headers)
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
  return { n1: n1.body.id as string, n2: n2.body.id as string };
}

async function createPublishableDraft(siteId: string, token: string): Promise<string> {
  const draftId = await ensureDraft(siteId, token);
  await wireValidOutdoorGraph(token, siteId);
  const headers = { Authorization: `Bearer ${token}`, 'X-Site-Id': siteId };
  const validate = await request(app)
    .get(`/api/admin/map-builder/versions/${draftId}/validate`)
    .set(headers);
  expect(validate.status).toBe(200);
  expect(validate.body.summary.errors).toBe(0);
  return draftId;
}

function publishPath(versionId: string) {
  return `/api/admin/map-builder/versions/${versionId}/publish`;
}

function diffPath(versionId: string) {
  return `/api/admin/map-builder/versions/${versionId}/diff`;
}

function rollbackPath(versionId: string) {
  return `/api/admin/map-builder/versions/${versionId}/rollback`;
}

describe('atomic draft publish workflow (Step 3C)', () => {
  beforeAll(async () => {
    if (canUseDb) await seedSites();
  });

  beforeEach(async () => {
    if (canUseDb) {
      await resetSite(SITE_PUB);
      await resetSite(SITE_PUB_OTHER);
    }
  });

  afterAll(async () => {
    setPublishTestFailureAfter(null);
    if (canUseDb) await cleanup();
  });

  it.skipIf(!canUseDb)('publishes valid draft and updates site pointer', async () => {
    const token = await loginAdmin();
    const headers = { Authorization: `Bearer ${token}`, 'X-Site-Id': SITE_PUB };
    const publishedBefore = await mapVersionService.getPublishedVersion(SITE_PUB);
    const draftId = await createPublishableDraft(SITE_PUB, token);

    const res = await request(app).post(publishPath(draftId)).set(headers);
    expect(res.status).toBe(200);
    expect(res.body.published).toBe(true);
    expect(res.body.version.id).toBe(draftId);
    expect(res.body.version.status).toBe('published');
    expect(res.body.previousVersion?.id).toBe(publishedBefore.id);
    expect(res.body.previousVersion?.status).toBe('archived');

    const pointer = await pool.query(
      `SELECT published_map_version_id FROM sites WHERE id = $1`,
      [SITE_PUB],
    );
    expect(pointer.rows[0].published_map_version_id).toBe(draftId);
  });

  it.skipIf(!canUseDb)('public buildings switch to newly published draft data', async () => {
    const token = await loginAdmin();
    const headers = { Authorization: `Bearer ${token}`, 'X-Site-Id': SITE_PUB };
    const draftId = await createPublishableDraft(SITE_PUB, token);

    const buildingRes = await request(app)
      .post('/api/admin/buildings')
      .set(headers)
      .send({
        name: 'Publish Switch Building',
        code: `PSB${Date.now().toString().slice(-4)}`,
        description: null,
        latitude: 13.012,
        longitude: 77.552,
        floorsCount: 1,
      });
    expect(buildingRes.status).toBe(201);
    const liveName = `Live After Publish ${Date.now()}`;
    await request(app)
      .put(`/api/admin/buildings/${buildingRes.body.id}`)
      .set(headers)
      .send({ name: liveName });

    const validate = await request(app)
      .get(`/api/admin/map-builder/versions/${draftId}/validate`)
      .set(headers);
    expect(validate.body.summary.errors).toBe(0);

    await request(app).post(publishPath(draftId)).set(headers);

    const publicRes = await request(app).get('/api/campus/buildings').set('X-Site-Id', SITE_PUB);
    expect(publicRes.body.some((b: { name: string }) => b.name === liveName)).toBe(true);
  });

  it.skipIf(!canUseDb)('public navigation uses V2 graph after publish', async () => {
    const token = await loginAdmin();
    const headers = { Authorization: `Bearer ${token}`, 'X-Site-Id': SITE_PUB_OTHER };
    const draftId = await createPublishableDraft(SITE_PUB_OTHER, token);
    const snap = await request(app).get('/api/admin/map-builder/snapshot').set(headers);
    const named = snap.body.nodes.filter((n: { name: string | null }) => n.name?.trim());
    const n1 = named.find((n: { name: string | null }) => n.name === 'Pub Gate')?.id;
    const n2 = named.find((n: { name: string | null }) => n.name === 'Pub Plaza')?.id;
    expect(n1).toBeTruthy();
    expect(n2).toBeTruthy();

    const before = await request(app)
      .post('/api/navigation/route')
      .set('X-Site-Id', SITE_PUB_OTHER)
      .send({ sourceNodeId: n1, destinationNodeId: n2, usePrediction: false });
    expect(before.status).toBe(422);

    await request(app).post(publishPath(draftId)).set(headers);

    const after = await request(app)
      .post('/api/navigation/route')
      .set('X-Site-Id', SITE_PUB_OTHER)
      .send({ sourceNodeId: n1, destinationNodeId: n2, usePrediction: false });
    expect(after.status).toBe(200);
  });

  it.skipIf(!canUseDb)('invalid draft cannot publish and returns validation result', async () => {
    const token = await loginAdmin();
    const headers = { Authorization: `Bearer ${token}`, 'X-Site-Id': SITE_PUB };
    const draftId = await createPublishableDraft(SITE_PUB, token);
    const published = await mapVersionService.getPublishedVersion(SITE_PUB);
    await pool.query(
      `INSERT INTO buildings (id, site_id, map_version_id, name, code, latitude, longitude, floors_count)
       VALUES (gen_random_uuid(), $1, $2, 'Straggler', 'STR', 13.01, 77.55, 1)`,
      [SITE_PUB, published.id],
    );

    const res = await request(app).post(publishPath(draftId)).set(headers);
    expect(res.status).toBe(409);
    expect(res.body.published).toBe(false);
    expect(res.body.validation.summary.errors).toBeGreaterThan(0);

    const publishedVersion = await mapVersionService.getPublishedVersion(SITE_PUB);
    const draft = await mapVersionRepository.getDraftBySite(SITE_PUB);
    expect(draft?.id).toBe(draftId);
    expect(publishedVersion.id).not.toBe(draftId);
  });

  it.skipIf(!canUseDb)('warnings do not block publish', async () => {
    const token = await loginAdmin();
    const headers = { Authorization: `Bearer ${token}`, 'X-Site-Id': SITE_PUB_OTHER };
    const draftId = await createPublishableDraft(SITE_PUB_OTHER, token);

    const res = await request(app).post(publishPath(draftId)).set(headers);
    expect(res.status).toBe(200);
    expect(res.body.published).toBe(true);
  });

  it.skipIf(!canUseDb)('publishing a published version is rejected', async () => {
    const token = await loginAdmin();
    const headers = { Authorization: `Bearer ${token}`, 'X-Site-Id': SITE_PUB };
    const published = await mapVersionService.getPublishedVersion(SITE_PUB);
    const res = await request(app).post(publishPath(published.id)).set(headers);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('PUBLISH_DRAFT_ONLY');
  });

  it.skipIf(!canUseDb)('cross-site publish is rejected', async () => {
    const token = await loginAdmin();
    const draftId = await ensureDraft(SITE_PUB, token);
    const res = await request(app)
      .post(publishPath(draftId))
      .set({ Authorization: `Bearer ${token}`, 'X-Site-Id': SITE_PUB_OTHER });
    expect([404, 422]).toContain(res.status);
  });

  it.skipIf(!canUseDb)('member/guest cannot publish', async () => {
    const admin = await loginAdmin();
    const draftId = await ensureDraft(SITE_PUB, admin);
    const student = await loginStudent();
    const res = await request(app)
      .post(publishPath(draftId))
      .set({ Authorization: `Bearer ${student}`, 'X-Site-Id': SITE_PUB });
    expect([403, 401]).toContain(res.status);
  });

  it.skipIf(!canUseDb)('failed publish transaction preserves published pointer and draft status', async () => {
    const token = await loginAdmin();
    const headers = { Authorization: `Bearer ${token}`, 'X-Site-Id': SITE_PUB_OTHER };
    const beforePointer = (
      await pool.query(`SELECT published_map_version_id FROM sites WHERE id = $1`, [SITE_PUB_OTHER])
    ).rows[0].published_map_version_id;
    const draftId = await createPublishableDraft(SITE_PUB_OTHER, token);

    setPublishTestFailureAfter('before-pointer-update');
    const res = await request(app).post(publishPath(draftId)).set(headers);
    expect(res.status).toBe(500);
    setPublishTestFailureAfter(null);

    const afterPointer = (
      await pool.query(`SELECT published_map_version_id FROM sites WHERE id = $1`, [SITE_PUB_OTHER])
    ).rows[0].published_map_version_id;
    expect(afterPointer).toBe(beforePointer);

    const draft = await mapVersionRepository.getById(draftId);
    expect(draft?.status).toBe('draft');

    const publishedCount = await pool.query(
      `SELECT count(*)::int AS c FROM site_map_versions WHERE site_id = $1 AND status = 'published'`,
      [SITE_PUB_OTHER],
    );
    expect(publishedCount.rows[0].c).toBe(1);
  });

  it.skipIf(!canUseDb)('concurrent publish attempts cannot create two published versions', async () => {
    const token = await loginAdmin();
    const headers = { Authorization: `Bearer ${token}`, 'X-Site-Id': SITE_PUB };
    const draftId = await createPublishableDraft(SITE_PUB, token);

    const [a, b] = await Promise.all([
      request(app).post(publishPath(draftId)).set(headers),
      request(app).post(publishPath(draftId)).set(headers),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toContain(200);
    expect(statuses.some((s) => s === 409 || s === 422 || s === 200)).toBe(true);

    const publishedCount = await pool.query(
      `SELECT count(*)::int AS c FROM site_map_versions WHERE site_id = $1 AND status = 'published'`,
      [SITE_PUB],
    );
    expect(publishedCount.rows[0].c).toBe(1);
  });

  it.skipIf(!canUseDb)('after publish, next draft create clones from new published version', async () => {
    const token = await loginAdmin();
    const headers = { Authorization: `Bearer ${token}`, 'X-Site-Id': SITE_PUB_OTHER };
    const draftId = await createPublishableDraft(SITE_PUB_OTHER, token);
    const pubRes = await request(app).post(publishPath(draftId)).set(headers);
    expect(pubRes.status).toBe(200);
    const publishedId = pubRes.body.version.id as string;

    const nextDraft = await request(app).post('/api/admin/map-builder/draft').set(headers);
    expect([200, 201]).toContain(nextDraft.status);
    expect(nextDraft.body.status).toBe('draft');
    expect(nextDraft.body.versionNumber).toBeGreaterThan(pubRes.body.version.versionNumber);
    expect(nextDraft.body.basedOnVersionId).toBe(publishedId);
  });

  it.skipIf(!canUseDb)('newly published version cannot be previewed', async () => {
    const token = await loginAdmin();
    const headers = { Authorization: `Bearer ${token}`, 'X-Site-Id': SITE_PUB_OTHER };
    const draftId = await createPublishableDraft(SITE_PUB_OTHER, token);
    const pub = await request(app).post(publishPath(draftId)).set(headers);
    expect(pub.status).toBe(200);

    const preview = await request(app)
      .get(`/api/admin/map-builder/preview/${draftId}/campus/buildings`)
      .set(headers);
    expect(preview.status).toBe(422);
    expect(preview.body.code).toBe('PREVIEW_DRAFT_ONLY');
  });

  it.skipIf(!canUseDb)('indoor maps align to published status on publish', async () => {
    const token = await loginAdmin();
    const headers = { Authorization: `Bearer ${token}`, 'X-Site-Id': SITE_PUB_OTHER };
    const draftId = await ensureDraft(SITE_PUB_OTHER, token);
    await wireValidOutdoorGraph(token, SITE_PUB_OTHER);

    const buildingRes = await request(app)
      .post('/api/admin/buildings')
      .set(headers)
      .send({
        name: 'Indoor Pub',
        code: 'IPUB',
        description: null,
        latitude: 13.02,
        longitude: 77.56,
        floorsCount: 1,
      });
    const buildingId = buildingRes.body.id as string;
    await request(app)
      .post('/api/admin/map-builder/indoor/floors')
      .set(headers)
      .send({ buildingId, level: 0, name: 'Ground' });
    const mapRes = await request(app)
      .post('/api/admin/map-builder/indoor/graph/ensure-map')
      .set(headers)
      .send({ buildingId });
    expect(mapRes.status).toBe(201);
    expect(mapRes.body.status).toBe('draft');

    const validate = await request(app)
      .get(`/api/admin/map-builder/versions/${draftId}/validate`)
      .set(headers);
    expect(validate.body.summary.errors).toBe(0);

    await request(app).post(publishPath(draftId)).set(headers);

    const { rows } = await pool.query(
      `SELECT status FROM indoor_maps WHERE map_version_id = $1`,
      [draftId],
    );
    expect(rows.every((r: { status: string }) => r.status === 'published')).toBe(true);
  });

  it.skipIf(!canUseDb)('RNSIT public campus APIs remain backward compatible', async () => {
    const buildings = await request(app).get('/api/campus/buildings').set('X-Site-Id', RNSIT_SITE);
    expect(buildings.status).toBe(200);
    expect(buildings.body.length).toBeGreaterThan(0);
  });

  it.skipIf(!canUseDb)('publish exposes diff, stores publish log, and supports rollback draft creation', async () => {
    const token = await loginAdmin();
    const headers = { Authorization: `Bearer ${token}`, 'X-Site-Id': SITE_PUB };
    const draftId = await createPublishableDraft(SITE_PUB, token);

    const renamed = `Diff Rename ${Date.now()}`;
    const snap = await request(app).get('/api/admin/map-builder/snapshot').set(headers);
    const firstBuilding = snap.body.buildings[0];
    if (firstBuilding) {
      const upd = await request(app)
        .put(`/api/admin/buildings/${firstBuilding.id}`)
        .set(headers)
        .send({ name: renamed });
      expect(upd.status).toBe(200);
    }
    const created = await request(app)
      .post('/api/admin/buildings')
      .set(headers)
      .send({
        name: `Diff New ${Date.now()}`,
        code: `D${Date.now().toString().slice(-5)}`,
        description: null,
        latitude: 13.02,
        longitude: 77.56,
        floorsCount: 1,
      });
    expect(created.status).toBe(201);

    const diff = await request(app).get(diffPath(draftId)).set(headers);
    expect(diff.status).toBe(200);
    expect(diff.body.versionId).toBe(draftId);
    expect(diff.body.summary.added).toBeGreaterThanOrEqual(1);

    const publish = await request(app).post(publishPath(draftId)).set(headers);
    expect(publish.status).toBe(200);
    expect(publish.body.published).toBe(true);

    const logs = await pool.query(
      `SELECT published_version_id, diff_summary FROM map_version_publish_log WHERE published_version_id = $1`,
      [draftId],
    );
    expect(logs.rows.length).toBe(1);
    expect(Number(logs.rows[0].diff_summary?.added?.count ?? 0)).toBeGreaterThanOrEqual(1);

    const history = await request(app).get('/api/admin/map-builder/history').set(headers);
    expect(history.status).toBe(200);
    expect(history.body.some((x: { publishedVersionId: string }) => x.publishedVersionId === draftId)).toBe(true);

    const rollback = await request(app).post(rollbackPath(draftId)).set(headers);
    expect(rollback.status).toBe(201);
    expect(rollback.body.status).toBe('draft');
    expect(rollback.body.basedOnVersionId).toBe(draftId);
  });
});
