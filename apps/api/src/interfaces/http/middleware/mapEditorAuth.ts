import type { NextFunction, Response } from 'express';
import { AppError } from '../../../domain/errors';
import { siteRepository } from '../../../infrastructure/repositories/siteRepository';
import type { AuthedRequest } from './auth';

/** Allows platform admins and organization/site administrators with edit rights. */
export async function requireMapEditor(
  req: AuthedRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      next(new AppError('UNAUTHORIZED', 'Authentication required', 401));
      return;
    }
    const allowed = await siteRepository.canUserEditAnySite(user.sub, user.role === 'admin');
    if (!allowed) {
      next(new AppError('FORBIDDEN', 'Map editing requires administrator access', 403));
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}
