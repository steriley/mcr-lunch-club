/**
 * Only allow post-login redirects to same-site Chairs' Area paths, so a
 * crafted `?next=` link cannot send a Chair to another site.
 */
export function safeAdminRedirect(next: string | null | undefined, fallback = '/admin'): string {
  const value = String(next ?? '').trim();
  if (!value.startsWith('/admin')) return fallback;
  // Control characters are rejected on purpose.
  // eslint-disable-next-line no-control-regex
  if (value.startsWith('//') || value.includes('\\') || /[\u0000-\u001f]/.test(value)) return fallback;
  if (value === '/admin/login' || value.startsWith('/admin/login?') || value.startsWith('/admin/login/')) return fallback;

  // `/administrator` and similar must not pass the prefix check.
  const pathEnd = value.search(/[?#]/);
  const path = pathEnd === -1 ? value : value.slice(0, pathEnd);
  if (path !== '/admin' && !path.startsWith('/admin/')) return fallback;

  return value;
}
