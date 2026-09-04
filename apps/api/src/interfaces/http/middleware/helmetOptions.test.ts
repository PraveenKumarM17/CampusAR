import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { buildHelmetOptions } from './helmetOptions';

const app = createApp();

function parseCsp(header: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [name, ...rest] = trimmed.split(/\s+/);
    out[name] = rest;
  }
  return out;
}

describe('Helmet CSP', () => {
  it('buildHelmetOptions enables CSP (not false)', () => {
    const options = buildHelmetOptions();
    expect(options.contentSecurityPolicy).not.toBe(false);
    expect(options.contentSecurityPolicy).toBeTruthy();
  });

  it('sends Content-Security-Policy on JSON responses', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    const csp = res.headers['content-security-policy'];
    expect(typeof csp).toBe('string');
    expect(csp.length).toBeGreaterThan(0);

    const directives = parseCsp(csp);
    expect(directives['default-src']).toContain("'self'");
    expect(directives['object-src']).toContain("'none'");
    expect(directives['frame-ancestors']).toContain("'none'");
    expect(directives['script-src']).toEqual(expect.arrayContaining(["'self'", "'unsafe-inline'"]));
    expect(directives['style-src']).toEqual(expect.arrayContaining(["'self'", "'unsafe-inline'"]));
    // Local/dev must not force HTTPS upgrades (breaks http://localhost docs).
    expect(directives['upgrade-insecure-requests']).toBeUndefined();
  });

  it('serves Swagger UI HTML under the same CSP', async () => {
    const res = await request(app).get('/api/docs/');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/swagger/i);
    expect(res.headers['content-security-policy']).toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(res.headers['x-frame-options']).toBe('DENY');
  });
});
