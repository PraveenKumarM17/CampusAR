import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../interfaces/http/app';
import { pool } from '../../infrastructure/db/pool';
import { mapVersionService } from '../../application/mapVersionService';

const app = createApp();

const ORG_P = 'ffffffff-0000-4000-8000-000000000196';
const SITE_P = 'ffffffff-0000-4000-8000-000000000195';
const SITE_P_OTHER = 'ffffffff-0000-4000-8000-000000000194';
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

async function loginGuest(): Promise<string> {
  const res = await request(app).post('/api/auth/guest').send({ name: 'Preview Guest' });
  expect([200, 201]).toContain(res.status);
  return res.body.tokens.accessToken as string;
}

async function seedSites() {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, type)
     VALUES ($1, 'Preview Org', 'preview-org', 'corporate')
     ON CONFLICT (id) DO NOTHING`,
    [ORG_P],
  );
  for (const [id, slug, name] of [
    [SITE_P, 'preview-site', 'Preview Site'],
    [SITE_P_OTHER, 'preview-site-other', 'Preview Other'],
  ] as const) {
    await pool.query(
      `INSERT INTO sites (id, organization_id, name, slug, latitude, longitude, timezone, status)
       VALUES ($1, $2, $3, $4, 13.01, 77.55, 'Asia/Kolkata', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [id, ORG_P, name, slug],
    );
    await mapVersionService.getPublishedVersion(id);
  }
}

async function cleanup() {
  await pool.query(`DELETE FROM site_map_versions WHERE site_id IN ($1, $2)`, [SITE_P, SITE_P_OTHER]);
  await pool.query(`UPDATE sites SET published_map_version_id = NULL WHERE id IN ($1, $2)`, [
    SITE_P,
    SITE_P_OTHER,
  ]);
  await pool.query(`DELETE FROM sites WHERE id IN ($1, $2)`, [SITE_P, SITE_P_OTHER]);
  await pool.query(`DELETE FROM organizations WHERE id = $1`, [ORG_P]);
}

async function ensureDraft(siteId: string, token: string): Promise<string> {
  const res = await request(app)
    .post('/api/admin/map-builder/draft')
    .set({ Authorization: `Bearer ${token}`, 'X-Site-Id': siteId });
  expect([200, 201]).toContain(res.status);
  return res.body.id as string;
}

function previewPath(versionId: string, sub: string) {
  return `/api/admin/map-builder/preview/${versionId}${sub}`;
}

