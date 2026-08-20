import type { MembershipRole, Organization, OrganizationType, Site, SiteStatus } from '@campusar/shared';
import { query } from '../db/pool';

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  type: OrganizationType;
  created_at: Date;
  updated_at: Date;
}

interface SiteRow {
  id: string;
  organization_id: string;
  organization_name: string;
  organization_slug: string;
  name: string;
  slug: string;
  latitude: number;
  longitude: number;
  timezone: string;
  status: SiteStatus;
  created_at: Date;
  updated_at: Date;
}

function mapOrg(row: OrgRow): Organization {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    type: row.type,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapSite(row: SiteRow): Site {
  return {
    id: row.id,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    organizationSlug: row.organization_slug,
    name: row.name,
    slug: row.slug,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    timezone: row.timezone,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const SITE_SELECT = `
  SELECT s.id, s.organization_id, o.name AS organization_name, o.slug AS organization_slug,
         s.name, s.slug, s.latitude, s.longitude, s.timezone, s.status, s.created_at, s.updated_at
  FROM sites s
  JOIN organizations o ON o.id = s.organization_id
`;

export const siteRepository = {
  async getById(id: string): Promise<Site | null> {
    const { rows } = await query<SiteRow>(`${SITE_SELECT} WHERE s.id = $1`, [id]);
    return rows[0] ? mapSite(rows[0]) : null;
  },

  async getBySlug(orgSlug: string, siteSlug: string): Promise<Site | null> {
    const { rows } = await query<SiteRow>(
      `${SITE_SELECT} WHERE o.slug = $1 AND s.slug = $2`,
      [orgSlug, siteSlug],
    );
    return rows[0] ? mapSite(rows[0]) : null;
  },

  async getDefaultSite(): Promise<Site | null> {
    const { rows } = await query<SiteRow>(
      `${SITE_SELECT} WHERE s.status = 'active' ORDER BY s.created_at ASC, s.id ASC LIMIT 1`,
    );
    return rows[0] ? mapSite(rows[0]) : null;
  },

  async listActive(): Promise<Site[]> {
    const { rows } = await query<SiteRow>(
      `${SITE_SELECT} WHERE s.status = 'active' ORDER BY o.name, s.name`,
    );
    return rows.map(mapSite);
  },

  async listForUser(userId: string): Promise<Site[]> {
    const { rows } = await query<SiteRow>(
      `${SITE_SELECT}
       JOIN organization_memberships m ON m.organization_id = o.id
       WHERE m.user_id = $1
         AND s.status = 'active'
         AND (m.site_id IS NULL OR m.site_id = s.id)
       ORDER BY o.name, s.name`,
      [userId],
    );
    return rows.map(mapSite);
  },

  async listEditableForUser(userId: string): Promise<Site[]> {
    const { rows } = await query<SiteRow>(
      `${SITE_SELECT}
       JOIN organization_memberships m ON m.organization_id = o.id
       WHERE m.user_id = $1
         AND s.status = 'active'
         AND m.role IN ('org_admin', 'site_admin')
         AND (m.site_id IS NULL OR m.site_id = s.id)
       ORDER BY o.name, s.name`,
      [userId],
    );
    return rows.map(mapSite);
  },

  async canUserEditAnySite(userId: string, platformAdmin: boolean): Promise<boolean> {
    if (platformAdmin) return true;
    const editable = await this.listEditableForUser(userId);
    return editable.length > 0;
  },

  async getOrganization(id: string): Promise<Organization | null> {
    const { rows } = await query<OrgRow>(`SELECT * FROM organizations WHERE id = $1`, [id]);
    return rows[0] ? mapOrg(rows[0]) : null;
  },

  async listOrganizations(): Promise<Organization[]> {
    const { rows } = await query<OrgRow>(`SELECT * FROM organizations ORDER BY name`);
    return rows.map(mapOrg);
  },

  async membershipRole(
    userId: string,
    organizationId: string,
  ): Promise<MembershipRole | null> {
    const { rows } = await query<{ role: MembershipRole }>(
      `SELECT role FROM organization_memberships WHERE user_id = $1 AND organization_id = $2`,
      [userId, organizationId],
    );
    return rows[0]?.role ?? null;
  },
};
