import { and, eq, inArray, sql } from 'drizzle-orm';
import { inspections, venues } from '@/db/schema';
import type { Database } from '@/lib/db-client';

/**
 * One-off import of the corrected last-inspection dates from the Chairs'
 * records (drizzle/data/legacy-inspections.json). They become confirmed
 * `legacy` inspections: they show as "last inspected" but never count as
 * dual-verified. Every venue's cached last_inspection_date is then rebuilt
 * from confirmed inspections, which clears the old (wrong) dates of venues
 * not on the list unless `keepUnlisted` is set.
 */

export interface LegacyEntry {
  venue: string;
  date: string | null;
}

/** Names that differ between the Chairs' list and the database: normalised list name -> normalised database name. */
const LEGACY_NAME_ALIASES: Record<string, string> = {
  wingstop: 'wing stop',
};

/** Trim, lower case, fold accents, straighten curly quotes, collapse spaces. */
export function normaliseVenueName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’‛′`]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export interface LegacyPlan {
  /** Venues that get a legacy inspection row. */
  matched: { venueId: string; venueName: string; date: string }[];
  /** Listed as never inspected. */
  never: { venueId: string; venueName: string }[];
  unmatched: string[];
}

export function planLegacyImport(
  entries: LegacyEntry[],
  dbVenues: { id: string; name: string }[]
): LegacyPlan {
  const byName = new Map<string, { id: string; name: string }[]>();
  for (const venue of dbVenues) {
    const key = normaliseVenueName(venue.name);
    byName.set(key, [...(byName.get(key) ?? []), venue]);
  }

  const plan: LegacyPlan = { matched: [], never: [], unmatched: [] };
  for (const entry of entries) {
    const key = normaliseVenueName(entry.venue);
    const candidates = byName.get(key) ?? byName.get(LEGACY_NAME_ALIASES[key] ?? '') ?? [];
    if (candidates.length !== 1) {
      plan.unmatched.push(
        candidates.length > 1 ? `${entry.venue} (matches ${candidates.length} venues)` : entry.venue
      );
      continue;
    }
    const [venue] = candidates;
    if (entry.date === null) plan.never.push({ venueId: venue.id, venueName: venue.name });
    else plan.matched.push({ venueId: venue.id, venueName: venue.name, date: entry.date });
  }
  return plan;
}

export interface LegacyImportResult {
  plan: LegacyPlan;
  inserted: number;
  /** Venues whose last inspection date was cleared or changed: name, before, after. */
  changedDates: { name: string; before: string | null; after: string | null }[];
}

export class UnmatchedVenuesError extends Error {
  constructor(readonly names: string[]) {
    super(
      `Could not match ${names.length} venue(s) from the legacy list: ${names.join(', ')}. Add an alias in LEGACY_NAME_ALIASES and rerun.`
    );
  }
}

export async function importLegacyInspections(
  db: Database,
  entries: LegacyEntry[],
  options: { dryRun?: boolean; keepUnlisted?: boolean } = {}
): Promise<LegacyImportResult> {
  for (const entry of entries) {
    if (entry.date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(entry.date))
      throw new Error(`Bad date for ${entry.venue}: ${entry.date}`);
  }

  return db
    .transaction(async (tx) => {
      const dbVenues = await tx
        .select({ id: venues.id, name: venues.name, lastInspectionDate: venues.lastInspectionDate })
        .from(venues);
      const plan = planLegacyImport(entries, dbVenues);
      if (plan.unmatched.length) throw new UnmatchedVenuesError(plan.unmatched);

      let inserted = 0;
      if (plan.matched.length) {
        const rows = await tx
          .insert(inspections)
          .values(
            plan.matched.map((entry) => ({
              venueId: entry.venueId,
              inspectionDate: entry.date,
              status: 'confirmed' as const,
              kind: 'legacy' as const,
            }))
          )
          // Idempotent: the partial unique index on (venue, date) for legacy rows.
          .onConflictDoNothing({
            target: [inspections.venueId, inspections.inspectionDate],
            where: sql`${inspections.kind} = 'legacy'`,
          })
          .returning({ id: inspections.id });
        inserted = rows.length;
      }

      const listedIds = new Set([...plan.matched, ...plan.never].map((entry) => entry.venueId));
      const targets = options.keepUnlisted
        ? dbVenues.filter((venue) => listedIds.has(venue.id))
        : dbVenues;

      const changedDates: LegacyImportResult['changedDates'] = [];
      if (targets.length) {
        // Latest confirmed inspection per venue, now including the legacy rows.
        const latest = await tx
          .select({
            venueId: inspections.venueId,
            date: sql<string>`max(${inspections.inspectionDate})`,
          })
          .from(inspections)
          .where(
            and(
              eq(inspections.status, 'confirmed'),
              inArray(
                inspections.venueId,
                targets.map((venue) => venue.id)
              )
            )
          )
          .groupBy(inspections.venueId);
        const latestByVenue = new Map(latest.map((row) => [row.venueId, row.date]));

        for (const venue of targets) {
          const after = latestByVenue.get(venue.id) ?? null;
          if (after === venue.lastInspectionDate) continue;
          changedDates.push({ name: venue.name, before: venue.lastInspectionDate, after });
          await tx.update(venues).set({ lastInspectionDate: after }).where(eq(venues.id, venue.id));
        }
      }

      const result = {
        plan,
        inserted,
        changedDates: changedDates.sort((a, b) => a.name.localeCompare(b.name, 'en-GB')),
      };
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
  constructor(readonly result: LegacyImportResult) {
    super('Dry run');
  }
}
