import { and, eq, gt, lte } from 'drizzle-orm';
import { tierProposals, venues } from '@/db/schema';
import { db } from '@/lib/db';
import { isPubliclyVisible } from '@/lib/visibility';
import { publicVenueCondition } from '@/lib/visibility-sql';
import type { BulletinIssue, TierChange } from '@/lib/weekly-bulletin';

/**
 * Approved tier changes on public venues that a bulletin issue covers, for
 * the homepage bulletin. This is the one public read of the proposals table,
 * so it lives outside src/lib/public-data.ts (the public-safety test keeps
 * that file proposal-free) and returns only what venues.tier already shows:
 * the venue's name and slug, and the tiers it moved between. Pending and
 * declined proposals, reasons and admin identities never leave this function.
 *
 * changesInIssue() in src/lib/weekly-bulletin.ts nets the moves per venue.
 */
export async function getRecentTierChanges(
  issue: Pick<BulletinIssue, 'coversFrom' | 'publishedAt'>
): Promise<TierChange[]> {
  const rows = await db
    .select({
      fromTier: tierProposals.fromTier,
      toTier: tierProposals.proposedTier,
      decidedAt: tierProposals.decidedAt,
      venue: venues,
    })
    .from(tierProposals)
    .innerJoin(venues, eq(tierProposals.venueId, venues.id))
    .where(
      and(
        eq(tierProposals.status, 'approved'),
        gt(tierProposals.decidedAt, issue.coversFrom),
        lte(tierProposals.decidedAt, issue.publishedAt),
        publicVenueCondition()
      )
    );
  return rows.flatMap(({ fromTier, toTier, decidedAt, venue }) =>
    decidedAt && isPubliclyVisible(venue)
      ? [{ slug: venue.slug, name: venue.name, fromTier, toTier, decidedAt }]
      : []
  );
}
