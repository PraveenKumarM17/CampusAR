const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidNodeId(id: string | null | undefined): id is string {
  return Boolean(id && UUID_RE.test(id));
}

export function parseNavigateParams(search: string): {
  from: string | null;
  to: string | null;
} {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const from = params.get('from');
  const to = params.get('to');
  return {
    from: isValidNodeId(from) ? from : null,
    to: isValidNodeId(to) ? to : null,
  };
}

export function buildNavigateShareUrl(
  from: string,
  to: string,
  origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost',
): string {
  const url = new URL('/navigate', origin);
  url.searchParams.set('from', from);
  url.searchParams.set('to', to);
  return url.toString();
}

export async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}
