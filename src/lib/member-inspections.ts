import { and, asc, desc, eq, gte, inArray, isNull, ne, or, sql, type SQL } from 'drizzle-orm';
import { user } from '@/db/auth-schema';
import {
  briberyRecords,
  memberInspections,
  memberProfiles,
  venuePublicScores,
  venues,
  type MemberInspectionRow,
} from '@/db/schema';
import { briberyValues } from '@/lib/bribery';
import { isUniqueViolation } from '@/lib/db-errors';
import type { Database, Tx } from '@/lib/db-client';
import { londonDate } from '@/lib/london-date';
import {
  ELIGIBLE_AFTER_DAYS,
  EDIT_WINDOW_MS,
  GAMING_WINDOW_DAYS,
  NEW_ACCOUNT_DAYS,
  SPIKE_BASELINE_DAYS,
  exceedsNewAccountLimit,
  isEligibleCount,
  isLoggableDate,
  isScoreSpike,
  isWithinEditWindow,
  logScore,
  memberWeight,
  verifyOnSite,
  weightedScore,
  type MemberInspectionInput,
  type MemberInspectionUpdate,
  type ScoreWindow,
} from '@/lib/member-inspection-rules';
import type {
  MemberCost,
  MemberHoldReason,
  MemberInspectionStatus,
  MemberVerdictVote,
} from '@/lib/member-inspection-display';
import { isOffensiveFoodText } from '@/lib/members/display-name-filter';
import { fail, ok, outcomeTransaction, publicChange, type Outcome } from '@/lib/outcome';
import { hasAdminRole } from '@/lib/roles';
import { hasQuorum, meterMode } from '@/lib/swing';
import { CLOSED_BUT_LISTED_TIER } from '@/lib/visibility';
import { publicVenueCondition } from '@/lib/visibility-sql';
import { daysAtVenue, notBanned, notRemoved, venuesLogged } from '@/lib/member-inspection-sql';
import { recomputeVenueScore } from '@/lib/public-scores';

/**
 * People's Inspections (#137): members log their own lunches. Apart from the Chairs'
 * `inspections` (which feed tiers): nothing here changes a venue's tier or the prerendered public
 * pages, so no operation returns `published` except recording a stuffing attempt, which adds to
 * the Hall of Shame.
 *
 * Rules (the pure ones, with their numbers, are in src/lib/member-inspection-rules.ts):
 * - One log per member per Europe/London day, across all venues: the unique index
 *   `member_inspections_one_per_member_day` and, before it, `create`. A member may log a lunch
 *   from the last week, but saves at most one new log per London day, so back-filling a week
 *   can't flood a venue in an afternoon.
 * - The Two-Visit Rule: a member's logs at a venue are eligible once they have logged there on two
 *   different days (`isEligible`). Removed logs don't count.
 * - Only venues that are public, open and not Gone But Not Forgotten take logs.
 * - On-site verification is GPS only; the member's position is used for the check and dropped.
 * - Anti-gaming: after each save, `holdIfGaming` checks the venue's last week and holds the logs
 *   behind a suspicious pattern for a Chair to approve or remove.
 * - Pull quotes and dishes pass the server-side profanity filter. Removal reasons are internal.
 *
 * The public read (`recentPublic`) returns no member id, email or position, and a display name
 * only when the member opted in and no Chair hid it. A banned member's logs are left out of it.
 */

type Db = Database | Tx;

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------------------------
// Shared SQL
// ---------------------------------------------------------------------------------------------

/** The venues that take logs, as a query condition. Its twin is `isLoggableVenue`. */
function loggableVenueCondition(): SQL {
  return and(
    publicVenueCondition(),
    isNull(venues.closedAt),
    ne(venues.tier, CLOSED_BUT_LISTED_TIER)
  )!;
}

/** A display name the public may see: opted in, and not hidden by a Chair. */
const publicName = sql<string | null>`case
  when ${memberProfiles.showPublicly} and ${memberProfiles.hiddenByChairAt} is null
  then ${memberProfiles.displayName}
end`;

// ---------------------------------------------------------------------------------------------
// The member's own logs
// ---------------------------------------------------------------------------------------------

