import { and, eq, gte } from 'drizzle-orm';
import { tierProposals, venues } from '@/db/schema';
import { db } from '@/lib/db';
import { isPubliclyVisible, publicVenueCondition } from '@/lib/visibility';
import type { TierChange } from '@/lib/weekly-bulletin';

/**
 * Approved tier changes on public venues from the last nine days, for the
 * homepage bulletin. This is the one public read of the proposals table, so
 * it lives outside src/lib/public-data.ts (the public-safety test keeps that
 * file proposal-free) and returns only what venues.tier already shows: the
 * venue's name and slug, and the tiers it moved between. Pending and declined
 * proposals, reasons and admin identities never leave this function.
 *
 * Nine days covers any London calendar week; changesInWeek() in
 * src/lib/weekly-bulletin.ts does the exact week filtering.
 */
export async function getRecentTierChanges(now: Date = new Date()): Promise<TierChange[]> {
  const since = new Date(now.getTime() - 9 * 86_400_000);
  const rows = await db
    .select({ fromTier: tierProposals.fromTier, toTier: tierProposals.proposedTier, decidedAt: tierProposals.decidedAt, venue: venues })
    .from(tierProposals)
    .innerJoin(venues, eq(tierProposals.venueId, venues.id))
    .where(and(eq(tierProposals.status, 'approved'), gte(tierProposals.decidedAt, since), publicVenueCondition()));
  return rows.flatMap(({ fromTier, toTier, decidedAt, venue }) =>
    decidedAt && isPubliclyVisible(venue) ? [{ slug: venue.slug, name: venue.name, fromTier, toTier, decidedAt }] : []
  );
}
