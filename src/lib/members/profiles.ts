import { and, count, desc, eq, inArray, isNull, ne, not, or, sql } from 'drizzle-orm';
import { passkey, session, user, verification } from '@/db/auth-schema';
import {
  memberEvents,
  memberProfiles,
  memberReservedNames,
  memberSignInRequests,
} from '@/db/schema';
import { roleMentionsAdmin } from '@/lib/chair-accounts';
import { isUniqueViolation } from '@/lib/db-errors';
import type { Database, Tx } from '@/lib/db-client';
import { displayNameKey, type ProfileUpdate } from '@/lib/members/display-name';
import { exportOwnLogs } from '@/lib/member-inspections';
import { isOffensiveName } from '@/lib/members/display-name-filter';
import { emailHash } from '@/lib/members/sign-in';
import { fail, ok, outcomeTransaction, type Outcome } from '@/lib/outcome';
import { hasAdminRole, isBanned } from '@/lib/roles';

/**
 * Member profiles, moderation and account deletion (#136, PR c). Members are `user`-role accounts;
 * every operation here refuses a Chair's account as if it did not exist. The cascade rule for
 * member-owned rows is in src/db/schema.ts, above `memberProfiles`.
 *
 * Display names:
 * - unique ignoring case (src/lib/members/display-name.ts), checked against every member's
 *   current name and every name a Chair has hidden: a hidden name stays taken, by everyone;
 * - profanity-filtered on the server (src/lib/members/display-name-filter.ts);
 * - a member whose name was hidden may choose one new name. If that one is hidden too, they can't
 *   set a name until a Chair allows it again (`allowMemberName`).
 */

type Db = Database | Tx;

type ProfileError = 'member_not_found' | 'name_taken' | 'name_offensive' | 'name_locked';

export interface MemberProfileView {
  displayName: string | null;
  showPublicly: boolean;
  /** A Chair hid the current name: it is never shown publicly. */
  nameHidden: boolean;
  /** Whether the member may set a name now. */
  canChangeName: boolean;
  /** The next name change uses up the one rename allowed after a hide. */
  renameIsLastChance: boolean;
  joinedAt: string;
}

type ProfileRow = typeof memberProfiles.$inferSelect;

/** Hidden, and the one rename after a hide is used up: only a Chair can unlock the name. */
const isNameLocked = (row: Pick<ProfileRow, 'hiddenByChairAt' | 'renamedAfterHideAt'>) =>
  Boolean(row.hiddenByChairAt && row.renamedAfterHideAt);

function toView(row: ProfileRow, joinedAt: Date): MemberProfileView {
  const hidden = Boolean(row.hiddenByChairAt);
  return {
    displayName: row.displayName,
    showPublicly: row.showPublicly,
    nameHidden: hidden,
    canChangeName: !isNameLocked(row),
    renameIsLastChance: hidden && !row.renamedAfterHideAt,
    joinedAt: joinedAt.toISOString(),
  };
}