export interface MemberInspectionView {
  id: string;
  venue: { id: string; slug: string; name: string };
  visitDate: string;
  dish: string;
  cost: MemberCost;
  verdictVote: MemberVerdictVote;
  pullQuote: string | null;
  verifiedOnSite: boolean;
  status: MemberInspectionStatus;
  /** The member's only log at this venue so far: it doesn't count for scores yet. */
  provisional: boolean;
  createdAt: string;
  /** When editing and deleting close. */
  editableUntil: string;
  canEdit: boolean;
}

const ownColumns = {
  id: memberInspections.id,
  venueId: venues.id,
  venueSlug: venues.slug,
  venueName: venues.name,
  visitDate: memberInspections.visitDate,
  dish: memberInspections.dish,
  cost: memberInspections.cost,
  verdictVote: memberInspections.verdictVote,
  pullQuote: memberInspections.pullQuote,
  verifiedOnSite: memberInspections.verifiedOnSite,
  status: memberInspections.status,
  createdAt: memberInspections.createdAt,
  daysAtVenue,
};

type OwnRow = {
  id: string;
  venueId: string;
  venueSlug: string;
  venueName: string;
  visitDate: string;
  dish: string;
  cost: MemberCost;
  verdictVote: MemberVerdictVote;
  pullQuote: string | null;
  verifiedOnSite: boolean;
  status: MemberInspectionStatus;
  createdAt: Date;
  daysAtVenue: number;
};

function toView(row: OwnRow, now: Date): MemberInspectionView {
  return {
    id: row.id,
    venue: { id: row.venueId, slug: row.venueSlug, name: row.venueName },
    visitDate: row.visitDate,
    dish: row.dish,
    cost: row.cost,
    verdictVote: row.verdictVote,
    pullQuote: row.pullQuote,
    verifiedOnSite: row.verifiedOnSite,
    status: row.status,
    provisional: row.status !== 'removed' && !isEligibleCount(Number(row.daysAtVenue)),
    createdAt: row.createdAt.toISOString(),
    editableUntil: new Date(row.createdAt.getTime() + EDIT_WINDOW_MS).toISOString(),
    canEdit: row.status !== 'removed' && isWithinEditWindow(row.createdAt, now),
  };
}

function ownQuery(db: Db, where: SQL) {
  return db
    .select(ownColumns)
    .from(memberInspections)
    .innerJoin(venues, eq(venues.id, memberInspections.venueId))
    .where(where);
}

/** The member's logs, newest lunch first. */
async function listOwn(
  db: Database,
  memberId: string,
  now: Date = new Date()
): Promise<MemberInspectionView[]> {
  const rows = await ownQuery(db, eq(memberInspections.memberId, memberId)).orderBy(
    desc(memberInspections.visitDate),
    desc(memberInspections.createdAt)
  );
  return rows.map((row) => toView(row, now));
}

/** One of the member's logs, or null when it isn't theirs. */
async function findOwn(
  db: Db,
  memberId: string,
  id: string,
  now: Date = new Date()
): Promise<MemberInspectionView | null> {
  const [row] = await ownQuery(
    db,
    and(eq(memberInspections.memberId, memberId), eq(memberInspections.id, id))!
  ).limit(1);
  return row ? toView(row, now) : null;
}

/**
 * What blocks a new log today, if anything: the member's log for today's lunch, or else the log
 * they already saved today for an earlier day (one new log per London day, see `createLog`).
 */
async function findBlockingToday(
  db: Database,
  memberId: string,
  now: Date = new Date()
): Promise<MemberInspectionView | null> {
  const today = londonDate(now);
  const [row] = await ownQuery(
    db,
    and(
      eq(memberInspections.memberId, memberId),
      or(
        eq(memberInspections.visitDate, today),
        sql`(${memberInspections.createdAt} at time zone 'Europe/London')::date = ${today}::date`
      )
    )!
  )
    // Today's lunch first, if there is one.
    .orderBy(desc(eq(memberInspections.visitDate, today)), desc(memberInspections.createdAt))
    .limit(1);
  return row ? toView(row, now) : null;
}

