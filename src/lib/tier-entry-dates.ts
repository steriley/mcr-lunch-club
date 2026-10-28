import { and, eq, isNotNull } from 'drizzle-orm';
import { tierProposals, venues } from '@/db/schema';
import { db } from '@/lib/db';
import { isPubliclyVisible } from '@/lib/visibility';
import { publicVenueCondition } from '@/lib/visibility-sql';
import type { TierEntry } from '@/lib/weekly-summons';

/**
 * When public venues entered To Be Assessed, for the homepage Weekly Summons:
 * the approved proposals into that tier, with only the venue slug and the date
 * the second Chair approved it. Like recent-tier-changes.ts, this is a public
 * read of the proposals table kept out of src/lib/public-data.ts (the
 * public-safety test keeps that file proposal-free). Pending and declined
 * proposals, reasons and admin identities never leave this function.
 * weekly-summons.ts keeps the latest entry per venue.
 */
export async function getToBeAssessedEntries(): Promise<TierEntry[]> {
  const rows = await db
    .select({ decidedAt: tierProposals.decidedAt, venue: venues })
    .from(tierProposals)
    .innerJoin(venues, eq(tierProposals.venueId, venues.id))
    .where(
      and(
        eq(tierProposals.status, 'approved'),
        eq(tierProposals.proposedTier, 'to_be_assessed'),
        isNotNull(tierProposals.decidedAt),
        publicVenueCondition()
      )
    );
  return rows.flatMap(({ decidedAt, venue }) =>
    decidedAt && isPubliclyVisible(venue)
      ? [{ slug: venue.slug, tier: 'to_be_assessed' as const, enteredAt: decidedAt }]
      : []
  );
}
