import { and, eq, isNotNull, isNull, or, type SQL } from 'drizzle-orm';
import { venues } from '@/db/schema';
import { CLOSED_BUT_LISTED_TIER } from '@/lib/visibility';

/** The public visibility rule (src/lib/visibility.ts) as a query condition. */
export function publicVenueCondition(): SQL {
  return and(
    isNotNull(venues.tier),
    isNotNull(venues.latitude),
    isNotNull(venues.longitude),
    or(isNull(venues.closedAt), eq(venues.tier, CLOSED_BUT_LISTED_TIER))
  )!;
}