/** The Two-Visit Rule: whether the member's logs at this venue count for scores. */
export async function isEligible(db: Db, memberId: string, venueId: string): Promise<boolean> {
  const [row] = await db
    .select({ days: sql<number>`count(*)::int` })
    .from(memberInspections)
    .where(
      and(
        eq(memberInspections.memberId, memberId),
        eq(memberInspections.venueId, venueId),
        notRemoved
      )
    );
  return isEligibleCount(Number(row?.days ?? 0));
}

export interface LoggableVenue {
  id: string;
  slug: string;
  name: string;
}

/** The venues the log form offers, by name. */
async function listLoggableVenues(db: Database): Promise<LoggableVenue[]> {
  return db
    .select({ id: venues.id, slug: venues.slug, name: venues.name })
    .from(venues)
    .where(loggableVenueCondition())
    .orderBy(asc(venues.name));
}

type TextError = 'dish_offensive' | 'quote_offensive';

function checkText(input: { dish: string; pullQuote: string | null }): TextError | null {
  if (isOffensiveFoodText(input.dish)) return 'dish_offensive';
  if (input.pullQuote && isOffensiveFoodText(input.pullQuote)) return 'quote_offensive';
  return null;
}

type CreateError =
  | TextError
  | 'member_not_found'
  | 'visit_date_out_of_range'
  | 'venue_not_loggable'
  | 'already_logged_that_day'
  | 'daily_log_limit';

/** Logs a lunch. The position, if any, decides `verification` and is not kept. */
async function createLog(
  db: Database,
  memberId: string,
  input: MemberInspectionInput,
  now: Date = new Date()
): Promise<Outcome<MemberInspectionView, CreateError>> {
  const today = londonDate(now);
  if (!isLoggableDate(input.visitDate, today)) return fail('visit_date_out_of_range');
  const textError = checkText(input);
  if (textError) return fail(textError);

  try {
    return await outcomeTransaction(db, async (tx) => {
      // Locks the member's account row, so two saves at once are taken one after the other.
      const [member] = await tx
        .select({ id: user.id, role: user.role })
        .from(user)
        .where(eq(user.id, memberId))
        .for('update');
      if (!member || hasAdminRole(member.role)) return fail('member_not_found');

      const [venue] = await tx
        .select({ id: venues.id, latitude: venues.latitude, longitude: venues.longitude })
        .from(venues)
        .where(and(eq(venues.id, input.venueId), loggableVenueCondition()))
        .limit(1);
      if (!venue) return fail('venue_not_loggable');

      const [sameDay] = await tx
        .select({ id: memberInspections.id })
        .from(memberInspections)
        .where(
          and(
            eq(memberInspections.memberId, memberId),
            eq(memberInspections.visitDate, input.visitDate)
          )
        )
        .limit(1);
      if (sameDay) return fail('already_logged_that_day');

      // The rate limit: one new log per London day, whichever day it is for.
      const [savedToday] = await tx
        .select({ id: memberInspections.id })
        .from(memberInspections)
        .where(
          and(
            eq(memberInspections.memberId, memberId),
            sql`(${memberInspections.createdAt} at time zone 'Europe/London')::date = ${today}::date`
          )
        )
        .limit(1);
      if (savedToday) return fail('daily_log_limit');

      const verification = verifyOnSite(input.position, {
        lat: venue.latitude === null ? null : Number(venue.latitude),
        lng: venue.longitude === null ? null : Number(venue.longitude),
      });
      const [saved] = await tx
        .insert(memberInspections)
        .values({
          venueId: venue.id,
          memberId,
          visitDate: input.visitDate,
          dish: input.dish,
          cost: input.cost,
          verdictVote: input.verdictVote,
          pullQuote: input.pullQuote,
          verification,
          verifiedOnSite: verification !== 'none',
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: memberInspections.id });

      await holdIfGaming(tx, venue.id, now);
      await recomputeVenueScore(tx, venue.id, now);
      return ok((await findOwn(tx, memberId, saved.id, now))!);
    });
  } catch (error) {
    // Another save for the same day got there first.
    if (isUniqueViolation(error)) return fail('already_logged_that_day');
    throw error;
  }
}

type ChangeError = 'member_inspection_not_found' | 'log_removed' | 'edit_window_closed';

