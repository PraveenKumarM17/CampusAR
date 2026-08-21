import type { SiteMapVersion, SiteMapVersionStatus } from '@campusar/shared';
import { pool, query } from '../db/pool';
import { clonePublishedMapToDraft } from '../../application/mapVersionCloneService';

type VersionRow = {
  id: string;
  site_id: string;
  version_number: number;
  status: SiteMapVersionStatus;
  label: string | null;
  description: string | null;
  based_on_version_id: string | null;
  created_by: string | null;
  published_by: string | null;
  created_at: Date;
  updated_at: Date;
  published_at: Date | null;
  archived_at: Date | null;
};

function mapVersionRow(r: VersionRow): SiteMapVersion {
  return {
    id: r.id,
    siteId: r.site_id,
    versionNumber: Number(r.version_number),
    status: r.status,
    label: r.label,
    description: r.description,
    basedOnVersionId: r.based_on_version_id,
    createdBy: r.created_by,
    publishedBy: r.published_by,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    publishedAt: r.published_at?.toISOString() ?? null,
    archivedAt: r.archived_at?.toISOString() ?? null,
  };
}

export const mapVersionRepository = {
  mapVersionRow,

  async getById(id: string): Promise<SiteMapVersion | null> {
    const { rows } = await query<VersionRow>(`SELECT * FROM site_map_versions WHERE id = $1`, [id]);
    return rows[0] ? mapVersionRow(rows[0]) : null;
  },

  async getPublishedBySite(siteId: string): Promise<SiteMapVersion | null> {
    const { rows } = await query<VersionRow>(
      `SELECT * FROM site_map_versions WHERE site_id = $1 AND status = 'published' LIMIT 1`,
      [siteId],
    );
    return rows[0] ? mapVersionRow(rows[0]) : null;
  },

  async getDraftBySite(siteId: string): Promise<SiteMapVersion | null> {
    const { rows } = await query<VersionRow>(
      `SELECT * FROM site_map_versions WHERE site_id = $1 AND status = 'draft' LIMIT 1`,
      [siteId],
    );
    return rows[0] ? mapVersionRow(rows[0]) : null;
  },

  async listBySite(siteId: string): Promise<SiteMapVersion[]> {
    const { rows } = await query<VersionRow>(
      `SELECT * FROM site_map_versions WHERE site_id = $1 ORDER BY version_number DESC`,
      [siteId],
    );
    return rows.map(mapVersionRow);
  },

  async getSitePublishedPointer(siteId: string): Promise<string | null> {
    const { rows } = await query<{ published_map_version_id: string | null }>(
      `SELECT published_map_version_id FROM sites WHERE id = $1`,
      [siteId],
    );
    return rows[0]?.published_map_version_id ?? null;
  },

  async draftHasSpatialData(draftVersionId: string): Promise<boolean> {
    const { rows } = await query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM buildings WHERE map_version_id = $1
         UNION ALL
         SELECT 1 FROM nodes WHERE map_version_id = $1
         UNION ALL
         SELECT 1 FROM site_areas WHERE map_version_id = $1
       ) AS exists`,
      [draftVersionId],
    );
    return Boolean(rows[0]?.exists);
  },

  async nextVersionNumber(siteId: string, client?: { query: typeof query }): Promise<number> {
    const q = client?.query ?? query;
    const { rows } = await q<{ max: string | null }>(
      `SELECT MAX(version_number)::text AS max FROM site_map_versions WHERE site_id = $1`,
      [siteId],
    );
    return Number(rows[0]?.max ?? 0) + 1;
  },

  async createVersion(
    input: {
      siteId: string;
      versionNumber: number;
      status: SiteMapVersionStatus;
      label?: string | null;
      description?: string | null;
      basedOnVersionId?: string | null;
      createdBy?: string | null;
    },
    client?: { query: typeof query },
  ): Promise<SiteMapVersion> {
    const q = client?.query ?? query;
    const { rows } = await q<VersionRow>(
      `INSERT INTO site_map_versions (
         site_id, version_number, status, label, description, based_on_version_id, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        input.siteId,
        input.versionNumber,
        input.status,
        input.label ?? null,
        input.description ?? null,
        input.basedOnVersionId ?? null,
        input.createdBy ?? null,
      ],
    );
    return mapVersionRow(rows[0]);
  },

  async ensureInitialPublished(siteId: string): Promise<SiteMapVersion> {
    const existing = await this.getPublishedBySite(siteId);
    if (existing) {
      await query(
        `UPDATE sites SET published_map_version_id = $2 WHERE id = $1 AND published_map_version_id IS NULL`,
        [siteId, existing.id],
      );
      return existing;
    }
    const created = await this.createVersion({
      siteId,
      versionNumber: 1,
      status: 'published',
      label: 'Initial published map',
    });
    await query(`UPDATE site_map_versions SET published_at = NOW() WHERE id = $1`, [created.id]);
    await query(`UPDATE sites SET published_map_version_id = $2 WHERE id = $1`, [siteId, created.id]);
    return { ...created, publishedAt: new Date().toISOString() };
  },

  async createDraftInTransaction(
    siteId: string,
    userId: string | null,
    basedOnVersionId: string | null,
    versionNumber: number,
    publishedVersionId: string,
  ): Promise<SiteMapVersion> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: locked } = await client.query<{ id: string }>(
        `SELECT id FROM sites WHERE id = $1 FOR UPDATE`,
        [siteId],
      );
      if (!locked[0]) {
        await client.query('ROLLBACK');
        throw new Error('SITE_NOT_FOUND');
      }
      const { rows: existingDraft } = await client.query<VersionRow>(
        `SELECT * FROM site_map_versions WHERE site_id = $1 AND status = 'draft' LIMIT 1`,
        [siteId],
      );
      if (existingDraft[0]) {
        const draft = mapVersionRow(existingDraft[0]);
        const { rows: hasSpatial } = await client.query<{ exists: boolean }>(
          `SELECT EXISTS (SELECT 1 FROM buildings WHERE map_version_id = $1) AS exists`,
          [draft.id],
        );
        if (!hasSpatial[0]?.exists && basedOnVersionId) {
          await clonePublishedMapToDraft(client, siteId, publishedVersionId, draft.id);
        }
        await client.query('COMMIT');
        return draft;
      }
      const { rows: inserted } = await client.query<VersionRow>(
        `INSERT INTO site_map_versions (
           site_id, version_number, status, label, based_on_version_id, created_by
         ) VALUES ($1,$2,'draft',$3,$4,$5)
         RETURNING *`,
        [siteId, versionNumber, 'Draft', basedOnVersionId, userId],
      );
      const draft = mapVersionRow(inserted[0]);
      await clonePublishedMapToDraft(client, siteId, publishedVersionId, draft.id);
      await client.query('COMMIT');
      return draft;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
};
