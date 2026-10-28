import { TIERS, type TierValue } from '@/lib/tiers';

/**
 * Ordering for public tier lists. Most tiers list the nearest venues first
 * (walking time ascending, unknown times last, then name). Rejected and
 * Gone But Not Forgotten are a roll of names, so they are alphabetical.
 */

export const ALPHABETICAL_TIERS: readonly TierValue[] = ['rejected', 'gone_but_not_forgotten'];

export interface OrderableVenue {
  name: string;
  walkingTimeMin: number | null;
}

export function compareNames(a: OrderableVenue, b: OrderableVenue): number {
  return a.name.localeCompare(b.name, 'en-GB', { sensitivity: 'base' });
}

export function compareByWalkingTime(a: OrderableVenue, b: OrderableVenue): number {
  const walkA = a.walkingTimeMin ?? Number.POSITIVE_INFINITY;
  const walkB = b.walkingTimeMin ?? Number.POSITIVE_INFINITY;
  if (walkA !== walkB) return walkA < walkB ? -1 : 1;
  return compareNames(a, b);
}

/** Comparator for venues within one tier. */
export function tierComparator(tier: TierValue): (a: OrderableVenue, b: OrderableVenue) => number {
  return ALPHABETICAL_TIERS.includes(tier) ? compareNames : compareByWalkingTime;
}

/** Sorts venues of mixed tiers: by tier (in `TIERS` display order), then each tier's own order. */
export function sortForPublic<T extends OrderableVenue>(
  venues: readonly T[],
  tierOf: (venue: T) => TierValue
): T[] {
  const tierIndex = new Map(TIERS.map((tier, index) => [tier.value, index]));
  return [...venues].sort((a, b) => {
    const tierA = tierOf(a);
    const tierB = tierOf(b);
    if (tierA !== tierB) return tierIndex.get(tierA)! - tierIndex.get(tierB)!;
    return tierComparator(tierA)(a, b);
  });
}

/**
 * The order on a verdict page: the most recently inspected venue first, then by name. Venues with
 * no inspection on record come after every inspected one, also by name. `inspections` are the
 * public ones (YYYY-MM-DD dates sort as text, so their order does not matter).
 */
export function sortByRecentInspection<T extends OrderableVenue & { slug: string }>(
  venues: readonly T[],
  inspections: readonly { venueSlug: string; date: string }[]
): T[] {
  const latest = new Map<string, string>();
  for (const { venueSlug, date } of inspections) {
    if (date > (latest.get(venueSlug) ?? '')) latest.set(venueSlug, date);
  }
  return [...venues].sort((a, b) => {
    const dateA = latest.get(a.slug) ?? '';
    const dateB = latest.get(b.slug) ?? '';
    if (dateA !== dateB) return dateA < dateB ? 1 : -1;
    return compareNames(a, b);
  });
}