/** The member's own log, locked, if they may still change it. */
async function lockOwnForChange(
  tx: Tx,
  memberId: string,
  id: string,
  now: Date
): Promise<MemberInspectionRow | ChangeError> {
  const [row] = await tx
    .select()
    .from(memberInspections)
    .where(and(eq(memberInspections.id, id), eq(memberInspections.memberId, memberId)))
    .for('update');
  if (!row) return 'member_inspection_not_found';
  if (row.status === 'removed') return 'log_removed';
  if (!isWithinEditWindow(row.createdAt, now)) return 'edit_window_closed';
  return row;
}

/** Edits a log within 24 hours of saving it. The venue, the day and the on-site check stay. */
async function updateLog(
  db: Database,
  memberId: string,
  id: string,
  input: MemberInspectionUpdate,
  now: Date = new Date()
): Promise<Outcome<MemberInspectionView, ChangeError | TextError>> {
  const textError = checkText(input);
  if (textError) return fail(textError);
  return outcomeTransaction(db, async (tx) => {
    const row = await lockOwnForChange(tx, memberId, id, now);
    if (typeof row === 'string') return fail(row);
    await tx
      .update(memberInspections)
      .set({ ...input, updatedAt: now })
      .where(eq(memberInspections.id, id));
    await holdIfGaming(tx, row.venueId, now);
    await recomputeVenueScore(tx, row.venueId, now);
    return ok((await findOwn(tx, memberId, id, now))!);
  });
}

/** Deletes a log within 24 hours of saving it. */
async function deleteLog(
  db: Database,
  memberId: string,
  id: string,
  now: Date = new Date()
): Promise<Outcome<{ deleted: true }, ChangeError>> {
  return outcomeTransaction(db, async (tx) => {
    const row = await lockOwnForChange(tx, memberId, id, now);
    if (typeof row === 'string') return fail(row);
    await tx.delete(memberInspections).where(eq(memberInspections.id, id));
    await recomputeVenueScore(tx, row.venueId, now);
    return ok({ deleted: true as const });
  });
}

// ---------------------------------------------------------------------------------------------
// Anti-gaming
// ---------------------------------------------------------------------------------------------

/**
 * Checks a venue's last week of logs after a save and holds the logs behind a suspicious pattern:
 * - more than five eligible logs from accounts under 14 days old (those logs are held);
 * - the week's mean verdict score more than 1.5 points from the 90 days before it (the week's logs are
 *   held).
 * Only visible logs no Chair has reviewed are held: a log a Chair approved stays visible. Held
 * logs still count towards the checks, so later logs in the same pattern are held too.
 */
async function holdIfGaming(tx: Tx, venueId: string, now: Date): Promise<void> {
  const weekStart = new Date(now.getTime() - GAMING_WINDOW_DAYS * DAY_MS);
  const baselineStart = new Date(weekStart.getTime() - SPIKE_BASELINE_DAYS * DAY_MS);
  const rows = await tx
    .select({
      id: memberInspections.id,
      verdictVote: memberInspections.verdictVote,
      status: memberInspections.status,
      reviewedAt: memberInspections.reviewedAt,
      createdAt: memberInspections.createdAt,
      accountCreatedAt: user.createdAt,
    })
    .from(memberInspections)
    .innerJoin(user, eq(user.id, memberInspections.memberId))
    .where(
      and(
        eq(memberInspections.venueId, venueId),
        notRemoved,
        gte(memberInspections.createdAt, baselineStart),
        sql`${daysAtVenue} >= ${ELIGIBLE_AFTER_DAYS}`
      )
    );

  const week = rows.filter((row) => row.createdAt >= weekStart && row.createdAt <= now);
  const baseline = rows.filter((row) => row.createdAt < weekStart);
  const fromNewAccounts = week.filter(
    (row) => row.createdAt.getTime() - row.accountCreatedAt.getTime() < NEW_ACCOUNT_DAYS * DAY_MS
  );

  const holds = new Map<string, MemberHoldReason>();
  if (exceedsNewAccountLimit(fromNewAccounts.length)) {
    for (const row of fromNewAccounts) holds.set(row.id, 'new_accounts');
  }
  if (isScoreSpike(scoreWindow(week), scoreWindow(baseline))) {
    for (const row of week) if (!holds.has(row.id)) holds.set(row.id, 'score_spike');
  }

  const toHold = week.filter(
    (row) => holds.has(row.id) && row.status === 'visible' && row.reviewedAt === null
  );
  for (const reason of ['new_accounts', 'score_spike'] as const) {
    const ids = toHold.filter((row) => holds.get(row.id) === reason).map((row) => row.id);
    if (!ids.length) continue;
    await tx
      .update(memberInspections)
      .set({ status: 'held', heldReason: reason })
      .where(inArray(memberInspections.id, ids));
  }
}

