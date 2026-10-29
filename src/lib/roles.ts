/**
 * Who counts as an active Chair: the admin role, not deactivated. The
 * middleware, every admin handler (requireAdmin) and the two-admin counts all
 * use these, so they can never disagree. No imports, so domain modules and
 * scripts can use it without loading auth or the database.
 */

/** The roles allowed into the Chairs' Area. */
const ADMIN_ROLES = ['admin'];

export function hasAdminRole(role: string | null | undefined): boolean {
  return String(role ?? '')
    .split(',')
    .map((value) => value.trim())
    .some((value) => ADMIN_ROLES.includes(value));
}

/** Deactivated (banned) accounts may not act, even with a session that outlived the ban. */
export function isBanned(
  user: { banned?: boolean | null; banExpires?: Date | string | null },
  now: Date = new Date()
): boolean {
  if (!user.banned) return false;
  if (!user.banExpires) return true;
  return new Date(user.banExpires).getTime() > now.getTime();
}

export function isActiveChair(
  user: { role?: string | null; banned?: boolean | null; banExpires?: Date | string | null },
  now: Date = new Date()
): boolean {
  return hasAdminRole(user.role) && !isBanned(user, now);
}
