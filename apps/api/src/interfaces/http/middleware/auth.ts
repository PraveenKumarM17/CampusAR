import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '@campusar/shared';
import { AppError } from '../../../domain/errors';
import { verifyAccessToken, type JwtPayload } from '../../../infrastructure/auth/jwt';

export interface AuthedRequest extends Request {
  user?: JwtPayload;
}

export function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      req.user = verifyAccessToken(header.slice(7));
    } catch {
      // ignore invalid optional token
    }
  }
  next();
}

export function requireAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new AppError('UNAUTHORIZED', 'Authentication required', 401));
  }
  try {
    req.user = verifyAccessToken(header.slice(7));
    next();
  } catch {
    next(new AppError('UNAUTHORIZED', 'Invalid or expired token', 401));
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthedRequest, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError('UNAUTHORIZED', 'Authentication required', 401));
    if (!roles.includes(req.user.role)) {
      return next(new AppError('FORBIDDEN', 'Insufficient permissions', 403));
    }
    next();
  };
}
