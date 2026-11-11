/**
 * Which member sign-in endpoints of Better Auth the web may reach (#136). Browser-safe: no imports.
 *
 * - Requesting a link or code goes only through POST /api/member/sign-in, which applies the rate
 *   limits, honeypot and time trap. Better Auth's own request endpoints answer 404 over HTTP.
 * - Verifying a link or code is Better Auth's, and is open only while the `members` flag is on.
 * - The email-code plugin's other endpoints (password reset, email change, email verification,
 *   checking a code without signing in) are never used here and always answer 404.
 *
 * Paths are relative to /api/auth.
 */

/** Open over HTTP while the flag is on. */
const VERIFY_PATHS = new Set(['/magic-link/verify', '/sign-in/email-otp']);

/** Never open over HTTP: requests go through /api/member/sign-in, the rest is unused. */
const CLOSED_PREFIXES = ['/sign-in/magic-link', '/email-otp/', '/forget-password/email-otp'];

export type AuthPathAccess = 'pass' | 'not_found';

export function memberAuthPathAccess(path: string, membersEnabled: boolean): AuthPathAccess {
  const normalised = path.replace(/\/+$/, '') || '/';
  if (
    CLOSED_PREFIXES.some(
      (prefix) => normalised === prefix.replace(/\/$/, '') || normalised.startsWith(prefix)
    )
  ) {
    return 'not_found';
  }
  if (VERIFY_PATHS.has(normalised)) return membersEnabled ? 'pass' : 'not_found';
  return 'pass';
}

/** Sign-in paths whose sessions belong to members only: Chairs never sign in by email. */
export const EMAIL_SIGN_IN_PATHS: ReadonlySet<string> = VERIFY_PATHS;

/** Under one of these prefixes, at the prefix itself or below it ("/log", "/log/x"; not "/logo"). */
const underPrefix = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

/**
 * The signed-in member's own pages, and "Log a lunch" (/log, /log/<slug>, #137); a signed-out
 * visitor is sent to sign in and comes back here.
 */
export function isMemberAccountPage(pathname: string): boolean {
  return underPrefix(pathname, '/members/me') || underPrefix(pathname, '/log');
}

/** Where a member goes after signing in: their own pages only, so `?next=` can't send them away. */
export function safeMemberRedirect(next: string | null | undefined): string {
  const value = String(next ?? '').trim();
  // eslint-disable-next-line no-control-regex
  if (value.includes('\\') || /[\u0000-\u001f]/.test(value)) return '/members/me';
  const pathEnd = value.search(/[?#]/);
  const path = pathEnd === -1 ? value : value.slice(0, pathEnd);
  // "/members/me/../../admin" would leave the member's pages once the browser resolves it.
  if (/(?:^|\/)(?:\.|%2e){1,2}(?:\/|$)/i.test(path)) return '/members/me';
  return isMemberAccountPage(path) ? value : '/members/me';
}

/** Member-only pages and API routes, closed while the flag is off. */
export function isMemberRoute(pathname: string): boolean {
  return (
    underPrefix(pathname, '/members') ||
    underPrefix(pathname, '/api/member') ||
    underPrefix(pathname, '/log')
  );
}