function scoreWindow(logs: { verdictVote: MemberVerdictVote }[]): ScoreWindow {
  if (!logs.length) return { mean: null, count: 0 };
  const total = logs.reduce((sum, log) => sum + logScore(log), 0);
  return { mean: total / logs.length, count: logs.length };
}

// ---------------------------------------------------------------------------------------------
// The public venue page
// ---------------------------------------------------------------------------------------------

const PUBLIC_RECENT_LIMIT = 5;

/** One log as the public sees it: no member id, email or position. */
interface PublicMemberInspection {
  visitDate: string;
  dish: string;
  cost: MemberCost;
  verdictVote: MemberVerdictVote;
  pullQuote: string | null;
  verifiedOnSite: boolean;
  provisional: boolean;
  /** Only when the member chose to show it and no Chair hid it. */
  displayName: string | null;
}

export interface PublicInspectionsFeed {
  recent: PublicMemberInspection[];
  /**
   * The weighted mean of eligible visible logs (Two-Visit Rule, member weights). Null while
   * `verdictPending`: a venue short of its quorum shows no public number at all.
   */
  score: number | null;
  eligibleLogs: number;
  /**
   * The venue gets a People's Verdict meter but is short of its quorum, so the page says so under
   * "Recent inspections from the public". False once there is a quorum and for venues with no meter.
   * Read from the stored aggregate (venue_public_scores), like the meter, so the two always agree.
   */
  verdictPending: boolean;
  /** Whether the Chairs have given a verdict, for the wording of that note. */
  chairsDecided: boolean;
}

/** The venue page's "Recent inspections from the public". Null for a venue that isn't public. */
async function recentPublic(db: Database, slug: string): Promise<PublicInspectionsFeed | null> {
  const [venue] = await db
    .select({ id: venues.id, tier: venues.tier, closedAt: venues.closedAt })
    .from(venues)
    .where(and(eq(venues.slug, slug), publicVenueCondition()))
    .limit(1);
  if (!venue) return null;
  const mode = meterMode({ tier: venue.tier, closed: venue.closedAt !== null });
  const visibleHere = and(
    eq(memberInspections.venueId, venue.id),
    eq(memberInspections.status, 'visible'),
    notBanned
  );

  const [recent, scored, [stored]] = await Promise.all([
    db
      .select({
        visitDate: memberInspections.visitDate,
        dish: memberInspections.dish,
        cost: memberInspections.cost,
        verdictVote: memberInspections.verdictVote,
        pullQuote: memberInspections.pullQuote,
        verifiedOnSite: memberInspections.verifiedOnSite,
        daysAtVenue,
        displayName: publicName,
      })
      .from(memberInspections)
      .leftJoin(memberProfiles, eq(memberProfiles.userId, memberInspections.memberId))
      .where(visibleHere)
      .orderBy(desc(memberInspections.visitDate), desc(memberInspections.createdAt))
      .limit(PUBLIC_RECENT_LIMIT),
    db
      .select({
        verdictVote: memberInspections.verdictVote,
        venuesLogged,
      })
      .from(memberInspections)
      .where(and(visibleHere, sql`${daysAtVenue} >= ${ELIGIBLE_AFTER_DAYS}`)),
    // The meter's own count: the note stands in for the hidden meter, so it must read the same
    // stored aggregate the swing endpoint does, not a live recount that can run ahead of it.
    db
      .select({ eligibleMembers: venuePublicScores.eligibleMembers })
      .from(venuePublicScores)
      .where(eq(venuePublicScores.venueId, venue.id))
      .limit(1),
  ]);

  const verdictPending = mode.kind !== 'none' && !hasQuorum(stored?.eligibleMembers ?? 0);

  return {
    recent: recent.map(({ daysAtVenue: days, ...row }) => ({
      ...row,
      provisional: !isEligibleCount(Number(days)),
    })),
    // Below the quorum the People's Verdict is withheld, so no number is shown in its place.
    score: verdictPending
      ? null
      : weightedScore(
          scored.map((row) => ({
            score: logScore(row),
            weight: memberWeight(Number(row.venuesLogged)),
          }))
        ),
    eligibleLogs: verdictPending ? 0 : scored.length,
    verdictPending,
    chairsDecided: mode.kind === 'decided',
  };
}

