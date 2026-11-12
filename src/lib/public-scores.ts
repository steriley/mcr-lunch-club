import { and, asc, eq, gte, isNull, notInArray, sql } from 'drizzle-orm';
import {
  memberInspections,
  venuePublicScoreHistory,
  venuePublicScores,
  venues,
  type VenuePublicScoreRow,
} from '@/db/schema';
import type { Database, Tx } from '@/lib/db-client';
import { ELIGIBLE_AFTER_DAYS, addDays, memberWeight } from '@/lib/member-inspection-rules';
import { daysAtVenue, notBanned, venuesLogged } from '@/lib/member-inspection-sql';
import { londonDate } from '@/lib/london-date';
import {
  SWING_HISTORY_DAYS,
  bandOf,
  buildVenueSwing,
  distanceFromBand,
  hasQuorum,
  meterMode,
  peoplePosition,
  summariseLogs,
  type ScoreAggregate,
  type SwingBand,
  type SwingHistoryPoint,
  type VenueSwing,
} from '@/lib/swing';
import type { TierValue } from '@/lib/tiers';
import { publicVenueCondition } from '@/lib/visibility-sql';

/**
 * The Swing-o-meter's data (#138). `recomputeVenueScore` runs inside the transaction of every
 * People's Inspections write, so the stored aggregates are never behind a committed log; the
 * daily cron (`refreshAllScores`) catches what no write sees: a ban starting or ending, an account
 * deleted, and a member's weight changing because of logs at other venues. The reads finish the
 * People's score against the venue's current tier (src/lib/swing.ts), so a tier change needs no
 * recompute. Nothing returned here identifies or locates a member.
 */

type Db = Database | Tx;

/** The venue's eligible logs, as `summariseLogs` wants them: visible, not banned, Two-Visit Rule. */
async function eligibleLogs(db: Db, venueId: string) {
  const rows = await db
    .select({
      memberId: memberInspections.memberId,
      verdictVote: memberInspections.verdictVote,
      cost: memberInspections.cost,
      venuesLogged,
    })
    .from(memberInspections)
    .where(
      and(
        eq(memberInspections.venueId, venueId),
        eq(memberInspections.status, 'visible'),
        notBanned,
        sql`${daysAtVenue} >= ${ELIGIBLE_AFTER_DAYS}`
      )
    );
  return rows.map(({ venuesLogged: count, ...row }) => ({
    ...row,
    weight: memberWeight(Number(count)),
  }));
}

function toRow(venueId: string, aggregate: ScoreAggregate, now: Date) {
  return {
    venueId,
    eligibleMembers: aggregate.eligibleMembers,
    eligibleLogs: aggregate.eligibleLogs,
    weightTotal: aggregate.weightTotal,
    weightedSum: aggregate.weightedSum,
    variance: aggregate.variance,
    approveCount: aggregate.verdictCounts.approve,
    ifWeMustCount: aggregate.verdictCounts.if_we_must,
    rejectCount: aggregate.verdictCounts.reject,
    typicalCost: aggregate.typicalCost,
    updatedAt: now,
  };
}

function toAggregate(row: VenuePublicScoreRow | undefined): ScoreAggregate {
  return {
    eligibleMembers: row?.eligibleMembers ?? 0,
    eligibleLogs: row?.eligibleLogs ?? 0,
    weightTotal: row?.weightTotal ?? 0,
    weightedSum: row?.weightedSum ?? 0,
    variance: row?.variance ?? 0,
    verdictCounts: {
      approve: row?.approveCount ?? 0,
      if_we_must: row?.ifWeMustCount ?? 0,
      reject: row?.rejectCount ?? 0,
    },
    typicalCost: row?.typicalCost ?? null,
  };
}

/**
 * Recomputes and stores one venue's aggregates. Call it inside the write's transaction. It takes a
 * per-venue advisory lock first (held until the transaction ends), so two writes at one venue, or a
 * write and the daily refresh, are taken one after the other and the later one reads the earlier
 * one's committed logs instead of overwriting it with a stale total.
 */
