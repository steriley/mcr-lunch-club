import { and, eq, inArray } from 'drizzle-orm';
import { user } from '@/db/auth-schema';
import { inspections, tierProposals, venueEvents, venues } from '@/db/schema';
import type { Database } from '@/lib/db-client';
import { refreshLastInspectionDate } from '@/lib/inspections';
import { normaliseVenueName } from '@/lib/legacy-inspections';
import { TIER_VALUES, type TierValue } from '@/lib/tiers';
import type { InspectionOutcome } from '@/types';

/**
 * One-off backfill from the Chairs' audit trail (drizzle/data/audit-trail-backfill.json):
 *
 * - inspections: dual-verified visits by both Chairs, with an outcome, as if
 *   they had pressed "Visited today" on that date. Only for venues with no
 *   confirmed inspection yet.
 * - addedDates: the date a venue joined the list (venues.created_at); no inspection.
 * - closures: the venue closed and moved tier on that date, with no outcome:
 *   marked closed, the "closed" event logged, and the move recorded as an
 *   approved tier proposal (first Chair proposed, second approved). Only for
 *   venues not already closed, and the venue must already be in the new tier.
 *
 * Each part skips what is already there, so a rerun changes nothing. All or
 * nothing: an unknown venue or Chair aborts without writing.
 */

interface BackfillInspection {
  venue: string;
  date: string;
  outcome: InspectionOutcome;
  /** The tier move the date comes from; for the record only. */
  move?: string;
}

interface BackfillAddedDate {
  venue: string;
  date: string;
}

interface BackfillClosure {
  venue: string;
  date: string;
  fromTier: TierValue;
  toTier: TierValue;
}

export interface BackfillData {
  chairs: { first: string; second: string };
  inspections: BackfillInspection[];
  addedDates: BackfillAddedDate[];
  closures: BackfillClosure[];
}

export interface BackfillResult {
  /** Inspections written (or, on a dry run, that would be). */
  inserted: { name: string; date: string; outcome: InspectionOutcome }[];
  /** Venues whose inspections were left alone because they already have a confirmed one. */
  skipped: { name: string; lastInspectionDate: string | null }[];
  /** Venues whose last inspection date changed. */
  changedDates: { name: string; before: string | null; after: string | null }[];
  /** Venues whose added date changed. */
  addedDates: { name: string; before: string; after: string }[];
  /** Venues marked closed, with their recorded tier move. */
  closed: { name: string; date: string; fromTier: TierValue; toTier: TierValue }[];
  /** Venues in `closures` left alone because they are already closed. */
  alreadyClosed: string[];
}

export class BackfillError extends Error {}

const OUTCOMES: readonly InspectionOutcome[] = ['satisfactory', 'below_par'];

/** The time of day was not recorded: midday UTC keeps the date in Europe/London. */
const midday = (date: string) => new Date(`${date}T12:00:00Z`);

function validate(data: BackfillData): void {
  const dated = [...data.inspections, ...data.addedDates, ...data.closures];
  for (const entry of dated) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date))
      throw new BackfillError(`Bad date for ${entry.venue}: ${entry.date}`);
  }
  for (const entry of data.inspections) {
    if (!OUTCOMES.includes(entry.outcome))
      throw new BackfillError(`Bad outcome for ${entry.venue}: ${entry.outcome}`);
  }
  for (const entry of data.closures) {
    for (const tier of [entry.fromTier, entry.toTier]) {
      if (!TIER_VALUES.includes(tier))
        throw new BackfillError(`Bad tier for ${entry.venue}: ${tier}`);
    }
  }
}

