import type { Request } from 'express';
import type { UserRole } from '@campusar/shared';
import { AppError } from '../domain/errors';
import { siteRepository } from '../infrastructure/repositories/siteRepository';
import type { AuthedRequest } from '../interfaces/http/middleware/auth';

export function readRequestedSiteId(req: Request): string | undefined {
  const header = req.headers?.['x-site-id'];
  if (typeof header === 'string' && header.trim()) return header.trim();
  if (typeof req.query.siteId === 'string' && req.query.siteId.trim()) return req.query.siteId.trim();
  const body = req.body as { siteId?: unknown } | undefined;
  if (typeof body?.siteId === 'string' && body.siteId.trim()) return body.siteId.trim();
  return undefined;
}

/** Resolve the site for a request. Missing id falls back to the oldest active site. */
export async function resolveRequestSiteId(req: Request): Promise<string | null> {
  const requested = readRequestedSiteId(req);
  if (requested) {
    const site = await siteRepository.getById(requested);
    if (!site) throw new AppError('SITE_NOT_FOUND', 'Site was not found', 404);
    return site.id;
  }
  const fallback = await siteRepository.getDefaultSite();
  return fallback?.id ?? null;
}

/** Strict site resolution for map builder writes — never falls back to oldest site. */
export async function resolveEditorSiteId(req: AuthedRequest): Promise<string> {
  const requested = readRequestedSiteId(req);
  if (requested) {
    const site = await siteRepository.getById(requested);
    if (!site) throw new AppError('SITE_NOT_FOUND', 'Site was not found', 404);
    await assertCanEditSite(req, site.id);
    return site.id;
  }

  const user = req.user;
  if (!user) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);

  if (user.role === ('admin' as UserRole)) {
    throw new AppError(
      'SITE_CONTEXT_REQUIRED',
      'Explicit site context is required for map edits',
      422,
    );
  }

  const editable = await siteRepository.listEditableForUser(user.sub);
  if (editable.length === 1) {
    await assertCanEditSite(req, editable[0].id);
    return editable[0].id;
  }

  throw new AppError(
    'SITE_CONTEXT_REQUIRED',
    editable.length === 0
      ? 'You do not have permission to edit any site'
      : 'Select a site before saving map changes',
    422,
  );
}

export async function assertResourceInSite(
  resourceSiteId: string | null | undefined,
  siteId: string,
  label = 'Resource',
): Promise<void> {
  if (!resourceSiteId || resourceSiteId !== siteId) {
    throw new AppError('CROSS_SITE_REFERENCE', `${label} does not belong to the active site`, 422);
  }
}

export async function assertCanEditSite(req: AuthedRequest, siteId: string): Promise<void> {
  const user = req.user;
  if (!user) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
  if (user.role === ('admin' as UserRole)) return;

  const site = await siteRepository.getById(siteId);
  if (!site) throw new AppError('SITE_NOT_FOUND', 'Site was not found', 404);
  const membership = await siteRepository.membershipRole(user.sub, site.organizationId);
  if (!membership) {
    throw new AppError('FORBIDDEN', 'You cannot modify another organization\'s map', 403);
  }
  if (membership === 'member') {
    throw new AppError('FORBIDDEN', 'Insufficient permissions', 403);
  }
  if (membership === 'site_admin') {
    const scoped = await siteRepository.listForUser(user.sub);
    if (!scoped.some((s) => s.id === siteId)) {
      throw new AppError('FORBIDDEN', 'You cannot modify this site', 403);
    }
  }
}

export function assertSameSite(
  sourceSiteId: string | null | undefined,
  destinationSiteId: string | null | undefined,
): void {
  if (!sourceSiteId || !destinationSiteId || sourceSiteId !== destinationSiteId) {
    throw new AppError(
      'CROSS_SITE_ROUTE',
      'Start and destination must belong to the same site',
      422,
    );
  }
}
