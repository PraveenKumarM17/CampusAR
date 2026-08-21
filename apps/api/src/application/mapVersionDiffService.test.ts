import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../infrastructure/db/pool';
import { mapVersionService } from './mapVersionService';
import { mapVersionDiffService } from './mapVersionDiffService';
import { pointGeometryHash } from './geometryHash';

const ORG_ID = '9a000001-0000-4000-8000-000000000001';
const SITE_ID = '9a000001-0000-4000-8000-000000000002';

async function dbReady(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

const canUseDb = await dbReady();

async function seedSite() {
  await pool.query(
    `INSERT INTO organizations (id, name, slug, type)
     VALUES ($1, 'Diff Org', 'diff-org', 'corporate')
     ON CONFLICT (id) DO NOTHING`,
    [ORG_ID],
  );
  await pool.query(
    `INSERT INTO sites (id, organization_id, name, slug, latitude, longitude, timezone, status)
     VALUES ($1, $2, 'Diff Site', 'diff-site', 13.0, 77.0, 'Asia/Kolkata', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [SITE_ID, ORG_ID],
  );
}

async function resetPublishedData() {
  await pool.query(`DELETE FROM site_map_versions WHERE site_id = $1`, [SITE_ID]);
  await pool.query(`UPDATE sites SET published_map_version_id = NULL WHERE id = $1`, [SITE_ID]);
  const published = await mapVersionService.getPublishedVersion(SITE_ID);

  const { rows: buildingRows } = await pool.query<{ id: string }>(
    `INSERT INTO buildings (site_id, map_version_id, name, code, latitude, longitude, floors_count, geometry_hash)
     VALUES ($1, $2, 'Base Building', 'DBASE', 13.0, 77.0, 1, $3)
     RETURNING id`,
    [SITE_ID, published.id, pointGeometryHash(13.0, 77.0)],
  );
  const buildingId = buildingRows[0]!.id;

  const { rows: nodeRows } = await pool.query<{ id: string }>(
    `INSERT INTO nodes (site_id, map_version_id, name, latitude, longitude, building_id, kind, geometry_hash)
     VALUES
       ($1, $2, 'Node A', 13.0001, 77.0001, $3, 'outdoor', $4),
       ($1, $2, 'Node B', 13.0002, 77.0002, $3, 'outdoor', $5)
     RETURNING id`,
    [
      SITE_ID,
      published.id,
      buildingId,
      pointGeometryHash(13.0001, 77.0001),
      pointGeometryHash(13.0002, 77.0002),
    ],
  );
  await pool.query(
    `INSERT INTO edges (
      site_id, map_version_id, from_node_id, to_node_id, distance_m, kind,
      bidirectional, blocked, safety_score, crowd_score, accessibility_score, geometry_hash
    )
    VALUES ($1, $2, $3, $4, 20, 'walkway', TRUE, FALSE, 0.9, 0.2, 0.9, $5)`,
    [SITE_ID, published.id, nodeRows[0]!.id, nodeRows[1]!.id, pointGeometryHash(13.00015, 77.00015)],
  );
}

describe('mapVersionDiffService', () => {
  beforeAll(async () => {
    if (canUseDb) await seedSite();
  });

  beforeEach(async () => {
    if (canUseDb) await resetPublishedData();
  });

  afterAll(async () => {
    if (!canUseDb) return;
    await pool.query(`DELETE FROM site_map_versions WHERE site_id = $1`, [SITE_ID]);
    await pool.query(`UPDATE sites SET published_map_version_id = NULL WHERE id = $1`, [SITE_ID]);
    await pool.query(`DELETE FROM sites WHERE id = $1`, [SITE_ID]);
    await pool.query(`DELETE FROM organizations WHERE id = $1`, [ORG_ID]);
  });

  it.skipIf(!canUseDb)('returns empty diff for no-op clone', async () => {
    const published = await mapVersionService.getPublishedVersion(SITE_ID);
    const draft = await mapVersionService.getOrCreateDraftVersion(SITE_ID, null);
    const diff = await mapVersionDiffService.computeDiff(draft.id, published.id);
    expect(diff.summary).toEqual({ added: 0, removed: 0, modified: 0 });
  });

  it.skipIf(!canUseDb)('captures add/remove/modify buckets with stable ids', async () => {
    const published = await mapVersionService.getPublishedVersion(SITE_ID);
    const draft = await mapVersionService.getOrCreateDraftVersion(SITE_ID, null);

    await pool.query(
      `INSERT INTO buildings (site_id, map_version_id, name, code, latitude, longitude, floors_count, geometry_hash)
       VALUES
         ($1, $2, 'Added One', 'ADD1', 13.1, 77.1, 1, $3),
         ($1, $2, 'Added Two', 'ADD2', 13.2, 77.2, 1, $4)`,
      [SITE_ID, draft.id, pointGeometryHash(13.1, 77.1), pointGeometryHash(13.2, 77.2)],
    );

    await pool.query(
      `UPDATE buildings SET name = 'Base Building Renamed' WHERE map_version_id = $1 AND code = 'DBASE'`,
      [draft.id],
    );

    await pool.query(
      `DELETE FROM nodes
       WHERE id IN (
         SELECT id FROM nodes WHERE map_version_id = $1 ORDER BY name ASC LIMIT 1
       )`,
      [draft.id],
    );

    const diff = await mapVersionDiffService.computeDiff(draft.id, published.id);
    expect(diff.summary.added).toBeGreaterThanOrEqual(2);
    expect(diff.summary.removed).toBeGreaterThanOrEqual(1);
    expect(diff.summary.modified).toBeGreaterThanOrEqual(1);
    expect(diff.modified.some((m) => m.changedFields.includes('name'))).toBe(true);
  });

  it.skipIf(!canUseDb)('ignores geometry drift below epsilon', async () => {
    const published = await mapVersionService.getPublishedVersion(SITE_ID);
    const draft = await mapVersionService.getOrCreateDraftVersion(SITE_ID, null);
    const row = await pool.query<{ id: string; latitude: number; longitude: number }>(
      `SELECT id, latitude, longitude FROM nodes WHERE map_version_id = $1 ORDER BY name ASC LIMIT 1`,
      [draft.id],
    );
    const n = row.rows[0]!;
    const lat = n.latitude + 0.000001;
    await pool.query(`UPDATE nodes SET latitude = $2, geometry_hash = $3 WHERE id = $1`, [
      n.id,
      lat,
      pointGeometryHash(lat, n.longitude),
    ]);
    const diff = await mapVersionDiffService.computeDiff(draft.id, published.id, undefined, 0.5);
    const nodeHit = diff.modified.find((m) => m.featureType === 'node' && m.id === n.id);
    expect(nodeHit).toBeUndefined();
  });

  it.skipIf(!canUseDb)('flags geometry drift above epsilon', async () => {
    const published = await mapVersionService.getPublishedVersion(SITE_ID);
    const draft = await mapVersionService.getOrCreateDraftVersion(SITE_ID, null);
    const row = await pool.query<{ id: string; latitude: number; longitude: number }>(
      `SELECT id, latitude, longitude FROM nodes WHERE map_version_id = $1 ORDER BY name ASC LIMIT 1`,
      [draft.id],
    );
    const n = row.rows[0]!;
    const lat = n.latitude + 0.00002;
    await pool.query(`UPDATE nodes SET latitude = $2, geometry_hash = $3 WHERE id = $1`, [
      n.id,
      lat,
      pointGeometryHash(lat, n.longitude),
    ]);
    const diff = await mapVersionDiffService.computeDiff(draft.id, published.id, undefined, 0.5);
    const nodeHit = diff.modified.find((m) => m.featureType === 'node' && m.id === n.id);
    expect(nodeHit).toBeTruthy();
    expect(nodeHit?.changedFields.includes('geometry')).toBe(true);
  });
});
