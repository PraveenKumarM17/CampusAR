import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../interfaces/http/app';
import { pool } from '../../infrastructure/db/pool';

const app = createApp();

async function dbReady(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    await pool.query('SELECT 1 FROM indoor_nodes LIMIT 1');
    return true;
  } catch {
    return false;
  }
}

const canUseDb = await dbReady();

describe('indoor API', () => {
  it('rejects indoor route without a source', async () => {
    const res = await request(app).post('/api/indoor/route').send({
      destinationPlaceId: '00000000-0000-4000-8000-000000000001',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it.skipIf(!canUseDb)('returns 404 for unknown QR anchor', async () => {
    const res = await request(app).get('/api/indoor/anchors/NO-SUCH-MARKER');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it.skipIf(!canUseDb)('admin can map a branched multi-floor indoor graph and route with elevator preference', async () => {
    const login = await request(app).post('/api/auth/login').send({
      email: 'admin@smartcampus.edu',
      password: 'admin123',
    });
    expect(login.status).toBe(200);
    const token = login.body.tokens.accessToken as string;
    const auth = { Authorization: `Bearer ${token}` };

    const buildings = await request(app).get('/api/campus/buildings').set(auth);
    expect(buildings.status).toBe(200);
    const buildingId = buildings.body[0].id as string;

    const floorsRes = await request(app).get('/api/campus/floors').query({ buildingId }).set(auth);
    expect(floorsRes.status).toBe(200);
    const floors = floorsRes.body as Array<{ id: string; level: number }>;
    const gf = floors.find((f) => f.level === 0) ?? floors[0];
    const upper = floors.find((f) => f.id !== gf.id) ?? gf;

    const created = await request(app)
      .post('/api/indoor/maps')
      .set(auth)
      .send({ buildingId, name: 'IT Block indoor test' });
    expect(created.status).toBe(201);
    const mapId = created.body.id as string;

    async function addNode(body: Record<string, unknown>) {
      const res = await request(app).post('/api/indoor/nodes').set(auth).send({ mapId, ...body });
      expect(res.status).toBe(201);
      return res.body.id as string;
    }

    const ent = await addNode({ floorId: gf.id, localX: 0, localY: 0, localZ: 0, kind: 'entrance', name: 'Entrance' });
    const n1 = await addNode({ floorId: gf.id, localX: 8, localY: 0, localZ: 0, kind: 'junction', name: 'N1' });
    const elevGf = await addNode({
      floorId: gf.id,
      localX: 2,
      localY: 0,
      localZ: 4,
      kind: 'elevator',
      name: 'Elevator GF',
    });
    const stairsGf = await addNode({
      floorId: gf.id,
      localX: 8,
      localY: 0,
      localZ: 4,
      kind: 'stairs',
      name: 'Stairs GF',
    });
    const elevUp = await addNode({
      floorId: upper.id,
      localX: 2,
      localY: 12,
      localZ: 4,
      kind: 'elevator',
      name: 'Elevator F3',
    });
    const stairsUp = await addNode({
      floorId: upper.id,
      localX: 8,
      localY: 12,
      localZ: 4,
      kind: 'stairs',
      name: 'Stairs F3',
    });
    const room = await addNode({
      floorId: upper.id,
      localX: 16,
      localY: 12,
      localZ: 10,
      kind: 'room_entrance',
      name: 'Room 308',
    });
    const cubicle = await addNode({
      floorId: upper.id,
      localX: 20,
      localY: 12,
      localZ: 14,
      kind: 'destination',
      name: 'Cubicle X',
    });

    const connect = async (fromNodeId: string, toNodeId: string, kind = 'walk') => {
      const res = await request(app).post('/api/indoor/edges').set(auth).send({ mapId, fromNodeId, toNodeId, kind });
      expect(res.status).toBe(201);
    };
    await connect(ent, n1);
    await connect(n1, stairsGf);
    await connect(ent, elevGf);
    await connect(elevGf, elevUp, 'elevator');
    await connect(stairsGf, stairsUp, 'stairs');
    await connect(elevUp, room);
    await connect(stairsUp, room);
    await connect(room, cubicle);

    const place = await request(app).post('/api/indoor/places').set(auth).send({
      mapId,
      floorId: upper.id,
      nodeId: cubicle,
      name: 'Teacher X Cubicle',
      category: 'cubicle',
    });
    expect(place.status).toBe(201);

    const parent = await request(app).post('/api/indoor/places').set(auth).send({
      mapId,
      floorId: upper.id,
      nodeId: room,
      name: 'Room 308',
      category: 'room',
    });
    expect(parent.status).toBe(201);
    await request(app)
      .put(`/api/indoor/places/${place.body.id}`)
      .set(auth)
      .send({ parentPlaceId: parent.body.id });

    const qr = await request(app).post('/api/indoor/anchors').set(auth).send({
      mapId,
      nodeId: ent,
      floorId: gf.id,
      anchorCode: `IT-GF-ENT-${Date.now()}`,
    });
    expect(qr.status).toBe(201);

    const published = await request(app).put(`/api/indoor/maps/${mapId}`).set(auth).send({ status: 'published' });
    expect(published.status).toBe(200);

    const resolved = await request(app).get(`/api/indoor/anchors/${qr.body.anchorCode}`);
    expect(resolved.status).toBe(200);
    expect(resolved.body.anchor.nodeId).toBe(ent);

    const search = await request(app).get('/api/indoor/places/search').query({ q: 'Teacher X' });
    expect(search.status).toBe(200);
    expect(search.body.some((p: { id: string }) => p.id === place.body.id)).toBe(true);

    const scoped = await request(app)
      .get('/api/indoor/places/search')
      .query({ q: 'Teacher X', buildingId });
    expect(scoped.status).toBe(200);
    expect(scoped.body.every((p: { buildingId: string }) => p.buildingId === buildingId)).toBe(true);
    expect(scoped.body.some((p: { id: string }) => p.id === place.body.id)).toBe(true);

    const otherBuilding = (buildings.body as Array<{ id: string }>).find((b) => b.id !== buildingId);
    if (otherBuilding) {
      const otherSearch = await request(app)
        .get('/api/indoor/places/search')
        .query({ q: 'Teacher X', buildingId: otherBuilding.id });
      expect(otherSearch.status).toBe(200);
      expect(otherSearch.body.some((p: { id: string }) => p.id === place.body.id)).toBe(false);

      const mismatch = await request(app)
        .get(`/api/indoor/anchors/${qr.body.anchorCode}`)
        .query({ buildingId: otherBuilding.id });
      expect(mismatch.status).toBe(422);
      expect(mismatch.body.code).toBe('ANCHOR_BUILDING_MISMATCH');
      expect(mismatch.body.message).toContain('Please scan a marker inside');
    }

    const ctx = await request(app).get(`/api/indoor/buildings/${buildingId}/context`);
    expect(ctx.status).toBe(200);
    expect(ctx.body.indoorMap?.id).toBe(mapId);
    expect(ctx.body.building.id).toBe(buildingId);

    const listed = await request(app).get('/api/indoor/places').query({ buildingId });
    expect(listed.status).toBe(200);
    expect(listed.body.some((p: { id: string }) => p.id === place.body.id)).toBe(true);

    const fetched = await request(app).get(`/api/indoor/places/${place.body.id}`).query({ buildingId });
    expect(fetched.status).toBe(200);
    expect(fetched.body.id).toBe(place.body.id);

    const validQr = await request(app)
      .get(`/api/indoor/anchors/${qr.body.anchorCode}`)
      .query({ buildingId });
    expect(validQr.status).toBe(200);

    const routed = await request(app).post('/api/indoor/route').send({
      sourceAnchorCode: qr.body.anchorCode,
      destinationPlaceId: place.body.id,
      expectedBuildingId: buildingId,
      preferences: { wheelchairAccessible: true, avoidStairs: true, preferElevator: true },
    });
    expect(routed.status).toBe(200);
    expect(routed.body.destinationNodeId).toBe(cubicle);
    expect(routed.body.nodes.at(-1).nodeId).toBe(cubicle);
    expect(routed.body.edges.some((e: { kind: string }) => e.kind === 'stairs')).toBe(false);

    await request(app).delete(`/api/indoor/nodes/${n1}`).set(auth);
    const afterDelete = await request(app).get(`/api/indoor/maps/${mapId}`).set(auth);
    expect(afterDelete.body.nodes.find((n: { id: string }) => n.id === n1).active).toBe(false);

    await request(app).put(`/api/indoor/places/${place.body.id}`).set(auth).send({ active: false });
    const deleted = await request(app).get(`/api/indoor/places/${place.body.id}`);
    expect(deleted.status).toBe(404);
  });

  it.skipIf(!canUseDb)('returns building context without an indoor map for outdoor-only buildings', async () => {
    const login = await request(app).post('/api/auth/login').send({
      email: 'admin@smartcampus.edu',
      password: 'admin123',
    });
    expect(login.status).toBe(200);
    const token = login.body.tokens.accessToken as string;
    const buildings = await request(app)
      .get('/api/campus/buildings')
      .set({ Authorization: `Bearer ${token}` });
    expect(buildings.status).toBe(200);

    const missing = await request(app).get(
      '/api/indoor/buildings/00000000-0000-4000-8000-000000000099/context',
    );
    expect(missing.status).toBe(404);

    const target = buildings.body[buildings.body.length - 1] as { id: string };
    const ctx = await request(app).get(`/api/indoor/buildings/${target.id}/context`);
    expect(ctx.status).toBe(200);
    expect(ctx.body.building.id).toBe(target.id);
    expect(ctx.body).toHaveProperty('indoorMap');
    expect(ctx.body).toHaveProperty('entrance');
  });
});