// ---------------------------------------------------------------------------------------------
// The Chairs' moderation queue
// ---------------------------------------------------------------------------------------------

export interface HeldLogView {
  id: string;
  venue: { id: string; slug: string; name: string };
  visitDate: string;
  dish: string;
  cost: MemberCost;
  verdictVote: MemberVerdictVote;
  pullQuote: string | null;
  verifiedOnSite: boolean;
  heldReason: MemberHoldReason | null;
  /** The member's display name, shown to the Chairs even if private; null when they have none. */
  memberName: string | null;
  memberJoinedAt: string;
  createdAt: string;
}

export const HELD_LIST_LIMIT = 200;

/** Held logs, oldest first so the queue is worked in order. No email addresses. */
async function listHeld(db: Database, limit = HELD_LIST_LIMIT): Promise<HeldLogView[]> {
  const rows = await db
    .select({
      id: memberInspections.id,
      venueId: venues.id,
      venueSlug: venues.slug,
      venueName: venues.name,
      visitDate: memberInspections.visitDate,
      dish: memberInspections.dish,
      cost: memberInspections.cost,
      verdictVote: memberInspections.verdictVote,
      pullQuote: memberInspections.pullQuote,
      verifiedOnSite: memberInspections.verifiedOnSite,
      heldReason: memberInspections.heldReason,
      memberName: memberProfiles.displayName,
      memberJoinedAt: user.createdAt,
      createdAt: memberInspections.createdAt,
    })
    .from(memberInspections)
    .innerJoin(venues, eq(venues.id, memberInspections.venueId))
    .innerJoin(user, eq(user.id, memberInspections.memberId))
    .leftJoin(memberProfiles, eq(memberProfiles.userId, memberInspections.memberId))
    .where(eq(memberInspections.status, 'held'))
    .orderBy(asc(memberInspections.createdAt))
    .limit(limit);
  return rows.map(({ venueId, venueSlug, venueName, memberJoinedAt, createdAt, ...row }) => ({
    ...row,
    venue: { id: venueId, slug: venueSlug, name: venueName },
    memberJoinedAt: memberJoinedAt.toISOString(),
    createdAt: createdAt.toISOString(),
  }));
}

interface ReviewInput {
  id: string;
  /** The Chair acting. */
  actorId: string;
}

/** Releases a held log: it shows publicly, and the checks never hold it again. */
async function approveLog(
  db: Database,
  { id, actorId }: ReviewInput,
  now: Date = new Date()
): Promise<Outcome<{ id: string; status: 'visible' }, 'member_inspection_not_found' | 'not_held'>> {
  return outcomeTransaction(db, async (tx) => {
    const [row] = await tx
      .select({ status: memberInspections.status, venueId: memberInspections.venueId })
      .from(memberInspections)
      .where(eq(memberInspections.id, id))
      .for('update');
    if (!row) return fail('member_inspection_not_found');
    if (row.status !== 'held') return fail('not_held');
    await tx
      .update(memberInspections)
      .set({ status: 'visible', reviewedBy: actorId, reviewedAt: now })
      .where(eq(memberInspections.id, id));
    await recomputeVenueScore(tx, row.venueId, now);
    return ok({ id, status: 'visible' as const });
  });
}

/** Removes a log, held or not, with a reason that stays internal. */
async function removeLog(
  db: Database,
  { id, actorId, reason }: ReviewInput & { reason: string },
  now: Date = new Date()
): Promise<
  Outcome<
    { id: string; status: 'removed' },
    'member_inspection_not_found' | 'already_removed' | 'removal_reason_required'
  >
