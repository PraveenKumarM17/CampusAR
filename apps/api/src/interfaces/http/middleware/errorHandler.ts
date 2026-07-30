import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../../../domain/errors';
import { env } from '../../../infrastructure/config/env';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      code: err.code,
      message: err.message,
      details: err.details,
    });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Invalid request',
      details: err.flatten(),
    });
  }
  console.error(err);
  return res.status(500).json({
    code: 'INTERNAL_ERROR',
    message: env.nodeEnv === 'production' ? 'Internal server error' : String(err),
  });
}
