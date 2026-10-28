import { haversineMetres } from '@/lib/map/ranking';
import type { PublicVenue } from '@/lib/public-data';
import type { TierValue } from '@/lib/tiers';

/** Tiers worth suggesting as an alternative. */
export const NEARBY_TIERS: readonly TierValue[] = ['approved', 'under_consideration', 'to_be_assessed'];

export const NEARBY_LIMIT = 3;

/**
 * Up to `limit` other open venues in a suggestable tier, nearest first by
 * straight-line distance from `venue`. Empty when `venue` has no coordinates.
 */
export function nearbyAlternatives(venue: PublicVenue, venues: readonly PublicVenue[], limit = NEARBY_LIMIT): PublicVenue[] {
  if (venue.lat === null || venue.lng === null) return [];
  const origin = { lat: venue.lat, lng: venue.lng };
  return venues
    .filter((other) => other.slug !== venue.slug && !other.closed && other.lat !== null && other.lng !== null && NEARBY_TIERS.includes(other.tier))
    .map((other) => ({ other, metres: haversineMetres(origin, { lat: other.lat!, lng: other.lng! }) }))
    .sort((a, b) => a.metres - b.metres || a.other.name.localeCompare(b.other.name))
    .slice(0, limit)
    .map(({ other }) => other);
}
