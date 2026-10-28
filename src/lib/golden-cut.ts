import { asc, eq, inArray, sql } from 'drizzle-orm';
import { goldenCut, venues } from '@/db/schema';
import type { Database } from '@/lib/db-client';
import type { GoldenCutEntryInput } from '@/lib/golden-cut-schema';
import type { Actor } from '@/lib/venue-events';
import { isMappable, type VisibilityFields } from '@/lib/visibility';

/**
 * The Golden Cut in the Chairs' Area. Saving replaces the whole list in one
 * transaction, so the order the Chairs see is the order that is stored.
 * Only Approved venues can join. A venue that later leaves Approved, closes
 * or loses its location stays in the list but drops off the home page until
 * the Chairs remove it or it qualifies again.
 */

export interface GoldenCutAdminEntry {
  venueId: string;
  venueName: string;
  position: number;
  puffPiece: string | null;
  anchorDish: string | null;
  /** Why the home page is not showing it right now, or null when it is. */
  notShownReason: string | null;
}

/** Matches the home page rule: Approved and on the map (located and open). */
export function notShownReason(venue: VisibilityFields): string | null {
  if (venue.tier !== 'approved') return 'No longer Approved';
  if (venue.latitude === null || venue.longitude === null) return 'Needs a location';
  if (!isMappable(venue)) return 'Permanently closed';
  return null;
}

export async function listGoldenCut(db: Database): Promise<GoldenCutAdminEntry[]> {
  const rows = await db
    .select({ entry: goldenCut, venue: venues })
    .from(goldenCut)
    .innerJoin(venues, eq(goldenCut.venueId, venues.id))
    .orderBy(asc(goldenCut.position));
  return rows.map(({ entry, venue }) => ({
    venueId: entry.venueId,
    venueName: venue.name,
    position: entry.position,
    puffPiece: entry.puffPiece,
    anchorDish: entry.anchorDish,
    notShownReason: notShownReason(venue),
  }));
}

export type SaveGoldenCutResult = { ok: true } | { ok: false; error: string };

export async function saveGoldenCut(
  db: Database,
  entries: GoldenCutEntryInput[],
  actor: Actor
): Promise<SaveGoldenCutResult> {
  return db.transaction(async (tx) => {
    // One save at a time, so two Chairs saving together cannot interleave the delete and insert.
    await tx.execute(sql`lock table ${goldenCut} in share row exclusive mode`);

    const ids = entries.map((entry) => entry.venueId);
    const found = ids.length
      ? await tx
          .select({ id: venues.id, name: venues.name, tier: venues.tier })
          .from(venues)
          .where(inArray(venues.id, ids))
      : [];
    const byId = new Map(found.map((venue) => [venue.id, venue]));
    for (const id of ids) {
      const venue = byId.get(id);
      if (!venue)
        return {
          ok: false,
          error: 'One of those venues no longer exists. Reload the page and try again.',
        };
      if (venue.tier !== 'approved')
        return {
          ok: false,
          error: `${venue.name} is not Approved, so it cannot be in The Golden Cut.`,
        };
    }

    await tx.delete(goldenCut);
    if (entries.length) {
      const now = new Date();
      await tx.insert(goldenCut).values(
        entries.map((entry, index) => ({
          venueId: entry.venueId,
          position: index + 1,
          puffPiece: entry.puffPiece,
          anchorDish: entry.anchorDish,
          updatedAt: now,
          updatedBy: actor.id,
        }))
      );
    }
    return { ok: true };
  });
}