export async function backfillAuditTrail(
  db: Database,
  data: BackfillData,
  options: { dryRun?: boolean } = {}
): Promise<BackfillResult> {
  validate(data);

  return db
    .transaction(async (tx) => {
      const chairRows = await tx
        .select({ id: user.id, name: user.name })
        .from(user)
        .where(inArray(user.name, [data.chairs.first, data.chairs.second]));
      const chair = (name: string) => {
        const found = chairRows.filter((row) => row.name === name);
        if (found.length !== 1)
          throw new BackfillError(`Expected one admin named ${name}, found ${found.length}.`);
        return found[0];
      };
      const first = chair(data.chairs.first);
      const second = chair(data.chairs.second);
      if (first.id === second.id)
        throw new BackfillError('The two Chairs must be different people.');

      const dbVenues = await tx
        .select({
          id: venues.id,
          name: venues.name,
          tier: venues.tier,
          lastInspectionDate: venues.lastInspectionDate,
          createdAt: venues.createdAt,
          closedAt: venues.closedAt,
        })
        .from(venues);
      type Venue = (typeof dbVenues)[number];
      const byName = new Map<string, Venue[]>();
      for (const venue of dbVenues) {
        const key = normaliseVenueName(venue.name);
        byName.set(key, [...(byName.get(key) ?? []), venue]);
      }
      const unmatched: string[] = [];
      const match = (name: string): Venue | null => {
        const candidates = byName.get(normaliseVenueName(name)) ?? [];
        if (candidates.length === 1) return candidates[0];
        unmatched.push(
          candidates.length > 1 ? `${name} (matches ${candidates.length} venues)` : name
        );
        return null;
      };
      const inspectionPlan = new Map<string, { venue: Venue; entries: BackfillInspection[] }>();
      for (const entry of data.inspections) {
        const venue = match(entry.venue);
        if (venue)
          inspectionPlan.set(venue.id, {
            venue,
            entries: [...(inspectionPlan.get(venue.id)?.entries ?? []), entry],
          });
      }
      const addedPlan = data.addedDates.map((entry) => ({ entry, venue: match(entry.venue) }));
      const closurePlan = data.closures.map((entry) => ({ entry, venue: match(entry.venue) }));
      if (unmatched.length)
        throw new BackfillError(
          `Could not match ${unmatched.length} venue(s): ${unmatched.join(', ')}.`
        );

      const result: BackfillResult = {
        inserted: [],
        skipped: [],
        changedDates: [],
        addedDates: [],
        closed: [],
        alreadyClosed: [],
      };

      const alreadyInspected = new Set(
        inspectionPlan.size
          ? (
              await tx
                .selectDistinct({ venueId: inspections.venueId })
                .from(inspections)
                .where(
                  and(
                    eq(inspections.status, 'confirmed'),
                    inArray(inspections.venueId, [...inspectionPlan.keys()])
                  )
                )
            ).map((row) => row.venueId)
          : []
      );
      for (const { venue, entries } of inspectionPlan.values()) {
        if (alreadyInspected.has(venue.id)) {
          result.skipped.push({ name: venue.name, lastInspectionDate: venue.lastInspectionDate });
          continue;
        }
        await tx.insert(inspections).values(
          entries.map((entry) => ({
            venueId: venue.id,
            inspectionDate: entry.date,
            status: 'confirmed' as const,
            kind: 'verified' as const,
            outcome: entry.outcome,
            firstAdminId: first.id,
            firstAdminName: first.name,
            secondAdminId: second.id,
            secondAdminName: second.name,
            // No confirmation time was recorded, so history shows the date alone.
            createdAt: midday(entry.date),
          }))
        );
        result.inserted.push(
          ...entries.map((entry) => ({
            name: venue.name,
            date: entry.date,
            outcome: entry.outcome,
          }))
        );
        const after = await refreshLastInspectionDate(tx, venue.id);
        if (after !== venue.lastInspectionDate)
          result.changedDates.push({ name: venue.name, before: venue.lastInspectionDate, after });
      }

      for (const { entry, venue } of addedPlan) {
        const after = midday(entry.date);
        if (venue!.createdAt.getTime() === after.getTime()) continue;
        await tx.update(venues).set({ createdAt: after }).where(eq(venues.id, venue!.id));
        result.addedDates.push({
          name: venue!.name,
          before: venue!.createdAt.toISOString().slice(0, 10),
          after: entry.date,
        });
      }

      for (const { entry, venue } of closurePlan) {
        if (venue!.closedAt) {
          result.alreadyClosed.push(venue!.name);
          continue;
        }
        if (venue!.tier !== entry.toTier)
          throw new BackfillError(
            `${venue!.name} is in ${venue!.tier ?? 'no tier'}, not ${entry.toTier}.`
          );
        const at = midday(entry.date);
        await tx
          .update(venues)
          .set({ closedAt: at, closedBy: first.id })
          .where(eq(venues.id, venue!.id));
        await tx.insert(venueEvents).values({
          venueId: venue!.id,
          kind: 'closed',
          actorId: first.id,
          actorName: first.name,
          createdAt: at,
        });
        await tx.insert(tierProposals).values({
          venueId: venue!.id,
          fromTier: entry.fromTier,
          proposedTier: entry.toTier,
          proposedBy: first.id,
          proposedByName: first.name,
          proposedAt: at,
          status: 'approved',
          decidedBy: second.id,
          decidedByName: second.name,
          decidedAt: at,
        });
        result.closed.push({
          name: venue!.name,
          date: entry.date,
          fromTier: entry.fromTier,
          toTier: entry.toTier,
        });
      }

      const byVenueName = (a: { name: string }, b: { name: string }) =>
        a.name.localeCompare(b.name, 'en-GB');
      result.inserted.sort((a, b) => byVenueName(a, b) || a.date.localeCompare(b.date));
      result.skipped.sort(byVenueName);
      result.changedDates.sort(byVenueName);
      result.addedDates.sort(byVenueName);
      result.closed.sort(byVenueName);
      // A dry run does all the work, reports it, and rolls everything back.
      if (options.dryRun) throw new DryRunRollback(result);
      return result;
    })
    .catch((error) => {
      if (error instanceof DryRunRollback) return error.result;
      throw error;
    });
}

class DryRunRollback extends Error {
  constructor(readonly result: BackfillResult) {
    super('Dry run');
  }
}
