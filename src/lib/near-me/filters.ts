import type { CostTier, Venue } from '@/types';

/** The price bands Near Me filters by, cheapest first. */
export const COST_BANDS: readonly CostTier[] = ['£', '££', '£££'];

/** An empty selection means any price. */
export function matchesCost(venue: Pick<Venue, 'cost'>, selected: readonly CostTier[]): boolean {
  return selected.length === 0 || selected.includes(venue.cost);
}

export function toggleCost(selected: readonly CostTier[], cost: CostTier): CostTier[] {
  return selected.includes(cost) ? selected.filter((c) => c !== cost) : [...selected, cost];
}
