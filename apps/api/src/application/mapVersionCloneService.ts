import { randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import { AppError } from '../domain/errors';

class IdMap {
  private readonly map = new Map<string, string>();

  set(oldId: string, newId: string): void {
    this.map.set(oldId, newId);
  }

  remap(oldId: string | null | undefined): string | null {
    if (oldId == null) return null;
    const mapped = this.map.get(oldId);
    if (!mapped) {
      throw new AppError('CLONE_REMAP_FAILED', `Missing clone mapping for ${oldId}`, 500);
    }
    return mapped;
  }
}

/**
 * Transactional full clone: published site map → draft version with new UUIDs.
 * Must run inside an open transaction on `client`.
 */
export async function clonePublishedMapToDraft(
  client: PoolClient,
  siteId: string,
  publishedVersionId: string,
  draftVersionId: string,
): Promise<void> {
  const buildings = new IdMap();
  const floors = new IdMap();
  const nodes = new IdMap();
  const maps = new IdMap();
  const indoorNodes = new IdMap();
  const places = new IdMap();
  const anchors = new IdMap();

  const suffix = draftVersionId.slice(0, 8);

  // 1. Buildings
  const { rows: buildingRows } = await client.query(
    `SELECT * FROM buildings WHERE site_id = $1 AND map_version_id = $2`,
    [siteId, publishedVersionId],
  );
  for (const b of buildingRows) {
    const newId = randomUUID();
    buildings.set(b.id, newId);
    await client.query(
      `INSERT INTO buildings (
         id, site_id, name, code, description, latitude, longitude, floors_count,
         footprint_geom, updated_at, map_version_id
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8,
         $9, NOW(), $10
       )`,
      [
        newId,
        b.site_id,
        b.name,
        b.code,
        b.description,
        b.latitude,
        b.longitude,
        b.floors_count,
        b.footprint_geom,
        draftVersionId,
      ],
    );
  }

  // 2. Floors
  const { rows: floorRows } = await client.query(
    `SELECT f.* FROM floors f
     JOIN buildings b ON b.id = f.building_id
     WHERE b.site_id = $1 AND f.map_version_id = $2`,
    [siteId, publishedVersionId],
  );
  for (const f of floorRows) {
    const newId = randomUUID();
    floors.set(f.id, newId);
    await client.query(
      `INSERT INTO floors (id, building_id, level, name, updated_at, map_version_id)
       VALUES ($1, $2, $3, $4, NOW(), $5)`,
      [newId, buildings.remap(f.building_id), f.level, f.name, draftVersionId],
    );
  }

  // 3. Outdoor nodes (before rooms so node_id can remap)
  const { rows: nodeRows } = await client.query(
    `SELECT * FROM nodes WHERE site_id = $1 AND map_version_id = $2`,
    [siteId, publishedVersionId],
  );
  for (const n of nodeRows) {
    const newId = randomUUID();
    nodes.set(n.id, newId);
    await client.query(
      `INSERT INTO nodes (
         id, site_id, name, latitude, longitude, floor_id, building_id, kind, active, map_version_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        newId,
        n.site_id,
        n.name,
        n.latitude,
        n.longitude,
        floors.remap(n.floor_id),
        buildings.remap(n.building_id),
        n.kind,
        n.active,
        draftVersionId,
      ],
    );
  }

  // 4. Rooms
  const { rows: roomRows } = await client.query(
    `SELECT r.* FROM rooms r
     JOIN buildings b ON b.id = r.building_id
     WHERE b.site_id = $1 AND r.map_version_id = $2`,
    [siteId, publishedVersionId],
  );
  for (const r of roomRows) {
    const newId = randomUUID();
    await client.query(
      `INSERT INTO rooms (
         id, floor_id, building_id, name, code, category, node_id,
         wheelchair_accessible, local_geometry, updated_at, map_version_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),$10)`,
      [
        newId,
        floors.remap(r.floor_id),
        buildings.remap(r.building_id),
        r.name,
        r.code,
        r.category,
        nodes.remap(r.node_id),
        r.wheelchair_accessible,
        r.local_geometry,
        draftVersionId,
      ],
    );
  }

  // 5. Floor corridors
  const { rows: corridorRows } = await client.query(
    `SELECT c.* FROM floor_corridors c
     JOIN buildings b ON b.id = c.building_id
     WHERE b.site_id = $1 AND c.map_version_id = $2`,
    [siteId, publishedVersionId],
  );
  for (const c of corridorRows) {
    await client.query(
      `INSERT INTO floor_corridors (
         id, floor_id, building_id, name, category, local_geometry, updated_at, created_at, map_version_id
       ) VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW(),$7)`,
      [
        randomUUID(),
        floors.remap(c.floor_id),
        buildings.remap(c.building_id),
        c.name,
        c.category,
        c.local_geometry,
        draftVersionId,
      ],
    );
  }

  // 6. Floor POIs
  const { rows: poiRows } = await client.query(
    `SELECT p.* FROM floor_pois p
     JOIN buildings b ON b.id = p.building_id
     WHERE b.site_id = $1 AND p.map_version_id = $2`,
    [siteId, publishedVersionId],
  );
  for (const p of poiRows) {
    await client.query(
      `INSERT INTO floor_pois (
         id, floor_id, building_id, name, category, local_x, local_y, updated_at, created_at, map_version_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW(),$8)`,
      [
        randomUUID(),
        floors.remap(p.floor_id),
        buildings.remap(p.building_id),
        p.name,
        p.category,
        p.local_x,
        p.local_y,
        draftVersionId,
      ],
    );
  }

  // 7. Outdoor edges
  const { rows: edgeRows } = await client.query(
    `SELECT * FROM edges WHERE site_id = $1 AND map_version_id = $2`,
    [siteId, publishedVersionId],
  );
  for (const e of edgeRows) {
    await client.query(
      `INSERT INTO edges (
         id, site_id, from_node_id, to_node_id, distance_m, kind, bidirectional, blocked,
         safety_score, crowd_score, accessibility_score, map_version_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        randomUUID(),
        e.site_id,
        nodes.remap(e.from_node_id),
        nodes.remap(e.to_node_id),
        e.distance_m,
        e.kind,
        e.bidirectional,
        e.blocked,
        e.safety_score,
        e.crowd_score,
        e.accessibility_score,
        draftVersionId,
      ],
    );
  }

  // 8. Site areas
  const { rows: areaRows } = await client.query(
    `SELECT * FROM site_areas WHERE site_id = $1 AND map_version_id = $2`,
    [siteId, publishedVersionId],
  );
  for (const a of areaRows) {
    await client.query(
      `INSERT INTO site_areas (id, site_id, name, type, footprint_geom, created_at, updated_at, map_version_id)
       VALUES ($1,$2,$3,$4,$5,NOW(),NOW(),$6)`,
      [randomUUID(), a.site_id, a.name, a.type, a.footprint_geom, draftVersionId],
    );
  }

  // 9. Indoor maps (draft status for editable clone)
  const { rows: mapRows } = await client.query(
    `SELECT im.* FROM indoor_maps im
     JOIN buildings b ON b.id = im.building_id
     WHERE b.site_id = $1 AND im.map_version_id = $2`,
    [siteId, publishedVersionId],
  );
  for (const m of mapRows) {
    const newId = randomUUID();
    maps.set(m.id, newId);
    await client.query(
      `INSERT INTO indoor_maps (
         id, building_id, name, status, origin_anchor_id, tracking_quality, plane_count,
         confidence, notes, created_by, created_at, updated_at, active, map_version_id
       ) VALUES ($1,$2,$3,'draft',NULL,$4,$5,$6,$7,$8,NOW(),NOW(),$9,$10)`,
      [
        newId,
        buildings.remap(m.building_id),
        m.name,
        m.tracking_quality,
        m.plane_count,
        m.confidence,
        m.notes,
        m.created_by,
        m.active,
        draftVersionId,
      ],
    );
  }

  // 10. Indoor nodes
  const { rows: inNodeRows } = await client.query(
    `SELECT ino.* FROM indoor_nodes ino
     JOIN indoor_maps im ON im.id = ino.map_id
     JOIN buildings b ON b.id = im.building_id
     WHERE b.site_id = $1 AND ino.map_version_id = $2`,
    [siteId, publishedVersionId],
  );
  for (const n of inNodeRows) {
    const newId = randomUUID();
    indoorNodes.set(n.id, newId);
    await client.query(
      `INSERT INTO indoor_nodes (
         id, map_id, building_id, floor_id, anchor_id, local_x, local_y, local_z, kind, name,
         category, accuracy_m, tracking_quality, active, map_version_id
       ) VALUES ($1,$2,$3,$4,NULL,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        newId,
        maps.remap(n.map_id),
        buildings.remap(n.building_id),
        floors.remap(n.floor_id),
        n.local_x,
        n.local_y,
        n.local_z,
        n.kind,
        n.name,
        n.category,
        n.accuracy_m,
        n.tracking_quality,
        n.active,
        draftVersionId,
      ],
    );
  }

  // 11. Indoor edges
  const { rows: inEdgeRows } = await client.query(
    `SELECT ie.* FROM indoor_edges ie
     JOIN indoor_maps im ON im.id = ie.map_id
     JOIN buildings b ON b.id = im.building_id
     WHERE b.site_id = $1 AND ie.map_version_id = $2`,
    [siteId, publishedVersionId],
  );
  for (const e of inEdgeRows) {
    await client.query(
      `INSERT INTO indoor_edges (
         id, map_id, building_id, from_floor_id, to_floor_id, from_node_id, to_node_id,
         distance_m, kind, bidirectional, wheelchair_accessible, waypoints, active, map_version_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        randomUUID(),
        maps.remap(e.map_id),
        buildings.remap(e.building_id),
        floors.remap(e.from_floor_id),
        floors.remap(e.to_floor_id),
        indoorNodes.remap(e.from_node_id),
        indoorNodes.remap(e.to_node_id),
        e.distance_m,
        e.kind,
        e.bidirectional,
        e.wheelchair_accessible,
        e.waypoints,
        e.active,
        draftVersionId,
      ],
    );
  }

  // 12. Indoor places (two passes for parent_place_id)
  const { rows: placeRows } = await client.query(
    `SELECT ip.* FROM indoor_places ip
     JOIN indoor_maps im ON im.id = ip.map_id
     JOIN buildings b ON b.id = im.building_id
     WHERE b.site_id = $1 AND ip.map_version_id = $2
     ORDER BY ip.parent_place_id NULLS FIRST`,
    [siteId, publishedVersionId],
  );
  for (const p of placeRows) {
    const newId = randomUUID();
    places.set(p.id, newId);
    await client.query(
      `INSERT INTO indoor_places (
         id, map_id, building_id, floor_id, node_id, parent_place_id, name, category,
         searchable, metadata, active, map_version_id
       ) VALUES ($1,$2,$3,$4,$5,NULL,$6,$7,$8,$9,$10,$11)`,
      [
        newId,
        maps.remap(p.map_id),
        buildings.remap(p.building_id),
        floors.remap(p.floor_id),
        indoorNodes.remap(p.node_id),
        p.name,
        p.category,
        p.searchable,
        p.metadata,
        p.active,
        draftVersionId,
      ],
    );
  }
  for (const p of placeRows) {
    if (!p.parent_place_id) continue;
    await client.query(`UPDATE indoor_places SET parent_place_id = $2 WHERE id = $1`, [
      places.remap(p.id),
      places.remap(p.parent_place_id),
    ]);
  }

  // 13. Indoor anchors (new anchor codes for global uniqueness)
  const { rows: anchorRows } = await client.query(
    `SELECT ia.* FROM indoor_anchors ia
     JOIN indoor_maps im ON im.id = ia.map_id
     JOIN buildings b ON b.id = im.building_id
     WHERE b.site_id = $1 AND ia.map_version_id = $2`,
    [siteId, publishedVersionId],
  );
  for (const a of anchorRows) {
    const newId = randomUUID();
    anchors.set(a.id, newId);
    const newCode = `${a.anchor_code}-d${suffix}`;
    await client.query(
      `INSERT INTO indoor_anchors (
         id, map_id, building_id, floor_id, node_id, anchor_code, physical_marker_type,
         local_x, local_y, local_z, active, map_version_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        newId,
        maps.remap(a.map_id),
        buildings.remap(a.building_id),
        floors.remap(a.floor_id),
        indoorNodes.remap(a.node_id),
        newCode,
        a.physical_marker_type,
        a.local_x,
        a.local_y,
        a.local_z,
        a.active,
        draftVersionId,
      ],
    );
  }

  // 14. Update indoor_maps.origin_anchor_id
  for (const m of mapRows) {
    if (!m.origin_anchor_id) continue;
    const newMapId = maps.remap(m.id);
    const newAnchorId = anchors.remap(m.origin_anchor_id);
    if (newMapId && newAnchorId) {
      await client.query(`UPDATE indoor_maps SET origin_anchor_id = $2 WHERE id = $1`, [
        newMapId,
        newAnchorId,
      ]);
    }
  }

  // 15. Indoor handoffs
  const { rows: handoffRows } = await client.query(
    `SELECT ih.* FROM indoor_handoffs ih
     JOIN indoor_maps im ON im.id = ih.map_id
     JOIN buildings b ON b.id = im.building_id
     WHERE b.site_id = $1 AND ih.map_version_id = $2`,
    [siteId, publishedVersionId],
  );
  for (const h of handoffRows) {
    await client.query(
      `INSERT INTO indoor_handoffs (
         id, outdoor_node_id, indoor_node_id, building_id, map_id, prompt, active, map_version_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        randomUUID(),
        nodes.remap(h.outdoor_node_id),
        indoorNodes.remap(h.indoor_node_id),
        buildings.remap(h.building_id),
        maps.remap(h.map_id),
        h.prompt,
        h.active,
        draftVersionId,
      ],
    );
  }
}
