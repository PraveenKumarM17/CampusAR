const DEFAULT_API_BASE = '/api';

export function resolveApiBaseUrl(envValue?: string | null): string {
  const trimmed = envValue?.trim();
  if (!trimmed) return DEFAULT_API_BASE;
  return trimmed.replace(/\/+$/, '');
}

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
