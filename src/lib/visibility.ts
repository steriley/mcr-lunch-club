import { and, eq, isNotNull, isNull, or, type SQL } from 'drizzle-orm';
import { venues } from '@/db/schema';

/**
 * The single rule for whether a venue appears on the public site. Every
 * public query must filter with `publicVenueCondition()`, and code holding a
 * row already must use `isPubliclyVisible()`, so the two can never disagree.
 *
 *   public = has an approved tier
 *            AND has coordinates
 *            AND (not permanently closed OR tier = 'gone_but_not_forgotten')
 *
 * A closed venue never goes on the map or in Near Me, even when it is public
 * on its Gone But Not Forgotten tier page: see `isMappable()`.
 */

export const CLOSED_BUT_LISTED_TIER = 'gone_but_not_forgotten';

export interface VisibilityFields {
  tier: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
  closedAt: Date | string | null;
}

export function isPubliclyVisible(venue: VisibilityFields): boolean {
  return (
    venue.tier !== null &&
    venue.latitude !== null &&
    venue.longitude !== null &&
    (venue.closedAt === null || venue.tier === CLOSED_BUT_LISTED_TIER)
  );
}

export function publicVenueCondition(): SQL {
  return and(
    isNotNull(venues.tier),
    isNotNull(venues.latitude),
    isNotNull(venues.longitude),
    or(isNull(venues.closedAt), eq(venues.tier, CLOSED_BUT_LISTED_TIER))
  )!;
}

/** Map and Near Me: public and still open. */
export function isMappable(venue: VisibilityFields): boolean {
  return isPubliclyVisible(venue) && venue.closedAt === null;
}

/** Why a venue is hidden, for the admin list; null when it is public. */
export function hiddenReason(venue: VisibilityFields): 'no_tier' | 'needs_location' | 'closed' | null {
  if (venue.tier === null) return 'no_tier';
  if (venue.latitude === null || venue.longitude === null) return 'needs_location';
  if (!isPubliclyVisible(venue)) return 'closed';
  return null;
}