describe('authorized draft preview mode (Step 3B)', () => {
  beforeAll(async () => {
    if (canUseDb) await seedSites();
  });

  afterAll(async () => {
    if (canUseDb) await cleanup();
  });

  it.skipIf(!canUseDb)(
    'public map reads published V1 while preview reads draft V2 buildings',
    async () => {
      const token = await loginAdmin();
      const headers = { Authorization: `Bearer ${token}`, 'X-Site-Id': RNSIT_SITE };
      const published = await mapVersionService.getPublishedVersion(RNSIT_SITE);
      const draftId = await ensureDraft(RNSIT_SITE, token);

      const snap = await request(app).get('/api/admin/map-builder/snapshot').set(headers);
      const draftBuilding = snap.body.buildings[0];
      const renamed = `Preview Draft Name ${Date.now()}`;
      await request(app)
        .put(`/api/admin/buildings/${draftBuilding.id}`)
        .set(headers)
        .send({ name: renamed });

      const publicRes = await request(app).get('/api/campus/buildings').set('X-Site-Id', RNSIT_SITE);
      const previewRes = await request(app)
        .get(previewPath(draftId, '/campus/buildings'))
        .set(headers);

      expect(publicRes.status).toBe(200);
      expect(previewRes.status).toBe(200);
      expect(publicRes.body.some((b: { id: string }) => b.id === RNSIT_BUILDING)).toBe(true);
      expect(previewRes.body.some((b: { name: string }) => b.name === renamed)).toBe(true);
      expect(publicRes.body.some((b: { name: string }) => b.name === renamed)).toBe(false);
      expect(published.id).not.toBe(draftId);
    },
  );

  it.skipIf(!canUseDb)('public buildings endpoint never exposes draft V2 UUIDs', async () => {
    const token = await loginAdmin();
    const draftId = await ensureDraft(RNSIT_SITE, token);

    const { rows: draftBuildingIds } = await pool.query(
      `SELECT id FROM buildings WHERE site_id = $1 AND map_version_id = $2`,
      [RNSIT_SITE, draftId],
    );

    const publicRes = await request(app).get('/api/campus/buildings').set('X-Site-Id', RNSIT_SITE);
    expect(publicRes.status).toBe(200);
    const publicIds = new Set(publicRes.body.map((b: { id: string }) => b.id));
    for (const row of draftBuildingIds) {
      expect(publicIds.has(row.id)).toBe(false);
    }
  });

  it.skipIf(!canUseDb)('authorized map editor can preview own site draft', async () => {
    const token = await loginAdmin();
    const draftId = await ensureDraft(SITE_P, token);
    const res = await request(app)
      .get(previewPath(draftId, '/meta'))
      .set({ Authorization: `Bearer ${token}`, 'X-Site-Id': SITE_P });
    expect(res.status).toBe(200);
    expect(res.body.previewVersion.id).toBe(draftId);
    expect(res.body.previewVersion.status).toBe('draft');
  });

  it.skipIf(!canUseDb)('member/guest cannot access preview APIs', async () => {
    const admin = await loginAdmin();
    const draftId = await ensureDraft(SITE_P, admin);
    const student = await loginStudent();
    const guest = await loginGuest();

    const studentRes = await request(app)
      .get(previewPath(draftId, '/campus/buildings'))
      .set({ Authorization: `Bearer ${student}`, 'X-Site-Id': SITE_P });
    expect([403, 401]).toContain(studentRes.status);

    const guestRes = await request(app)
      .get(previewPath(draftId, '/campus/buildings'))
      .set({ Authorization: `Bearer ${guest}`, 'X-Site-Id': SITE_P });
    expect([403, 401]).toContain(guestRes.status);
  });

  it.skipIf(!canUseDb)('cross-site preview version is rejected', async () => {
    const token = await loginAdmin();
    const draftId = await ensureDraft(SITE_P, token);
    const res = await request(app)
      .get(previewPath(draftId, '/campus/buildings'))
      .set({ Authorization: `Bearer ${token}`, 'X-Site-Id': SITE_P_OTHER });
    expect([404, 422]).toContain(res.status);
  });

  it.skipIf(!canUseDb)('unknown preview version is rejected', async () => {
    const token = await loginAdmin();
    const fakeId = 'aaaaaaaa-0000-4000-8000-000000000099';
    const res = await request(app)
      .get(previewPath(fakeId, '/campus/buildings'))
      .set({ Authorization: `Bearer ${token}`, 'X-Site-Id': SITE_P });
    expect(res.status).toBe(404);
  });

  it.skipIf(!canUseDb)('published version cannot be used as draft preview', async () => {
    const token = await loginAdmin();
    const published = await mapVersionService.getPublishedVersion(SITE_P);
    const res = await request(app)
      .get(previewPath(published.id, '/campus/buildings'))
      .set({ Authorization: `Bearer ${token}`, 'X-Site-Id': SITE_P });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('PREVIEW_DRAFT_ONLY');
  });

  it.skipIf(!canUseDb)('preview never falls back to published when draft building was renamed', async () => {
    const token = await loginAdmin();
    const headers = { Authorization: `Bearer ${token}`, 'X-Site-Id': RNSIT_SITE };
    const draftId = await ensureDraft(RNSIT_SITE, token);
    const published = await mapVersionService.getPublishedVersion(RNSIT_SITE);

    const pubBuilding = await request(app).get('/api/campus/buildings').set('X-Site-Id', RNSIT_SITE);
    const pubName = pubBuilding.body.find((b: { id: string }) => b.id === RNSIT_BUILDING)?.name;

    const snap = await request(app).get('/api/admin/map-builder/snapshot').set(headers);
    const draftBuilding = snap.body.buildings.find((b: { code: string }) => b.code === 'ADMIN');
    const unique = `NoFallback ${Date.now()}`;
    await request(app)
      .put(`/api/admin/buildings/${draftBuilding.id}`)
      .set(headers)
      .send({ name: unique });

    const preview = await request(app).get(previewPath(draftId, '/campus/buildings')).set(headers);
    expect(preview.status).toBe(200);
    expect(preview.body.some((b: { name: string }) => b.name === unique)).toBe(true);
    expect(preview.body.some((b: { id: string }) => b.id === RNSIT_BUILDING)).toBe(false);

    const pubAfter = await request(app).get('/api/campus/buildings').set('X-Site-Id', RNSIT_SITE);
    expect(pubAfter.body.find((b: { id: string }) => b.id === RNSIT_BUILDING)?.name).toBe(pubName);
    expect(published.id).not.toBe(draftId);
  });

  it.skipIf(!canUseDb)('preview outdoor navigation routes using draft nodes only', async () => {
    const token = await loginAdmin();
    const headers = { Authorization: `Bearer ${token}`, 'X-Site-Id': SITE_P };
    const draftId = await ensureDraft(SITE_P, token);

    const n1 = await request(app)
      .post('/api/admin/paths/nodes')
      .set(headers)
      .send({ latitude: 13.01, longitude: 77.55, kind: 'outdoor', name: 'Preview Start' });
    const n2 = await request(app)
      .post('/api/admin/paths/nodes')
      .set(headers)
      .send({ latitude: 13.011, longitude: 77.551, kind: 'outdoor', name: 'Preview End' });
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

    const previewRoute = await request(app)
      .post(previewPath(draftId, '/navigation/route'))
      .set(headers)
      .send({ sourceNodeId: n1.body.id, destinationNodeId: n2.body.id, usePrediction: false });
    expect(previewRoute.status).toBe(200);
    expect(previewRoute.body.nodeIds).toContain(n1.body.id);

    const publicRoute = await request(app)
      .post('/api/navigation/route')
      .set('X-Site-Id', SITE_P)
      .send({ sourceNodeId: n1.body.id, destinationNodeId: n2.body.id, usePrediction: false });
    expect(publicRoute.status).toBe(422);
  });

  it.skipIf(!canUseDb)('public navigation still routes only on published graph', async () => {
    const token = await loginAdmin();
    await ensureDraft(SITE_P_OTHER, token);

    const pubNodes = await request(app).get('/api/campus/nodes').set('X-Site-Id', SITE_P_OTHER);
    const named = pubNodes.body.filter((n: { name: string | null }) => n.name?.trim());
    if (named.length < 2) return;

    const route = await request(app)
      .post('/api/navigation/route')
      .set('X-Site-Id', SITE_P_OTHER)
      .send({
        sourceNodeId: named[0].id,
        destinationNodeId: named[1].id,
        usePrediction: false,
      });
    expect([200, 404]).toContain(route.status);
    if (route.status === 200) {
      for (const nodeId of route.body.nodeIds as string[]) {
        const versionRow = await pool.query(`SELECT map_version_id FROM nodes WHERE id = $1`, [
          nodeId,
        ]);
        const published = await mapVersionService.getPublishedVersion(SITE_P_OTHER);
        expect(versionRow.rows[0]?.map_version_id).toBe(published.id);
      }
    }
  });

  it.skipIf(!canUseDb)('preview indoor building context reads draft version map', async () => {
    const token = await loginAdmin();
    const headers = { Authorization: `Bearer ${token}`, 'X-Site-Id': RNSIT_SITE };
    const draftId = await ensureDraft(RNSIT_SITE, token);

    const snap = await request(app).get('/api/admin/map-builder/snapshot').set(headers);
    const building = snap.body.buildings.find((b: { code: string }) => b.code === 'ADMIN');
    expect(building).toBeTruthy();

    const previewCtx = await request(app)
      .get(previewPath(draftId, `/indoor/buildings/${building.id}/context`))
      .set(headers);
    expect(previewCtx.status).toBe(200);
    expect(previewCtx.body.building.id).toBe(building.id);

    const publicCtx = await request(app)
      .get(`/api/indoor/buildings/${RNSIT_BUILDING}/context`)
      .set('X-Site-Id', RNSIT_SITE);
    expect(publicCtx.status).toBe(200);
    if (publicCtx.body.indoorMap && previewCtx.body.indoorMap) {
      expect(publicCtx.body.indoorMap.id).not.toBe(previewCtx.body.indoorMap.id);
    }
  });

  it.skipIf(!canUseDb)('preview indoor routing uses draft graph', async () => {
    const token = await loginAdmin();
    const headers = { Authorization: `Bearer ${token}`, 'X-Site-Id': SITE_P_OTHER };
    const draftId = await ensureDraft(SITE_P_OTHER, token);

    const buildingRes = await request(app)
      .post('/api/admin/buildings')
      .set(headers)
      .send({
        name: 'Preview Indoor',
        code: 'PIND',
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
    const floorId = floorRes.body.id as string;

    const mapRes = await request(app)
      .post('/api/admin/map-builder/indoor/graph/ensure-map')
      .set(headers)
      .send({ buildingId });
    const mapId = mapRes.body.id as string;

    const n1 = await request(app)
      .post('/api/admin/map-builder/indoor/graph/nodes')
      .set(headers)
      .send({ buildingId, floorId, planX: 0, planY: 0, mapId, kind: 'corridor', name: 'A' });
    const n2 = await request(app)
      .post('/api/admin/map-builder/indoor/graph/nodes')
      .set(headers)
      .send({ buildingId, floorId, planX: 4, planY: 0, mapId, kind: 'destination', name: 'Dest' });
    await request(app)
      .post('/api/admin/map-builder/indoor/graph/edges')
      .set(headers)
      .send({ buildingId, mapId, fromNodeId: n1.body.id, toNodeId: n2.body.id, kind: 'walk' });

    const placeRes = await request(app)
      .post('/api/admin/map-builder/indoor/graph/rooms/link')
      .set(headers)
      .send({
        buildingId,
        mapId,
        roomId: (
          await request(app)
            .post('/api/admin/map-builder/indoor/rooms')
            .set(headers)
            .send({
              buildingId,
              floorId,
              name: 'Room P',
              category: 'office',
              localGeometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
            })
        ).body.id,
        nodeId: n2.body.id,
      });

    const places = await request(app)
      .get(previewPath(draftId, `/indoor/places?buildingId=${buildingId}`))
      .set(headers);
    expect(places.status).toBe(200);
    const place = places.body[0];
    if (!place) return;

    const route = await request(app)
      .post(previewPath(draftId, '/indoor/route'))
      .set(headers)
      .send({
        sourceNodeId: n1.body.id,
        destinationPlaceId: place.id,
        expectedBuildingId: buildingId,
      });
    expect(route.status).toBe(200);
    expect(route.body.destinationPlaceId).toBe(place.id);
    expect(placeRes.status).toBe(201);
  });

  it.skipIf(!canUseDb)('preview campus areas are version-scoped', async () => {
    const token = await loginAdmin();
    const headers = { Authorization: `Bearer ${token}`, 'X-Site-Id': SITE_P };
    const draftId = await ensureDraft(SITE_P, token);

    const area = await request(app)
      .post('/api/admin/areas')
      .set(headers)
      .send({
        name: 'Preview Parking',
        type: 'parking',
        footprint: [
          { latitude: 13.01, longitude: 77.55 },
          { latitude: 13.011, longitude: 77.55 },
          { latitude: 13.011, longitude: 77.551 },
        ],
      });
    expect(area.status).toBe(201);

    const previewAreas = await request(app).get(previewPath(draftId, '/campus/areas')).set(headers);
    expect(previewAreas.status).toBe(200);
    expect(previewAreas.body.some((a: { name: string }) => a.name === 'Preview Parking')).toBe(true);
  });

  it.skipIf(!canUseDb)('preview endpoints do not mutate draft or published data', async () => {
    const token = await loginAdmin();
    const headers = { Authorization: `Bearer ${token}`, 'X-Site-Id': RNSIT_SITE };
    const draftId = await ensureDraft(RNSIT_SITE, token);
    const published = await mapVersionService.getPublishedVersion(RNSIT_SITE);

    const beforePub = await pool.query(
      `SELECT count(*)::int AS c FROM buildings WHERE map_version_id = $1`,
      [published.id],
    );
    const beforeDraft = await pool.query(
      `SELECT count(*)::int AS c FROM buildings WHERE map_version_id = $1`,
      [draftId],
    );

    await request(app).get(previewPath(draftId, '/campus/buildings')).set(headers);
    await request(app).get(previewPath(draftId, '/campus/nodes')).set(headers);
    await request(app).get(previewPath(draftId, '/campus/edges')).set(headers);

    const afterPub = await pool.query(
      `SELECT count(*)::int AS c FROM buildings WHERE map_version_id = $1`,
      [published.id],
    );
    const afterDraft = await pool.query(
      `SELECT count(*)::int AS c FROM buildings WHERE map_version_id = $1`,
      [draftId],
    );
    expect(afterPub.rows[0].c).toBe(beforePub.rows[0].c);
    expect(afterDraft.rows[0].c).toBe(beforeDraft.rows[0].c);
  });

  it.skipIf(!canUseDb)('unauthenticated requests cannot read preview campus data', async () => {
    const token = await loginAdmin();
    const draftId = await ensureDraft(SITE_P, token);
    const res = await request(app)
      .get(previewPath(draftId, '/campus/buildings'))
      .set('X-Site-Id', SITE_P);
    expect(res.status).toBe(401);
  });

  it.skipIf(!canUseDb)('RNSIT public campus APIs remain backward compatible', async () => {
    const buildings = await request(app).get('/api/campus/buildings').set('X-Site-Id', RNSIT_SITE);
    const nodes = await request(app).get('/api/campus/nodes').set('X-Site-Id', RNSIT_SITE);
    expect(buildings.status).toBe(200);
    expect(nodes.status).toBe(200);
    expect(buildings.body.some((b: { id: string }) => b.id === RNSIT_BUILDING)).toBe(true);
  });
});
