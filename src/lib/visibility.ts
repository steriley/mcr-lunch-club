import { and, isNotNull, type SQL } from 'drizzle-orm';
import { venues } from '@/db/schema';

/**
 * The single rule for whether a venue appears on the public site. Every
 * public query must filter with `publicVenueCondition()`, and code holding a
 * row already must use `isPubliclyVisible()`, so the two can never disagree.
 *
 *   public = has an approved tier AND has coordinates
 *
 * Phase 4 (closed flag) extends this to
 *   ... AND (not closed OR tier = 'gone_but_not_forgotten').
 */

export interface VisibilityFields {
  tier: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
}

export function isPubliclyVisible(venue: VisibilityFields): boolean {
  return venue.tier !== null && venue.latitude !== null && venue.longitude !== null;
}

export function publicVenueCondition(): SQL {
  return and(isNotNull(venues.tier), isNotNull(venues.latitude), isNotNull(venues.longitude))!;
}

/** Why a venue is hidden, for the admin list; null when it is public. */
export function hiddenReason(venue: VisibilityFields): 'no_tier' | 'needs_location' | null {
  if (venue.tier === null) return 'no_tier';
  if (venue.latitude === null || venue.longitude === null) return 'needs_location';
  return null;
}
