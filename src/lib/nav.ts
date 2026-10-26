/**
 * Whether a main-navigation link is the current page. Prerendered pages report their path with
 * a trailing slash (/manifesto/) while the links have none, so the slash is ignored. The Verdicts
 * link covers every verdict page.
 */
export function isNavActive(pathname: string, href: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  if (href === '/verdicts/approved') return path === '/verdicts' || path.startsWith('/verdicts/');
  return path === href;
}