/** The member's account, or null for no account or a Chair's. */
async function findMemberUser(db: Db, userId: string, lock = false) {
  const query = db
    .select({
      id: user.id,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  const [row] = lock ? await query.for('update') : await query;
  return row && !hasAdminRole(row.role) ? row : null;
}

/** Creates the member's profile row if it doesn't exist yet. */
async function ensureProfile(db: Db, userId: string): Promise<void> {
  await db.insert(memberProfiles).values({ userId }).onConflictDoNothing();
}

async function lockProfile(tx: Tx, userId: string): Promise<ProfileRow> {
  await ensureProfile(tx, userId);
  const [row] = await tx
    .select()
    .from(memberProfiles)
    .where(eq(memberProfiles.userId, userId))
    .for('update');
  return row;
}

/** The member's profile, created on first read. Null for no account or a Chair's. */
async function getMemberProfile(db: Database, userId: string): Promise<MemberProfileView | null> {
  const member = await findMemberUser(db, userId);
  if (!member) return null;
  const read = () => db.select().from(memberProfiles).where(eq(memberProfiles.userId, userId));
  // A read on every header check, so the row is written only the first time.
  let [row] = await read();
  if (!row) {
    await ensureProfile(db, userId);
    [row] = await read();
  }
  return toView(row, member.createdAt);
}

/** Whether a name is free: no other member holds it and no Chair has hidden it. */
async function isNameTaken(tx: Tx, key: string, userId: string): Promise<boolean> {
  const [reserved] = await tx
    .select({ key: memberReservedNames.nameKey })
    .from(memberReservedNames)
    .where(eq(memberReservedNames.nameKey, key))
    .limit(1);
  if (reserved) return true;
  const [held] = await tx
    .select({ userId: memberProfiles.userId })
    .from(memberProfiles)
    .where(and(eq(memberProfiles.displayNameKey, key), ne(memberProfiles.userId, userId)))
    .limit(1);
  return Boolean(held);
}

/**
 * Changes the member's display name, their privacy setting, or both. The name is already in
 * shape (`profileUpdateSchema`); this applies the rules that need the database.
 */
async function updateMemberProfile(
  db: Database,
  userId: string,
  update: ProfileUpdate,
  now: Date = new Date()
): Promise<Outcome<MemberProfileView, ProfileError>> {
  try {
    return await outcomeTransaction(db, async (tx) => {
      const member = await findMemberUser(tx, userId);
      if (!member) return fail('member_not_found');
      const row = await lockProfile(tx, userId);
      const changes: Partial<typeof memberProfiles.$inferInsert> = {};

      if (update.displayName !== undefined) {
        const name = update.displayName;
        const key = displayNameKey(name);
        const hidden = Boolean(row.hiddenByChairAt);
        if (isNameLocked(row)) return fail('name_locked');
        if (isOffensiveName(name)) return fail('name_offensive');
        // The member's own current name is theirs to restyle ("sam" to "Sam") unless it was hidden.
        if (hidden || key !== row.displayNameKey) {
          if (await isNameTaken(tx, key, userId)) return fail('name_taken');
        }
        changes.displayName = name;
        changes.displayNameKey = key;
        if (hidden) {
          changes.hiddenByChairAt = null;
          changes.renamedAfterHideAt = now;
        }
      }
      if (update.showPublicly !== undefined) changes.showPublicly = update.showPublicly;

      const [saved] = await tx
        .update(memberProfiles)
        .set(changes)
        .where(eq(memberProfiles.userId, userId))
        .returning();
      return ok(toView(saved, member.createdAt));
    });
  } catch (error) {
    // Another member took the name between the check and the save.
    if (isUniqueViolation(error)) return fail('name_taken');
    throw error;
  }
}

// ---------------------------------------------------------------------------------------------
// The Chairs' Members list and moderation
// ---------------------------------------------------------------------------------------------

export interface MemberSummary {
  id: string;
  displayName: string | null;
  nameHidden: boolean;
  /** Hidden twice: the member can't set a name until a Chair allows it. */
  nameLocked: boolean;
  banned: boolean;
  joinedAt: string;
}

/** Accounts that are not Chairs'. The Chairs' query (roleMentionsAdmin) is its mirror image. */
const isMemberRow = or(isNull(user.role), not(roleMentionsAdmin));

const summaryColumns = {
  id: user.id,
  role: user.role,
  banned: user.banned,
  banExpires: user.banExpires,
  createdAt: user.createdAt,
  displayName: memberProfiles.displayName,
  hiddenByChairAt: memberProfiles.hiddenByChairAt,
  renamedAfterHideAt: memberProfiles.renamedAfterHideAt,
};

type SummaryRow = {
  id: string;
  banned: boolean | null;
  banExpires: Date | null;
  createdAt: Date;
  displayName: string | null;
  hiddenByChairAt: Date | null;
  renamedAfterHideAt: Date | null;
};

function toSummary(row: SummaryRow): MemberSummary {
  return {
    id: row.id,
    displayName: row.displayName,
    nameHidden: Boolean(row.hiddenByChairAt),
    nameLocked: isNameLocked(row),
    banned: isBanned(row),
    joinedAt: row.createdAt.toISOString(),
  };
}

export const MEMBER_LIST_LIMIT = 200;

/** Newest first, with the total. No email addresses: the Chairs see what the public could. */
async function listMembers(
  db: Database,
  limit = MEMBER_LIST_LIMIT
): Promise<{ total: number; members: MemberSummary[] }> {
  const [[{ total }], rows] = await Promise.all([
    db.select({ total: count() }).from(user).where(isMemberRow),
    db
      .select(summaryColumns)
      .from(user)
      .leftJoin(memberProfiles, eq(memberProfiles.userId, user.id))
      .where(isMemberRow)
      .orderBy(desc(user.createdAt), desc(user.id))
      .limit(limit),
  ]);
  return {
    total,
    members: rows.filter((row) => !hasAdminRole(row.role)).map(toSummary),
  };
}

/** One member's summary, or null for no account or a Chair's. */
async function findMember(db: Db, memberId: string): Promise<MemberSummary | null> {
  const [row] = await db
    .select(summaryColumns)
    .from(user)
    .leftJoin(memberProfiles, eq(memberProfiles.userId, user.id))
    .where(eq(user.id, memberId))
    .limit(1);
  return row && !hasAdminRole(row.role) ? toSummary(row) : null;
}

type ModerationError = 'member_not_found' | 'no_display_name' | 'name_already_hidden';

interface ModerationInput {
  memberId: string;
  /** The Chair acting. */
  actorId: string;
}

/**
 * Hides a member's display name. It is never shown publicly again and stays taken, by everyone;
 * the member may choose one new name.
 */
async function hideMemberName(
  db: Database,
  { memberId, actorId }: ModerationInput,
  now: Date = new Date()
): Promise<Outcome<MemberSummary, ModerationError>> {
  return outcomeTransaction(db, async (tx) => {
    if (!(await findMemberUser(tx, memberId))) return fail('member_not_found');
    const row = await lockProfile(tx, memberId);
    if (!row.displayName || !row.displayNameKey) return fail('no_display_name');
    if (row.hiddenByChairAt) return fail('name_already_hidden');
    await tx
      .insert(memberReservedNames)
      .values({ nameKey: row.displayNameKey, userId: memberId, reservedAt: now })
      .onConflictDoNothing();
    await tx
      .update(memberProfiles)
      .set({ hiddenByChairAt: now })
      .where(eq(memberProfiles.userId, memberId));
    await tx.insert(memberEvents).values({
      userId: memberId,
      actorId,
      action: 'name_hidden',
      detail: row.displayName,
      createdAt: now,
    });
    return ok((await findMember(tx, memberId))!);
  });
}

/** Lets a member whose second name was hidden choose a name again (one more rename). */
async function allowMemberName(
  db: Database,
  { memberId, actorId }: ModerationInput,
  now: Date = new Date()
): Promise<Outcome<MemberSummary, 'member_not_found' | 'name_not_locked'>> {
  return outcomeTransaction(db, async (tx) => {
    if (!(await findMemberUser(tx, memberId))) return fail('member_not_found');
    const row = await lockProfile(tx, memberId);
    if (!isNameLocked(row)) return fail('name_not_locked');
    await tx
      .update(memberProfiles)
      .set({ renamedAfterHideAt: null })
      .where(eq(memberProfiles.userId, memberId));
    await tx
      .insert(memberEvents)
      .values({ userId: memberId, actorId, action: 'name_allowed', createdAt: now });
    return ok((await findMember(tx, memberId))!);
  });
}

/**
 * Logs a ban or unban. Better Auth's admin API does the ban itself (it revokes the member's
 * sessions), so the route calls this once that has succeeded.
 */
async function recordMemberEvent(
  db: Database,
  input: ModerationInput & { action: 'banned' | 'unbanned' }
): Promise<void> {
  await db
    .insert(memberEvents)
    .values({ userId: input.memberId, actorId: input.actorId, action: input.action });
}

// ---------------------------------------------------------------------------------------------
// The member's own data: export and deletion
// ---------------------------------------------------------------------------------------------

/**
 * How recently a member must have signed in (by email or passkey) to delete their account, so a
 * stolen session cookie alone can't. Better Auth's own freshness check is off (`freshAge: 0`,
 * src/lib/auth-config.ts), so this is the check.
 */
const FRESH_SIGN_IN_SECONDS = 10 * 60;

export function isFreshSignIn(sessionCreatedAt: Date | string, now: Date = new Date()): boolean {
  const age = now.getTime() - new Date(sessionCreatedAt).getTime();
  return age >= 0 && age <= FRESH_SIGN_IN_SECONDS * 1000;
}

/** Everything the club holds about a member, for "Download my data". Null for a Chair. */
async function exportMemberData(db: Database, userId: string) {
  const [account] = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      emailVerified: user.emailVerified,
      banned: user.banned,
      banExpires: user.banExpires,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(eq(user.id, userId));
  if (!account || hasAdminRole(account.role)) return null;

  const [[profile], reservedNames, passkeys, sessions, events, lunchLogs] = await Promise.all([
    db.select().from(memberProfiles).where(eq(memberProfiles.userId, userId)),
    db
      .select({ reservedAt: memberReservedNames.reservedAt })
      .from(memberReservedNames)
      .where(eq(memberReservedNames.userId, userId)),
    db
      .select({
        name: passkey.name,
        deviceType: passkey.deviceType,
        backedUp: passkey.backedUp,
        createdAt: passkey.createdAt,
      })
      .from(passkey)
      .where(eq(passkey.userId, userId)),
    db
      .select({
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
      })
      .from(session)
      .where(eq(session.userId, userId)),
    db
      .select({
        action: memberEvents.action,
        detail: memberEvents.detail,
        at: memberEvents.createdAt,
      })
      .from(memberEvents)
      .where(eq(memberEvents.userId, userId))
      .orderBy(memberEvents.createdAt),
    exportOwnLogs(db, userId),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    account: {
      email: account.email,
      name: account.name,
      emailVerified: account.emailVerified,
      banned: isBanned(account),
      joinedAt: account.createdAt.toISOString(),
    },
    profile: profile
      ? {
          displayName: profile.displayName,
          showPublicly: profile.showPublicly,
          nameHiddenByChairAt: profile.hiddenByChairAt?.toISOString() ?? null,
          renamedAfterHideAt: profile.renamedAfterHideAt?.toISOString() ?? null,
          createdAt: profile.createdAt.toISOString(),
        }
      : null,
    hiddenNames: reservedNames.length,
    passkeys: passkeys.map((row) => ({ ...row, createdAt: row.createdAt?.toISOString() ?? null })),
    sessions: sessions.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    })),
    moderation: events.map((row) => ({ ...row, at: row.at.toISOString() })),
    lunchLogs,
  };
}

