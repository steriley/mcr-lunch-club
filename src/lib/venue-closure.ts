import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { venues, type VenueRow } from '@/db/schema';
import type { Database } from '@/lib/db-client';
import { recordVenueEvent, type Actor } from '@/lib/venue-events';

/**
 * "Permanently closed" is a fact about a venue, not a tier: closing never
 * changes the tier and needs no second admin. Any admin can close or reopen;
 * both are logged with who and when.
 */

export type ClosureResult =
  | { ok: true; venue: VenueRow }
  | { ok: false; reason: 'not_found' | 'already_closed' | 'not_closed' };

async function setClosed(
  db: Database,
  venueId: string,
  actor: Actor,
  close: boolean
): Promise<ClosureResult> {
  return db.transaction(async (tx) => {
    // Only flips the flag when it is not already in the target state, so a double click logs once.
    const [venue] = await tx
      .update(venues)
      .set(
        close ? { closedAt: new Date(), closedBy: actor.id } : { closedAt: null, closedBy: null }
      )
      .where(
        and(eq(venues.id, venueId), close ? isNull(venues.closedAt) : isNotNull(venues.closedAt))
      )
      .returning();

    if (!venue) {
      const [existing] = await tx
        .select({ id: venues.id })
        .from(venues)
        .where(eq(venues.id, venueId))
        .limit(1);
      return {
        ok: false,
        reason: existing ? (close ? 'already_closed' : 'not_closed') : 'not_found',
      };
    }

    await recordVenueEvent(tx, venueId, close ? 'closed' : 'reopened', actor);
    return { ok: true, venue };
  });
}

export function closeVenue(db: Database, venueId: string, actor: Actor): Promise<ClosureResult> {
  return setClosed(db, venueId, actor, true);
}

export function reopenVenue(db: Database, venueId: string, actor: Actor): Promise<ClosureResult> {
  return setClosed(db, venueId, actor, false);
}
