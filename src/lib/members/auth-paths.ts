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

/** Member-only pages and API routes, closed while the flag is off. */
export function isMemberRoute(pathname: string): boolean {
  return (
    pathname === '/members' ||
    pathname.startsWith('/members/') ||
    pathname === '/api/member' ||
    pathname.startsWith('/api/member/')
  );
}