> {
  const why = reason.trim();
  if (!why) return fail('removal_reason_required');
  return outcomeTransaction(db, async (tx) => {
    const [row] = await tx
      .select({ status: memberInspections.status, venueId: memberInspections.venueId })
      .from(memberInspections)
      .where(eq(memberInspections.id, id))
      .for('update');
    if (!row) return fail('member_inspection_not_found');
    if (row.status === 'removed') return fail('already_removed');
    await tx
      .update(memberInspections)
      .set({ status: 'removed', reviewedBy: actorId, reviewedAt: now, reviewReason: why })
      .where(eq(memberInspections.id, id));
    await recomputeVenueScore(tx, row.venueId, now);
    return ok({ id, status: 'removed' as const });
  });
}

interface StuffingInput {
  venueId: string;
  /** The logs that were part of the attempt, all at `venueId`. */
  inspectionIds: string[];
  title: string;
  description: string;
  /** Put the record in the public Hall of Shame now, or keep it for the Chairs to publish. */
  published: boolean;
}

/**
 * A confirmed stuffing attempt: a new bribery record for the venue, and its logs removed and
 * linked to it. All or nothing.
 */
async function recordStuffing(
  db: Database,
  input: StuffingInput & { actorId: string },
  now: Date = new Date()
): Promise<
  Outcome<
    { briberyRecordId: string; removed: number },
    'stuffing_logs_mismatch' | 'bribery_venue_unknown'
  >
> {
  const ids = [...new Set(input.inspectionIds)];
  return outcomeTransaction(db, async (tx) => {
    const rows = await tx
      .select({ id: memberInspections.id, venueId: memberInspections.venueId })
      .from(memberInspections)
      .where(inArray(memberInspections.id, ids))
      .for('update');
    if (rows.length !== ids.length || rows.some((row) => row.venueId !== input.venueId)) {
      return fail('stuffing_logs_mismatch');
    }
    const values = await briberyValues(tx, {
      title: input.title,
      venueId: input.venueId,
      venueNameText: null,
      incidentDate: londonDate(now),
      incidentTime: null,
      location: null,
      peopleInvolved: [],
      witnesses: [],
      benefitOffered: null,
      value: null,
      description: input.description,
      outcome: `${ids.length === 1 ? 'One log' : `${ids.length} logs`} removed from the People’s Inspections.`,
      published: input.published,
    });
    if (!values) return fail('bribery_venue_unknown');
    const [record] = await tx
      .insert(briberyRecords)
      .values({ ...values, createdBy: input.actorId })
      .returning({ id: briberyRecords.id });
    await tx
      .update(memberInspections)
      .set({
        status: 'removed',
        reviewedBy: input.actorId,
        reviewedAt: now,
        reviewReason: 'Confirmed stuffing attempt.',
        briberyRecordId: record.id,
      })
      .where(inArray(memberInspections.id, ids));
    await recomputeVenueScore(tx, input.venueId, now);
    const value = { briberyRecordId: record.id, removed: ids.length };
    // The Hall of Shame is prerendered: a published record waits for the Chairs to publish it.
    return input.published ? ok(value, publicChange('Create bribery record', null)) : ok(value);
  });
}

/** For "Download my data": the member's logs, without the Chairs' internal notes. */
export async function exportOwnLogs(db: Database, memberId: string) {
  const rows = await db
    .select({
      venue: venues.name,
      visitDate: memberInspections.visitDate,
      dish: memberInspections.dish,
      cost: memberInspections.cost,
      verdictVote: memberInspections.verdictVote,
      pullQuote: memberInspections.pullQuote,
      verification: memberInspections.verification,
      status: memberInspections.status,
      createdAt: memberInspections.createdAt,
      updatedAt: memberInspections.updatedAt,
    })
    .from(memberInspections)
    .innerJoin(venues, eq(venues.id, memberInspections.venueId))
    .where(eq(memberInspections.memberId, memberId))
    .orderBy(asc(memberInspections.visitDate));
  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

/**
 * Every operation on members' lunch logs, in one object (like `memberAccounts`), so a route test
 * can replace one with `mock.method`; the behaviour is tested against the database
 * (src/test/integration/member-inspections.test.ts).
 */
export const memberInspectionsApi = {
  listOwn,
  findOwn,
  findBlockingToday,
  listLoggableVenues,
  create: createLog,
  update: updateLog,
  delete: deleteLog,
  recentPublic,
  listHeld,
  approve: approveLog,
  remove: removeLog,
  recordStuffing,
};