/**
 * Deletes a member's account and everything about them: the cascade removes their sessions,
 * passkeys, profile, hidden names and moderation log, and this also removes the hashes of their
 * address kept for sign-in rate limits and any unused sign-in link, code or passkey grant. A
 * Chair's account is refused (Chairs are removed by other Chairs, never by themselves here).
 */
async function deleteMemberAccount(
  db: Database,
  userId: string
): Promise<Outcome<{ deleted: true }, 'member_not_found'>> {
  return outcomeTransaction(db, async (tx) => {
    const member = await findMemberUser(tx, userId, true);
    if (!member) return fail('member_not_found');
    const email = member.email.trim().toLowerCase();

    await tx
      .delete(memberSignInRequests)
      .where(eq(memberSignInRequests.emailHash, emailHash(email)));
    await tx
      .delete(verification)
      .where(
        or(
          inArray(verification.identifier, [
            `passkey-grant:${userId}`,
            `passkey-grant-failure:${userId}`,
            `sign-in-otp-${email}`,
          ]),
          and(
            sql`${verification.identifier} like 'magic-link:%'`,
            sql`position(${`"email":${JSON.stringify(email)}`} in ${verification.value}) > 0`
          )
        )
      );
    await tx.delete(user).where(eq(user.id, userId));
    return ok({ deleted: true as const });
  });
}

/**
 * Every operation on a member's account, in one object (like `venueLifecycle`), so a route test can
 * replace one with `mock.method` and check only the HTTP side; the behaviour is tested against the
 * database (src/test/integration/member-profiles.test.ts).
 */
export const memberAccounts = {
  getProfile: getMemberProfile,
  updateProfile: updateMemberProfile,
  list: listMembers,
  find: findMember,
  hideName: hideMemberName,
  allowName: allowMemberName,
  recordEvent: recordMemberEvent,
  exportData: exportMemberData,
  delete: deleteMemberAccount,
};
