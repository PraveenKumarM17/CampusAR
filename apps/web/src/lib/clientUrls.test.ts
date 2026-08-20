import { describe, expect, it } from 'vitest';
import { joinApiUrl, resolveApiBaseUrl, resolveWebSocketUrl } from './clientUrls';

describe('resolveApiBaseUrl', () => {
  it('defaults VITE_API_URL=/api and empty/undefined to /api', () => {
    expect(resolveApiBaseUrl('/api')).toBe('/api');
    expect(resolveApiBaseUrl('/api/')).toBe('/api');
    expect(resolveApiBaseUrl('')).toBe('/api');
    expect(resolveApiBaseUrl('   ')).toBe('/api');
    expect(resolveApiBaseUrl(undefined)).toBe('/api');
    expect(resolveApiBaseUrl(null)).toBe('/api');
  });

  it('keeps an explicit absolute API base without a trailing slash', () => {
    expect(resolveApiBaseUrl('http://some-host:4000/api')).toBe('http://some-host:4000/api');
    expect(resolveApiBaseUrl('http://some-host:4000/api/')).toBe('http://some-host:4000/api');
  });
});

describe('joinApiUrl', () => {
  it('joins /api with campus paths without doubling /api', () => {
    expect(joinApiUrl('/api', '/campus/buildings')).toBe('/api/campus/buildings');
    expect(joinApiUrl('/api', '/api/campus/buildings')).toBe('/api/campus/buildings');
    expect(joinApiUrl('http://some-host:4000/api', '/auth/login')).toBe(
      'http://some-host:4000/api/auth/login',
    );
    expect(joinApiUrl('http://some-host:4000/api', '/api/auth/login')).toBe(
      'http://some-host:4000/api/auth/login',
    );
  });
});

describe('resolveWebSocketUrl', () => {
  const lanHttp = {
    protocol: 'http:',
    host: '192.168.1.10:5173',
    origin: 'http://192.168.1.10:5173',
  };
  const httpsProd = {
    protocol: 'https:',
    host: 'campus.example.com',
    origin: 'https://campus.example.com',
  };

  it('derives ws from an HTTP LAN origin when VITE_WS_URL is unset', () => {
    expect(resolveWebSocketUrl(undefined, lanHttp)).toBe('ws://192.168.1.10:5173/ws');
    expect(resolveWebSocketUrl('', lanHttp)).toBe('ws://192.168.1.10:5173/ws');
  });

  it('derives wss from an HTTPS origin when VITE_WS_URL is unset', () => {
    expect(resolveWebSocketUrl(undefined, httpsProd)).toBe('wss://campus.example.com/ws');
  });

  it('keeps an explicit absolute WebSocket URL', () => {
    expect(resolveWebSocketUrl('ws://api.example.com/ws', lanHttp)).toBe('ws://api.example.com/ws');
    expect(resolveWebSocketUrl('wss://api.example.com/ws', httpsProd)).toBe(
      'wss://api.example.com/ws',
    );
  });

  it('resolves a relative /ws against the current origin and page protocol', () => {
    expect(resolveWebSocketUrl('/ws', httpsProd)).toBe('wss://campus.example.com/ws');
    expect(resolveWebSocketUrl('/ws', lanHttp)).toBe('ws://192.168.1.10:5173/ws');
  });

  it('converts http(s) WebSocket env values and does not append /ws/ws', () => {
    expect(resolveWebSocketUrl('https://campus.example.com/ws', httpsProd)).toBe(
      'wss://campus.example.com/ws',
    );
    expect(resolveWebSocketUrl('/ws/', lanHttp)).toBe('ws://192.168.1.10:5173/ws');
  });
});
