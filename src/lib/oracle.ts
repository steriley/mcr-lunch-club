import type { CostTier, Venue } from '@/types';

/** Tiers the Executive Decision Oracle picks from. */
export const ORACLE_TIERS: readonly Venue['tier'][] = [
  'approved',
  'under_consideration',
  'to_be_assessed',
];

export type OracleBudget = 'any' | CostTier;

/**
 * The venues the Oracle may name: those in its tiers within the walking time and budget. When
 * nothing matches, it relaxes the budget first, then the walking time, so it always has an answer
 * unless no venue is in its tiers at all.
 */
export function oraclePool(
  venues: readonly Venue[],
  maxWalkMinutes: number,
  budget: OracleBudget
): Venue[] {
  const eligible = venues.filter((venue) => ORACLE_TIERS.includes(venue.tier));
  const withinWalk = eligible.filter(
    (venue) => venue.walkingTimeMin !== null && venue.walkingTimeMin <= maxWalkMinutes
  );
  const affordable =
    budget === 'any' ? withinWalk : withinWalk.filter((venue) => venue.cost === budget);
  if (affordable.length > 0) return affordable;
  if (withinWalk.length > 0) return withinWalk;
  return eligible;
}