export async function recomputeVenueScore(
  db: Tx,
  venueId: string,
  now: Date = new Date()
): Promise<void> {
  await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${venueId}, 0))`);
  const row = toRow(venueId, summariseLogs(await eligibleLogs(db, venueId)), now);
  await db
    .insert(venuePublicScores)
    .values(row)
    .onConflictDoUpdate({ target: venuePublicScores.venueId, set: row });
}

/**
 * Recomputes every venue a member has logged at: for a ban or a lifted ban, which add or remove
 * all their logs from those venues' scores at once. (A ban that expires on its own is caught by
 * the daily refresh.)
 */
export async function recomputeMemberVenues(
  db: Database,
  memberId: string,
  now: Date = new Date()
): Promise<void> {
  const rows = await db
    .selectDistinct({ id: memberInspections.venueId })
    .from(memberInspections)
    .where(eq(memberInspections.memberId, memberId));
  for (const { id } of rows) await db.transaction((tx) => recomputeVenueScore(tx, id, now));
}

/**
 * The daily refresh: recomputes every venue that has logs (or a stored row), writes today's
 * history point for each quorate venue that gets a meter, and drops history older than 90 days.
 */
export async function refreshAllScores(
  db: Database,
  now: Date = new Date()
): Promise<{ venues: number; snapshots: number }> {
  const withLogs = await db
    .selectDistinct({ id: memberInspections.venueId })
    .from(memberInspections);
  const withRows = await db.select({ id: venuePublicScores.venueId }).from(venuePublicScores);
  const ids = [...new Set([...withLogs, ...withRows].map((row) => row.id))];
  for (const id of ids) await db.transaction((tx) => recomputeVenueScore(tx, id, now));

  const today = londonDate(now);
  const rows = await db
    .select({
      venueId: venuePublicScores.venueId,
      tier: venues.tier,
      closedAt: venues.closedAt,
      score: venuePublicScores,
    })
    .from(venuePublicScores)
    .innerJoin(venues, eq(venues.id, venuePublicScores.venueId))
    .where(publicVenueCondition());
  let snapshots = 0;
  const quorate: string[] = [];
  for (const row of rows) {
    const mode = meterMode({ tier: row.tier, closed: row.closedAt !== null });
    const aggregate = toAggregate(row.score);
    if (!hasQuorum(aggregate.eligibleMembers)) continue;
    const position = peoplePosition(aggregate, mode);
    if (position === null) continue;
    const value = {
      venueId: row.venueId,
      day: today,
      position: Math.round(position),
      eligibleMembers: aggregate.eligibleMembers,
    };
    await db
      .insert(venuePublicScoreHistory)
      .values(value)
      .onConflictDoUpdate({
        target: [venuePublicScoreHistory.venueId, venuePublicScoreHistory.day],
        set: value,
      });
    snapshots += 1;
    quorate.push(row.venueId);
  }
  // A venue that is no longer quorate (or has lost its meter) keeps no history, so the sparkline
  // never joins an old line to a new one across a gap.
  await db
    .delete(venuePublicScoreHistory)
    .where(quorate.length ? notInArray(venuePublicScoreHistory.venueId, quorate) : sql`true`);
  await db
    .delete(venuePublicScoreHistory)
    .where(sql`${venuePublicScoreHistory.day} < ${addDays(today, -SWING_HISTORY_DAYS)}::date`);
  return { venues: ids.length, snapshots };
}

// ---------------------------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------------------------

async function history(db: Db, venueId: string, today: string): Promise<SwingHistoryPoint[]> {
  const rows = await db
    .select({ day: venuePublicScoreHistory.day, position: venuePublicScoreHistory.position })
    .from(venuePublicScoreHistory)
    .where(
      and(
        eq(venuePublicScoreHistory.venueId, venueId),
        gte(venuePublicScoreHistory.day, addDays(today, -SWING_HISTORY_DAYS))
      )
    )
    .orderBy(asc(venuePublicScoreHistory.day));
  return rows;
}

/**
 * One venue's meter for `GET /api/public/venues/:slug/swing`. Null when the venue isn't public or
 * gets no meter (Gone But Not Forgotten, closed).
 */
export async function venueSwing(
  db: Database,
  slug: string,
  now: Date = new Date()
): Promise<VenueSwing | null> {
  const [venue] = await db
    .select({ id: venues.id, tier: venues.tier, closedAt: venues.closedAt })
    .from(venues)
    .where(and(eq(venues.slug, slug), publicVenueCondition()))
    .limit(1);
  if (!venue) return null;
  const mode = meterMode({ tier: venue.tier, closed: venue.closedAt !== null });
  if (mode.kind === 'none') return null;
  const [score] = await db
    .select()
    .from(venuePublicScores)
    .where(eq(venuePublicScores.venueId, venue.id))
    .limit(1);
  const aggregate = toAggregate(score);
  return buildVenueSwing(
    mode,
    aggregate,
    hasQuorum(aggregate.eligibleMembers) ? await history(db, venue.id, londonDate(now)) : []
  );
}

// ---------------------------------------------------------------------------------------------
// The Count
// ---------------------------------------------------------------------------------------------

export interface CountEntry {
  slug: string;
  name: string;
  tier: TierValue;
  chairsBand: SwingBand;
  peopleBand: SwingBand;
  position: number;
  eligibleMembers: number;
}

interface ContestedEntry {
  slug: string;
  name: string;
  position: number;
  /** The weighted spread of the logs' positions, 0 (agreed) to 50 (split down the middle). */
  spread: number;
  eligibleMembers: number;
}

export interface TheCount {
  /** Decided venues the People put in a more generous band, furthest first. */
  moreGenerous: CountEntry[];
  /** Decided venues the People put in a harsher band, furthest first. */
  harsher: CountEntry[];
  mostContested: ContestedEntry[];
  /** Share of quorate decided venues with the People's bar inside the Chairs' band, or null. */
  approvalRating: { percent: number; inside: number; quorate: number } | null;
  /** Venues with a quorum, Straw Polls included. */
  quorateVenues: number;
}

const COUNT_LIST_LIMIT = 5;

/** Every quorate venue's meter, finished against its current tier. Straw Polls included. */
async function quorateMeters(db: Database) {
  const rows = await db
    .select({
      slug: venues.slug,
      name: venues.name,
      tier: venues.tier,
      closedAt: venues.closedAt,
      score: venuePublicScores,
    })
    .from(venuePublicScores)
    .innerJoin(venues, eq(venues.id, venuePublicScores.venueId))
    .where(and(publicVenueCondition(), isNull(venues.closedAt)));
  const meters = [];
  for (const row of rows) {
    if (row.tier === null) continue;
    const mode = meterMode({ tier: row.tier, closed: false });
    const aggregate = toAggregate(row.score);
    if (mode.kind === 'none' || !hasQuorum(aggregate.eligibleMembers)) continue;
    const position = peoplePosition(aggregate, mode)!;
    meters.push({ ...row, tier: row.tier, mode, aggregate, position });
  }
  return meters;
}

export async function theCount(db: Database): Promise<TheCount> {
  const meters = await quorateMeters(db);
  const entries = meters.flatMap((meter) =>
    meter.mode.kind === 'decided'
      ? [
          {
            ...meter,
            chairsBand: meter.mode.chairsBand,
            distance: distanceFromBand(meter.position, meter.mode.chairsBand),
          },
        ]
      : []
  );
  const toEntry = (meter: (typeof entries)[number]): CountEntry => ({
    slug: meter.slug,
    name: meter.name,
    tier: meter.tier,
    chairsBand: meter.chairsBand,
    peopleBand: bandOf(meter.position),
    position: Math.round(meter.position),
    eligibleMembers: meter.aggregate.eligibleMembers,
  });
  const inside = entries.filter((meter) => meter.distance === 0).length;
  return {
    moreGenerous: entries
      .filter((meter) => meter.distance > 0)
      .sort((a, b) => b.distance - a.distance)
      .slice(0, COUNT_LIST_LIMIT)
      .map(toEntry),
    harsher: entries
      .filter((meter) => meter.distance < 0)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, COUNT_LIST_LIMIT)
      .map(toEntry),
    mostContested: [...meters]
      .sort((a, b) => b.aggregate.variance - a.aggregate.variance)
      .filter((meter) => meter.aggregate.variance > 0)
      .slice(0, COUNT_LIST_LIMIT)
      .map((meter) => ({
        slug: meter.slug,
        name: meter.name,
        position: Math.round(meter.position),
        spread: Math.round(Math.sqrt(meter.aggregate.variance)),
        eligibleMembers: meter.aggregate.eligibleMembers,
      })),
    approvalRating: entries.length
      ? { percent: Math.round((inside / entries.length) * 100), inside, quorate: entries.length }
      : null,
    quorateVenues: meters.length,
  };
}
