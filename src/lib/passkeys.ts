import { randomUUID } from 'node:crypto';
import { and, count, eq, gt, inArray } from 'drizzle-orm';
import { passkey, verification } from '@/db/auth-schema';
import type { Database } from '@/lib/db-client';

/**
 * Chairs' passkeys (#153). Better Auth's passkey plugin owns registration and sign-in; this module
 * holds the two rules it has no option for:
 *
 * - **A password check before adding a passkey.** A Chair confirms their password
 *   (`POST /api/admin/account/passkey-grant`), which records a short-lived grant. The auth hooks in
 *   auth-config.ts refuse the passkey registration endpoints without one, and the grant is used up
 *   by the registration it allowed. So a stolen session cookie alone cannot add a passkey that
 *   would outlive a password reset.
 * - **Recovery removes passkeys.** A password reset, a deactivation or "Remove passkeys" deletes
 *   every passkey on the account.
 *
 * Grants live in Better Auth's `verification` table under their own identifier prefix.
 */

/** How long a confirmed password allows adding a passkey. */
export const PASSKEY_GRANT_SECONDS = 5 * 60;

/** Wrong passwords allowed per Chair in the window below before the check refuses to run. */
export const PASSWORD_CHECK_MAX_FAILURES = 5;
const PASSWORD_CHECK_WINDOW_SECONDS = 15 * 60;

const grantIdentifier = (userId: string) => `passkey-grant:${userId}`;
const failureIdentifier = (userId: string) => `passkey-grant-failure:${userId}`;

/**
 * Whether this Chair has had too many wrong passwords lately. The check runs on the server through
 * Better Auth's API, which skips its HTTP rate limits, so it keeps its own count: someone holding a
 * stolen session cookie must not be able to guess the password here.
 */
export async function isPasswordCheckLimited(
  db: Database,
  userId: string,
  now: Date = new Date()
): Promise<boolean> {
  const [row] = await db
    .select({ failures: count() })
    .from(verification)
    .where(
      and(eq(verification.identifier, failureIdentifier(userId)), gt(verification.expiresAt, now))
    );
  return (row?.failures ?? 0) >= PASSWORD_CHECK_MAX_FAILURES;
}

/** Counts one wrong password towards the limit; each expires after the window. */
export async function recordPasswordCheckFailure(
  db: Database,
  userId: string,
  now: Date = new Date()
): Promise<void> {
  await db.insert(verification).values({
    id: randomUUID(),
    identifier: failureIdentifier(userId),
    value: 'failed',
    expiresAt: new Date(now.getTime() + PASSWORD_CHECK_WINDOW_SECONDS * 1000),
  });
}

/** Records that this Chair has just confirmed their password, replacing any earlier grant. */
export async function grantPasskeyRegistration(
  db: Database,
  userId: string,
  now: Date = new Date()
): Promise<void> {
  const identifier = grantIdentifier(userId);
  await db
    .delete(verification)
    .where(inArray(verification.identifier, [identifier, failureIdentifier(userId)]));
  await db.insert(verification).values({
    id: randomUUID(),
    identifier,
    value: 'granted',
    expiresAt: new Date(now.getTime() + PASSKEY_GRANT_SECONDS * 1000),
  });
}

/** Whether this Chair confirmed their password recently enough to add a passkey. */
export async function hasPasskeyGrant(
  db: Database,
  userId: string,
  now: Date = new Date()
): Promise<boolean> {
  const [row] = await db
    .select({ id: verification.id })
    .from(verification)
    .where(
      and(eq(verification.identifier, grantIdentifier(userId)), gt(verification.expiresAt, now))
    )
    .limit(1);
  return Boolean(row);
}

/** Uses up the grant, so one password check adds at most one passkey. */
export async function consumePasskeyGrant(db: Database, userId: string): Promise<void> {
  await db.delete(verification).where(eq(verification.identifier, grantIdentifier(userId)));
}

/** Deletes every passkey on an account, and any unused grant. Returns how many passkeys went. */
export async function removeAllPasskeys(db: Database, userId: string): Promise<number> {
  const removed = await db
    .delete(passkey)
    .where(eq(passkey.userId, userId))
    .returning({ id: passkey.id });
  await consumePasskeyGrant(db, userId);
  return removed.length;
}
