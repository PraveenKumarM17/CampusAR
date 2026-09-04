import type { HelmetOptions } from 'helmet';
import { env } from '../../../infrastructure/config/env';

/**
 * Helmet CSP for the API host.
 *
 * Most responses are JSON (CSP is a no-op for those). The HTML surface is
 * Swagger UI at `/api/docs`, which injects an inline bootstrap script and
 * uses inline styles — so we allow `'unsafe-inline'` for script/style only,
 * keep everything else on `'self'`, and block plugins (`object-src 'none'`).
 *
 * `upgrade-insecure-requests` is omitted outside production so local
 * `http://localhost` docs keep working.
 */
export function buildHelmetOptions(): HelmetOptions {
  const isProd = env.nodeEnv === 'production';

  return {
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        // swagger-ui-express inlines swagger-ui-init.js into the HTML page.
        scriptSrc: ["'self'", "'unsafe-inline'"],
        scriptSrcAttr: ["'none'"],
        // Swagger UI relies on inline <style> / style attributes.
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
        // "Try it out" calls this API; keep connect same-origin.
        connectSrc: ["'self'"],
        workerSrc: ["'self'", 'blob:'],
        // Disable Helmet's default upgrade-insecure-requests in non-prod.
        ...(isProd ? {} : { upgradeInsecureRequests: null }),
      },
    },
    // API docs should not be framed by third-party sites.
    frameguard: { action: 'deny' },
  };
}
