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
export function sortForPublic<T extends OrderableVenue>(venues: readonly T[], tierOf: (venue: T) => TierValue): T[] {
  const tierIndex = new Map(TIERS.map((tier, index) => [tier.value, index]));
  return [...venues].sort((a, b) => {
    const tierA = tierOf(a);
    const tierB = tierOf(b);
    if (tierA !== tierB) return tierIndex.get(tierA)! - tierIndex.get(tierB)!;
    return tierComparator(tierA)(a, b);
  });
}
