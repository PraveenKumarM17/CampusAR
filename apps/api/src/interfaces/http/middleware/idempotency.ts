import type { NextFunction, Request, Response } from 'express';

/**
 * Short-lived in-memory idempotency store for the map-builder mutating
 * endpoints. Keyed on the `Idempotency-Key` header + HTTP method + path so
 * a retried request (e.g. from a flaky client connection) replays the first
 * response instead of re-executing the mutation.
 */

const TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  status: number;
  /** `undefined` means "no body" (e.g. a 204 response). */
  body: unknown;
  expiresAt: number;
}

const store = new Map<string, CacheEntry>();

function buildCacheKey(idempotencyKey: string, method: string, path: string): string {
  return `${method.toUpperCase()} ${path}::${idempotencyKey}`;
}

function isExpired(entry: CacheEntry, now: number): boolean {
  return now > entry.expiresAt;
}

function purgeExpired(now: number): void {
  for (const [key, entry] of store) {
    if (isExpired(entry, now)) store.delete(key);
  }
}

export function idempotencyMiddleware(req: Request, res: Response, next: NextFunction): void {
  const idempotencyKey = req.header('Idempotency-Key');
  if (!idempotencyKey) {
    next();
    return;
  }

  const now = Date.now();
  purgeExpired(now);

  const path = req.originalUrl.split('?')[0];
  const cacheKey = buildCacheKey(idempotencyKey, req.method, path);

  const cached = store.get(cacheKey);
  if (cached) {
    if (cached.body === undefined) {
      res.status(cached.status).end();
    } else {
      res.status(cached.status).json(cached.body);
    }
    return;
  }

  let alreadyCached = false;
  const cacheResponse = (status: number, body: unknown) => {
    if (alreadyCached) return;
    alreadyCached = true;
    store.set(cacheKey, { status, body, expiresAt: Date.now() + TTL_MS });
  };

  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);
  const originalSendStatus = res.sendStatus.bind(res);

  res.json = ((body?: unknown) => {
    cacheResponse(res.statusCode, body);
    return originalJson(body);
  }) as typeof res.json;

  res.sendStatus = ((code: number) => {
    cacheResponse(code, undefined);
    return originalSendStatus(code);
  }) as typeof res.sendStatus;

  res.send = ((body?: unknown) => {
    if (res.statusCode === 204 || body === undefined) {
      cacheResponse(res.statusCode, undefined);
    }
    return originalSend(body);
  }) as typeof res.send;

  next();
}
