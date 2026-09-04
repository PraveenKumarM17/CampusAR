import type { SiteArea, SiteAreaType } from '@campusar/shared';
import { AppError } from '../../domain/errors';
import { footprintFromGeoJson, ringToWkt, type LatLng } from '../../application/geometry';
import { query } from '../db/pool';
import { ringGeometryHash } from '../../application/geometryHash';

function toIsoTimestamp(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value.length > 0) return value;
  return undefined;
}

function mapAreaRow(r: Record<string, unknown>): SiteArea {
  const footprint = footprintFromGeoJson(r.footprint_geojson) ?? [];
  return {
    id: r.id as string,
    stableId: r.stable_id as string,
    siteId: r.site_id as string,
    name: r.name as string,
    type: r.type as SiteAreaType,
    footprint,
    updatedAt: toIsoTimestamp(r.updated_at),
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

const AREA_SELECT = `
  SELECT id, stable_id, site_id, name, type, updated_at,
         CASE WHEN footprint_geom IS NOT NULL
           THEN ST_AsGeoJSON(footprint_geom)::json
           ELSE NULL END AS footprint_geojson
`;

export const siteAreaRepository = {
  async listBySite(siteId: string, mapVersionId: string): Promise<SiteArea[]> {
    const { rows } = await query(
      `${AREA_SELECT}
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
    const { rows } = await query(`${AREA_SELECT} FROM site_areas WHERE id = $1`, [id]);
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
      `INSERT INTO site_areas (site_id, name, type, footprint_geom, map_version_id, geometry_hash)
       VALUES ($1, $2, $3, ST_GeogFromText($4)::geography, $5, $6)
       RETURNING id, stable_id, site_id, name, type, updated_at,
         ST_AsGeoJSON(footprint_geom)::json AS footprint_geojson`,
      [input.siteId, input.name, input.type, wkt, input.mapVersionId, ringGeometryHash(input.footprint)],
    );
    return mapAreaRow(rows[0] as Record<string, unknown>);
  },

  async update(
    id: string,
    input: Partial<{ name: string; type: SiteAreaType; footprint: LatLng[] }> & {
      expectedUpdatedAt?: string;
    },
  ): Promise<SiteArea | null> {
    const expectedUpdatedAt = input.expectedUpdatedAt ? new Date(input.expectedUpdatedAt) : null;

    if (input.footprint) {
      const wkt = ringToWkt(input.footprint);
      await validatePolygon(wkt);
      const { rows } = await query(
        `UPDATE site_areas SET
           name = COALESCE($2, name),
           type = COALESCE($3, type),
           footprint_geom = COALESCE(ST_GeogFromText($4)::geography, footprint_geom),
           geometry_hash = $5,
           updated_at = NOW()
         WHERE id = $1
           AND ($6::timestamptz IS NULL OR date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $6::timestamptz))
         RETURNING id, stable_id, site_id, name, type, updated_at,
           ST_AsGeoJSON(footprint_geom)::json AS footprint_geojson`,
        [
          id,
          input.name ?? null,
          input.type ?? null,
          wkt,
          ringGeometryHash(input.footprint),
          expectedUpdatedAt,
        ],
      );
      if (!rows[0]) {
        const still = await this.getById(id);
        if (still && input.expectedUpdatedAt) {
          throw new AppError(
            'STALE_EDIT',
            'This area was modified elsewhere. Reload and try again.',
            409,
          );
        }
        return null;
      }
      return mapAreaRow(rows[0] as Record<string, unknown>);
    }

    const { rows } = await query(
      `UPDATE site_areas SET
         name = COALESCE($2, name),
         type = COALESCE($3, type),
         updated_at = NOW()
       WHERE id = $1
         AND ($4::timestamptz IS NULL OR date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $4::timestamptz))
       RETURNING id, stable_id, site_id, name, type, updated_at,
         ST_AsGeoJSON(footprint_geom)::json AS footprint_geojson`,
      [id, input.name ?? null, input.type ?? null, expectedUpdatedAt],
    );
    if (!rows[0]) {
      const still = await this.getById(id);
      if (still && input.expectedUpdatedAt) {
        throw new AppError(
          'STALE_EDIT',
          'This area was modified elsewhere. Reload and try again.',
          409,
        );
      }
      return null;
    }
    return mapAreaRow(rows[0] as Record<string, unknown>);
  },

  async delete(id: string): Promise<void> {
    await query(`DELETE FROM site_areas WHERE id = $1`, [id]);
  },
};
