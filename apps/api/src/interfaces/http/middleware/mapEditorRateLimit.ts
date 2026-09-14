import type { NextFunction, Request, Response, RequestHandler } from 'express';
import { env } from '../../../infrastructure/config/env';
import { AppError } from '../../../domain/errors';
import type { AuthedRequest } from './auth';

/**
 * Per-user rate limits for map-editor APIs (outdoor + indoor under `requireMapEditor`).
 *
 * Fixed-window, process-local store (same multi-replica caveat as Idempotency-Key).
 * Skipped in `NODE_ENV=test` unless `MAP_EDITOR_RATE_LIMIT_FORCE=true`.
 *
 * Env (optional):
 * - MAP_EDITOR_RATE_LIMIT_WINDOW_MS (default 60000)
 * - MAP_EDITOR_RATE_LIMIT_MAX (default 120) — all methods
 * - MAP_EDITOR_WRITE_RATE_LIMIT_MAX (default 60) — POST/PUT/PATCH/DELETE
 * - MAP_EDITOR_HEAVY_RATE_LIMIT_MAX (default 10) — publish / rollback
 */

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const windowMs = parsePositiveInt(process.env.MAP_EDITOR_RATE_LIMIT_WINDOW_MS, 60_000);
const allMax = parsePositiveInt(process.env.MAP_EDITOR_RATE_LIMIT_MAX, 120);
const writeMax = parsePositiveInt(process.env.MAP_EDITOR_WRITE_RATE_LIMIT_MAX, 60);
const heavyMax = parsePositiveInt(process.env.MAP_EDITOR_HEAVY_RATE_LIMIT_MAX, 10);

interface WindowEntry {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, WindowEntry>();

function shouldSkipRateLimit(): boolean {
  if (process.env.MAP_EDITOR_RATE_LIMIT_FORCE === 'true') return false;
  return env.nodeEnv === 'test';
}

function clientKey(req: Request): string {
  const userId = (req as AuthedRequest).user?.sub;
  if (userId) return `user:${userId}`;
  return `ip:${req.ip || 'unknown'}`;
}

function purgeExpired(now: number): void {
  for (const [key, entry] of buckets) {
    if (now >= entry.resetAt) buckets.delete(key);
  }
}

function takeToken(bucketKey: string, max: number, now: number): {
  limited: boolean;
  remaining: number;
  resetAt: number;
} {
  purgeExpired(now);
  let entry = buckets.get(bucketKey);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    buckets.set(bucketKey, entry);
  }
  entry.count += 1;
  const remaining = Math.max(0, max - entry.count);
  return {
    limited: entry.count > max,
    remaining,
    resetAt: entry.resetAt,
  };
}

function setRateLimitHeaders(
  res: Response,
  max: number,
  remaining: number,
  resetAt: number,
): void {
  res.setHeader('RateLimit-Limit', String(max));
  res.setHeader('RateLimit-Remaining', String(remaining));
  res.setHeader('RateLimit-Reset', String(Math.ceil(resetAt / 1000)));
}

function createLimiter(name: string, max: number): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (shouldSkipRateLimit()) {
      next();
      return;
    }

    const now = Date.now();
    const { limited, remaining, resetAt } = takeToken(`${name}:${clientKey(req)}`, max, now);
    setRateLimitHeaders(res, max, remaining, resetAt);

    if (limited) {
      const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      next(
        new AppError('RATE_LIMITED', 'Too many map editor requests. Try again shortly.', 429, {
          retryAfterSeconds,
          limit: max,
          windowMs,
        }),
      );
      return;
    }

    next();
  };
}

/** All map-editor traffic (reads + writes) — caps validate/snapshot spam. */
export const mapEditorRateLimit = createLimiter('map-editor', allMax);

/** Mutating verbs only — caps draft CRUD spam. */
export const mapEditorWriteRateLimit: RequestHandler = (req, res, next) => {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    next();
    return;
  }
  return writeLimiter(req, res, next);
};

const writeLimiter = createLimiter('map-editor-write', writeMax);

/** Expensive workflow endpoints (publish / rollback). */
export const mapEditorHeavyRateLimit = createLimiter('map-editor-heavy', heavyMax);

/** Test-only helpers. */
export const __mapEditorRateLimitTest = {
  windowMs,
  allMax,
  writeMax,
  heavyMax,
  shouldSkipRateLimit,
  clientKey,
  resetBuckets(): void {
    buckets.clear();
  },
};
