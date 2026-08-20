/** Browser location fields needed to resolve same-origin WebSocket URLs. */
export type BrowserLocation = Pick<Location, 'protocol' | 'host' | 'origin'>;

const DEFAULT_API_BASE = '/api';
const DEFAULT_WS_PATH = '/ws';

/**
 * Resolve the REST API base URL for fetch().
 * Empty / whitespace / undefined → `/api` (Vite or nginx same-origin proxy).
 * Trailing slashes are stripped so `/api` + `/campus` never becomes `/api//campus`.
 */
export function resolveApiBaseUrl(envValue?: string | null): string {
  const trimmed = envValue?.trim();
  if (!trimmed) return DEFAULT_API_BASE;
  return trimmed.replace(/\/+$/, '');
}

/**
 * Join API base + path without producing `/api/api/...`.
 */
export function joinApiUrl(base: string, path: string): string {
  const normalizedBase = resolveApiBaseUrl(base);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (
    normalizedBase.endsWith('/api') &&
    (normalizedPath === '/api' || normalizedPath.startsWith('/api/'))
  ) {
    const rest = normalizedPath.slice('/api'.length);
    return rest ? `${normalizedBase}${rest}` : normalizedBase;
  }
  return `${normalizedBase}${normalizedPath}`;
}

function wsProtocolFor(pageProtocol: string): 'ws:' | 'wss:' {
  return pageProtocol === 'https:' ? 'wss:' : 'ws:';
}

function normalizeWsPath(path: string): string {
  const withSlash = path.startsWith('/') ? path : `/${path}`;
  return withSlash.replace(/\/+$/, '') || DEFAULT_WS_PATH;
}

/**
 * Resolve the WebSocket URL used by live campus updates.
 * - unset / empty → `{ws|wss}://{current host}/ws`
 * - relative `/ws` → same-origin with protocol derived from the page
 * - `http(s)://...` is converted to `ws(s)://...`
 * - absolute `ws(s)://...` is kept (trailing slash stripped)
 */
export function resolveWebSocketUrl(
  envValue: string | null | undefined,
  location: BrowserLocation,
): string {
  const proto = wsProtocolFor(location.protocol);
  const trimmed = envValue?.trim();

  if (!trimmed) {
    return `${proto}//${location.host}${DEFAULT_WS_PATH}`;
  }

  if (trimmed.startsWith('/')) {
    return `${proto}//${location.host}${normalizeWsPath(trimmed)}`;
  }

  if (trimmed.startsWith('https://')) {
    return `wss://${trimmed.slice('https://'.length).replace(/\/+$/, '')}`;
  }
  if (trimmed.startsWith('http://')) {
    return `ws://${trimmed.slice('http://'.length).replace(/\/+$/, '')}`;
  }

  return trimmed.replace(/\/+$/, '');
}
