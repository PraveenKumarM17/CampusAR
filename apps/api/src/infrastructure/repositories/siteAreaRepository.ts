import type { SiteArea, SiteAreaType } from '@campusar/shared';
import { AppError } from '../../domain/errors';
import { footprintFromGeoJson, ringToWkt, type LatLng } from '../../application/geometry';
import { query } from '../db/pool';

function mapAreaRow(r: Record<string, unknown>): SiteArea {
  const footprint = footprintFromGeoJson(r.footprint_geojson) ?? [];
  return {
    id: r.id as string,
    siteId: r.site_id as string,
    name: r.name as string,
    type: r.type as SiteAreaType,
    footprint,
  };
}

async function validatePolygon(wkt: string): Promise<void> {
  const { rows } = await query<{ valid: boolean }>(
    `SELECT ST_IsValid(ST_GeogFromText($1)::geometry) AS valid`,
    [wkt],
  );
  if (!rows[0]?.valid) {
    throw new AppError('INVALID_GEOMETRY', 'Polygon geometry is invalid', 422);
  }
}

export const siteAreaRepository = {
  async listBySite(siteId: string, mapVersionId: string): Promise<SiteArea[]> {
    const { rows } = await query(
      `SELECT id, site_id, name, type,
              CASE WHEN footprint_geom IS NOT NULL
                THEN ST_AsGeoJSON(footprint_geom)::json
                ELSE NULL END AS footprint_geojson
       FROM site_areas WHERE site_id = $1 AND map_version_id = $2 ORDER BY name`,
      [siteId, mapVersionId],
    );
    return (rows as Array<Record<string, unknown>>).map(mapAreaRow);
  },

  async getMapVersionId(id: string): Promise<string | null> {
    const { rows } = await query<{ map_version_id: string | null }>(
      `SELECT map_version_id FROM site_areas WHERE id = $1`,
      [id],
    );
    return rows[0]?.map_version_id ?? null;
  },

  async getById(id: string): Promise<SiteArea | null> {
    const { rows } = await query(
      `SELECT id, site_id, name, type,
              CASE WHEN footprint_geom IS NOT NULL
                THEN ST_AsGeoJSON(footprint_geom)::json
                ELSE NULL END AS footprint_geojson
       FROM site_areas WHERE id = $1`,
      [id],
    );
    if (!rows[0]) return null;
    return mapAreaRow(rows[0] as Record<string, unknown>);
  },

  async create(input: {
    siteId: string;
    mapVersionId: string;
    name: string;
    type: SiteAreaType;
    footprint: LatLng[];
  }): Promise<SiteArea> {
    const wkt = ringToWkt(input.footprint);
    await validatePolygon(wkt);
    const { rows } = await query(
      `INSERT INTO site_areas (site_id, name, type, footprint_geom, map_version_id)
       VALUES ($1, $2, $3, ST_GeogFromText($4)::geography, $5)
       RETURNING id, site_id, name, type,
         ST_AsGeoJSON(footprint_geom)::json AS footprint_geojson`,
      [input.siteId, input.name, input.type, wkt, input.mapVersionId],
    );
    return mapAreaRow(rows[0] as Record<string, unknown>);
  },

  async update(
    id: string,
    input: Partial<{ name: string; type: SiteAreaType; footprint: LatLng[] }>,
  ): Promise<SiteArea | null> {
    if (input.footprint) {
      const wkt = ringToWkt(input.footprint);
      await validatePolygon(wkt);
      const { rows } = await query(
        `UPDATE site_areas SET
           name = COALESCE($2, name),
           type = COALESCE($3, type),
           footprint_geom = COALESCE(ST_GeogFromText($4)::geography, footprint_geom),
           updated_at = NOW()
         WHERE id = $1
         RETURNING id, site_id, name, type, ST_AsGeoJSON(footprint_geom)::json AS footprint_geojson`,
        [id, input.name ?? null, input.type ?? null, wkt],
      );
      if (!rows[0]) return null;
      return mapAreaRow(rows[0] as Record<string, unknown>);
    }
    const { rows } = await query(
      `UPDATE site_areas SET
         name = COALESCE($2, name),
         type = COALESCE($3, type),
         updated_at = NOW()
       WHERE id = $1
       RETURNING id, site_id, name, type, ST_AsGeoJSON(footprint_geom)::json AS footprint_geojson`,
      [id, input.name ?? null, input.type ?? null],
    );
    if (!rows[0]) return null;
    return mapAreaRow(rows[0] as Record<string, unknown>);
  },

  async delete(id: string): Promise<void> {
    await query(`DELETE FROM site_areas WHERE id = $1`, [id]);
  },
};
