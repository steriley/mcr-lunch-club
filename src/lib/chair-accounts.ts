import { eq, like } from 'drizzle-orm';
import { user } from '@/db/auth-schema';
import type { Database } from '@/lib/db-client';
import { hasAdminRole } from '@/lib/roles';

/**
 * Chairs among every account (#136). Once members sign up, Chairs are a handful of rows among
 * many, so queries for Chairs narrow in SQL first. The SQL test is deliberately loose (the role
 * mentions "admin", which also matches comma-separated roles); callers then apply the exact rule
 * from src/lib/roles.ts, so nobody counts as a Chair here who would not at sign-in.
 */
export const roleMentionsAdmin = like(user.role, '%admin%');

/** Whether this account is a Chair's: the admin role, banned or not. Members are not. */
export async function isChairAccount(db: Database, userId: string): Promise<boolean> {
  const [row] = await db.select({ role: user.role }).from(user).where(eq(user.id, userId)).limit(1);
  return Boolean(row) && hasAdminRole(row.role);
}
