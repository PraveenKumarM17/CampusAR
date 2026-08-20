import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../domain/errors';

vi.mock('../infrastructure/repositories/siteRepository', () => ({
  siteRepository: {
    getById: vi.fn(),
    membershipRole: vi.fn(),
    listForUser: vi.fn(),
    listEditableForUser: vi.fn(),
  },
}));

import { siteRepository } from '../infrastructure/repositories/siteRepository';
import { assertCanEditSite, assertSameSite, resolveEditorSiteId } from './siteContext';
import type { AuthedRequest } from '../interfaces/http/middleware/auth';

const getById = vi.mocked(siteRepository.getById);
const membershipRole = vi.mocked(siteRepository.membershipRole);
const listForUser = vi.mocked(siteRepository.listForUser);
const listEditableForUser = vi.mocked(siteRepository.listEditableForUser);

const RNSIT_SITE = {
  id: 'c0000001-0000-4000-8000-000000000010',
  organizationId: 'c0000001-0000-4000-8000-000000000001',
  organizationName: 'RNSIT',
  organizationSlug: 'rnsit',
  name: 'RNSIT Main Campus',
  slug: 'rnsit-main',
  latitude: 12.9014,
  longitude: 77.5184,
  timezone: 'Asia/Kolkata',
  status: 'active' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const HOSPITAL_SITE = {
  ...RNSIT_SITE,
  id: 'aaaaaaaa-0000-4000-8000-000000000098',
  organizationId: 'aaaaaaaa-0000-4000-8000-000000000099',
  organizationName: 'City Hospital',
  organizationSlug: 'city-hospital',
  name: 'Main Building',
  slug: 'main',
};

function req(role: 'admin' | 'user' | 'guest', sub = 'user-1'): AuthedRequest {
  return {
    user: { sub, role, name: 'Test', email: 't@example.com' },
    headers: {},
    query: {},
    body: {},
  } as AuthedRequest;
}

describe('siteContext authorization', () => {
  beforeEach(() => {
    getById.mockReset();
    membershipRole.mockReset();
    listForUser.mockReset();
    listEditableForUser.mockReset();
  });

  it('lets a platform admin edit any site', async () => {
    await expect(assertCanEditSite(req('admin'), HOSPITAL_SITE.id)).resolves.toBeUndefined();
    expect(membershipRole).not.toHaveBeenCalled();
  });

  it('rejects an organization admin editing another organization', async () => {
    getById.mockResolvedValue(HOSPITAL_SITE);
    membershipRole.mockResolvedValue(null);

    await expect(assertCanEditSite(req('user', 'rnsit-org-admin'), HOSPITAL_SITE.id)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
    });
  });

  it('allows an organization admin to edit a site in their organization', async () => {
    getById.mockResolvedValue(RNSIT_SITE);
    membershipRole.mockResolvedValue('org_admin');

    await expect(assertCanEditSite(req('user', 'rnsit-org-admin'), RNSIT_SITE.id)).resolves.toBeUndefined();
  });

  it('rejects unauthenticated writes', async () => {
    await expect(assertCanEditSite({} as AuthedRequest, RNSIT_SITE.id)).rejects.toBeInstanceOf(AppError);
  });
});

describe('resolveEditorSiteId', () => {
  beforeEach(() => {
    getById.mockReset();
    membershipRole.mockReset();
    listEditableForUser.mockReset();
  });

  it('requires explicit site for platform admin', async () => {
    await expect(resolveEditorSiteId(req('admin'))).rejects.toMatchObject({
      code: 'SITE_CONTEXT_REQUIRED',
    });
  });

  it('uses requested site when header is present', async () => {
    const authed = {
      ...req('admin'),
      headers: { 'x-site-id': RNSIT_SITE.id },
    } as AuthedRequest;
    getById.mockResolvedValue(RNSIT_SITE);
    await expect(resolveEditorSiteId(authed)).resolves.toBe(RNSIT_SITE.id);
  });

  it('auto-resolves when org admin has exactly one editable site', async () => {
    listEditableForUser.mockResolvedValue([RNSIT_SITE]);
    getById.mockResolvedValue(RNSIT_SITE);
    membershipRole.mockResolvedValue('org_admin');
    await expect(resolveEditorSiteId(req('user'))).resolves.toBe(RNSIT_SITE.id);
  });

  it('requires selection when multiple editable sites exist', async () => {
    listEditableForUser.mockResolvedValue([RNSIT_SITE, HOSPITAL_SITE]);
    await expect(resolveEditorSiteId(req('user'))).rejects.toMatchObject({
      code: 'SITE_CONTEXT_REQUIRED',
    });
  });
});

describe('assertSameSite', () => {
  it('accepts matching site ids', () => {
    expect(() => assertSameSite(RNSIT_SITE.id, RNSIT_SITE.id)).not.toThrow();
  });

  it('rejects mixed or missing site ids', () => {
    expect(() => assertSameSite(RNSIT_SITE.id, HOSPITAL_SITE.id)).toThrow();
    expect(() => assertSameSite(RNSIT_SITE.id, undefined)).toThrow();
  });
});
