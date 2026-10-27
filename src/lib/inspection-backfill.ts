import { and, eq, inArray } from 'drizzle-orm';
import { user } from '@/db/auth-schema';
import { inspections, venues } from '@/db/schema';
import type { Database } from '@/lib/db-client';
import { refreshLastInspectionDate } from '@/lib/inspections';
import { normaliseVenueName } from '@/lib/legacy-inspections';
import type { InspectionOutcome } from '@/types';

/**
 * One-off backfill of dual-verified inspections from the Chairs' audit trail
 * (drizzle/data/verified-inspections-backfill.json), for venues that have no
 * inspection date. Unlike the legacy import these are `verified` rows with an
 * outcome and both Chairs named, as if they had pressed "Visited today" on
 * that date. A venue that already has any confirmed inspection is skipped,
 * which also makes a rerun a no-op. All or nothing: an unknown venue or Chair
 * aborts without writing.
 */

export interface BackfillEntry {
  venue: string;
  date: string;
  outcome: InspectionOutcome;
  /** The tier move the date comes from; for the record only. */
  move?: string;
}

export interface BackfillChairs {
  first: string;
  second: string;
}

export interface BackfillResult {
  /** Inspections written (or, on a dry run, that would be). */
  inserted: { name: string; date: string; outcome: InspectionOutcome }[];
  /** Venues left alone because they already have a confirmed inspection. */
  skipped: { name: string; lastInspectionDate: string | null }[];
  /** Venues whose last inspection date changed. */
  changedDates: { name: string; before: string | null; after: string | null }[];
}

export class BackfillError extends Error {}

const OUTCOMES: readonly InspectionOutcome[] = ['satisfactory', 'below_par'];

export async function backfillVerifiedInspections(
  db: Database,
  entries: BackfillEntry[],
  chairs: BackfillChairs,
  options: { dryRun?: boolean } = {}
): Promise<BackfillResult> {
  for (const entry of entries) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) throw new BackfillError(`Bad date for ${entry.venue}: ${entry.date}`);
    if (!OUTCOMES.includes(entry.outcome)) throw new BackfillError(`Bad outcome for ${entry.venue}: ${entry.outcome}`);
  }

  return db
    .transaction(async (tx) => {
      const chairRows = await tx.select({ id: user.id, name: user.name }).from(user).where(inArray(user.name, [chairs.first, chairs.second]));
      const chair = (name: string) => {
        const found = chairRows.filter((row) => row.name === name);
        if (found.length !== 1) throw new BackfillError(`Expected one admin named ${name}, found ${found.length}.`);
        return found[0];
      };
      const first = chair(chairs.first);
      const second = chair(chairs.second);
      if (first.id === second.id) throw new BackfillError('The two Chairs must be different people.');

      const dbVenues = await tx.select({ id: venues.id, name: venues.name, lastInspectionDate: venues.lastInspectionDate }).from(venues);
      const byName = new Map<string, (typeof dbVenues)[number][]>();
      for (const venue of dbVenues) {
        const key = normaliseVenueName(venue.name);
        byName.set(key, [...(byName.get(key) ?? []), venue]);
      }
      const unmatched: string[] = [];
      const planned = new Map<string, { venue: (typeof dbVenues)[number]; entries: BackfillEntry[] }>();
      for (const entry of entries) {
        const candidates = byName.get(normaliseVenueName(entry.venue)) ?? [];
        if (candidates.length !== 1) {
          unmatched.push(candidates.length > 1 ? `${entry.venue} (matches ${candidates.length} venues)` : entry.venue);
          continue;
        }
        const [venue] = candidates;
        planned.set(venue.id, { venue, entries: [...(planned.get(venue.id)?.entries ?? []), entry] });
      }
      if (unmatched.length) throw new BackfillError(`Could not match ${unmatched.length} venue(s): ${unmatched.join(', ')}.`);

      const alreadyInspected = new Set(
        (
          await tx
            .selectDistinct({ venueId: inspections.venueId })
            .from(inspections)
            .where(and(eq(inspections.status, 'confirmed'), inArray(inspections.venueId, [...planned.keys()])))
        ).map((row) => row.venueId)
      );

      const result: BackfillResult = { inserted: [], skipped: [], changedDates: [] };
      for (const { venue, entries: venueEntries } of planned.values()) {
        if (alreadyInspected.has(venue.id)) {
          result.skipped.push({ name: venue.name, lastInspectionDate: venue.lastInspectionDate });
          continue;
        }
        await tx.insert(inspections).values(
          venueEntries.map((entry) => ({
            venueId: venue.id,
            inspectionDate: entry.date,
            status: 'confirmed' as const,
            kind: 'verified' as const,
            outcome: entry.outcome,
            firstAdminId: first.id,
            firstAdminName: first.name,
            secondAdminId: second.id,
            secondAdminName: second.name,
            // The time of each press was not recorded: midday on the date, and no confirmation time,
            // so history shows the date alone.
            createdAt: new Date(`${entry.date}T12:00:00Z`),
          }))
        );
        result.inserted.push(...venueEntries.map((entry) => ({ name: venue.name, date: entry.date, outcome: entry.outcome })));
        const after = await refreshLastInspectionDate(tx, venue.id);
        if (after !== venue.lastInspectionDate) result.changedDates.push({ name: venue.name, before: venue.lastInspectionDate, after });
      }

      const byVenueName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'en-GB');
      result.inserted.sort((a, b) => byVenueName(a, b) || a.date.localeCompare(b.date));
      result.skipped.sort(byVenueName);
      result.changedDates.sort(byVenueName);
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
