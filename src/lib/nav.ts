/**
 * Whether a main-navigation link is the current page. Prerendered pages report their path with
 * a trailing slash (/manifesto/) while the links have none, so the slash is ignored. The Tiers
 * link covers every tier page.
 */
export function isNavActive(pathname: string, href: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  if (href === '/tiers/approved') return path === '/tiers' || path.startsWith('/tiers/');
  return path === href;
}
