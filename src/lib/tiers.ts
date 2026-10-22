/**
 * The single source of truth for venue tiers: stored values (database, API),
 * display labels, URL slugs, colours, banners and the club's mottos. Labels
 * and mottos match the club's document. Safe to import from the browser.
 */

/**
 * Stored values, in the order of the Postgres `tier` enum. Do not reorder:
 * the enum is built from this list. Display order is `TIERS`.
 */
export const TIER_VALUES = [
  'approved',
  'under_consideration',
  'to_be_assessed',
  'rejected',
  'if_we_must',
  'gone_but_not_forgotten',
] as const;

export type TierValue = (typeof TIER_VALUES)[number];

export interface Tier {
  value: TierValue;
  label: string;
  /** URL segment used by the public `/tiers/[tier]` pages, e.g. `under-consideration`. */
  slug: string;
  /** Accent colour: chips, map pins and banners. */
  color: string;
  /** Darker edge for map pins and Near Me chips. */
  border: string;
  /** Pale fill for admin tier badges. */
  tint: string;
  /** Banner background as a literal Tailwind class, so Tailwind sees it. */
  bannerClass: string;
  icon: string;
  /** Long motto on the venue sheet and venue page banners. */
  quote: string;
  /** Short motto on the tier page banner. */
  motto: string;
  /** Tier page: what the tier means. */
  description: string;
  /** Tier page: the rule a venue in this tier is held to. */
  rule: string;
}

/** Every tier, in display order: chips, tabs, dropdowns and grouped lists. */
export const TIERS: readonly Tier[] = [
  {
    value: 'approved',
    label: 'Approved',
    slug: 'approved',
    color: '#1E7A4E',
    border: '#155b39',
    tint: '#E8F5EE',
    bannerClass: 'bg-[#1E7A4E]',
    icon: '🏆',
    quote: 'The Highest Honour in Manchester Lunching: The Right to be Returned To',
    motto: 'The Highest Honour in Manchester Lunching: The Right to be Returned To',
    description:
      'Venue has survived the Chairs’ scrutiny by delivering consistent, good-value, characterful lunches across multiple visits. It has earned the highest honour in Manchester lunching: the right to be returned to.',
    rule: 'Each must be visited on at least two separate occasions and deliver satisfactory outcomes on both. Consistency is king.',
  },
  {
    value: 'under_consideration',
    label: 'Under Consideration',
    slug: 'under-consideration',
    color: '#C27803',
    border: '#8a5100',
    tint: '#FEF5E7',
    bannerClass: 'bg-[#C27803]',
    icon: '⏳',
    quote: 'The Waiting Chamber of Judgement — Pending further evidence and appetite',
    motto: 'The Waiting Chamber of Judgement',
    description:
      'Venue has shown enough promise to warrant serious attention, but has not yet earned a final verdict from the Chairs. It sits in the waiting chamber of judgement, pending further evidence, appetite, and official lunching scrutiny.',
    rule: 'Pending further evidence, appetite, and official lunching scrutiny.',
  },
  {
    value: 'to_be_assessed',
    label: 'To Be Assessed',
    slug: 'to-be-assessed',
    color: '#5A6474',
    border: '#454e5c',
    tint: '#F0F2F5',
    bannerClass: 'bg-[#5A6474]',
    icon: '📜',
    quote: 'Entered the Field of Vision — Fate remains undecided pending inspection',
    motto: 'Entered the Lunch Club’s Field of Vision',
    description:
      'Venue has entered the Lunch Club’s field of vision, but has not yet faced the full judgement of the Chairs. Its fate remains undecided until proper inspection confirms whether it is worthy of approval, rejection, or reluctant tolerance.',
    rule: 'Fate remains undecided until proper inspection confirms whether it is worthy of approval, rejection, or reluctant tolerance.',
  },
  {
    value: 'if_we_must',
    label: 'If We Must',
    slug: 'if-we-must',
    color: '#7C3A82',
    border: '#602d64',
    tint: '#F7EEF8',
    bannerClass: 'bg-[#7C3A82]',
    icon: '🌧',
    quote: 'Not Celebrated, But Tolerated — Acceptable only when circumstance forces our hand',
    motto: 'Not Celebrated, But Tolerated',
    description:
      'Venue is not celebrated, but tolerated: acceptable only when circumstance, convenience, or lack of better options forces the Club’s hand. It remains outside true approval, granted not honour, but reluctant permission.',
    rule: 'Acceptable only when circumstance, convenience, or lack of better options forces the Club’s hand.',
  },
  {
    value: 'rejected',
    label: 'Rejected',
    slug: 'rejected',
    color: '#B92B27',
    border: '#8f201d',
    tint: '#FDF0F0',
    bannerClass: 'bg-[#B92B27]',
    icon: '⛔',
    quote: 'Removed from the Sacred Lunch Rotation — Returnable only through exceptional redemption',
    motto: 'Removed from the Sacred Lunch Rotation',
    description:
      'Venue has failed to meet the standards of the Chairs, whether through poor value, weak quality, lack of character, or the unforgivable sin of inconsistency. It is removed from the sacred lunch rotation and may only return through exceptional redemption.',
    rule: 'Removed from the sacred lunch rotation and may only return through exceptional redemption.',
  },
  {
    value: 'gone_but_not_forgotten',
    label: 'Gone But Not Forgotten',
    slug: 'gone-but-not-forgotten',
    color: '#71717A',
    border: '#52525b',
    tint: '#F4F4F5',
    bannerClass: 'bg-[#71717A]',
    icon: '🕊',
    quote: 'Doors Closed, But Legend Remains in the Lunching Annals',
    motto: 'Legend Remains in the Lunching Annals',
    description:
      'Venue once held a place in the Club’s affections, but is no longer available to be judged, revisited, or relied upon. Its doors may be closed, but its legend remains in the lunching annals.',
    rule: 'Preserved in the lunching annals in perpetuity.',
  },
];

/** Tiers selected on the homepage by default (and after Reset Filters) for the widest view of lunching options. */
export const DEFAULT_HOME_TIERS: readonly TierValue[] = ['approved', 'under_consideration', 'to_be_assessed'];

/** Tiers Near Me can show; Rejected and Gone But Not Forgotten never appear there. */
export const NEAR_ME_TIERS: readonly TierValue[] = ['approved', 'under_consideration', 'to_be_assessed', 'if_we_must'];

/** Tiers selected when Near Me opens. */
export const NEAR_ME_DEFAULT_TIERS: readonly TierValue[] = ['approved'];

const BY_VALUE = new Map(TIERS.map((tier) => [tier.value, tier]));

export function isTierValue(value: unknown): value is TierValue {
  return BY_VALUE.has(value as TierValue);
}

export function tierInfo(value: TierValue): Tier {
  return BY_VALUE.get(value)!;
}

export function tierLabel(value: TierValue): string {
  return tierInfo(value).label;
}

/** Accepts a stored value or a display label; returns null when unrecognised. */
export function parseTier(input: string | null | undefined): TierValue | null {
  const trimmed = String(input ?? '').trim();
  const match = TIERS.find((tier) => tier.value === trimmed || tier.label === trimmed);
  return match?.value ?? null;
}

/** The tier whose URL slug this is, or null. */
export function tierFromSlug(slug: string | undefined): Tier | null {
  return TIERS.find((tier) => tier.slug === slug) ?? null;
}

/** Number of venues in each tier, including tiers with none. */
export function countVenuesByTier(venues: readonly { tier: TierValue }[]): Record<TierValue, number> {
  const counts = Object.fromEntries(TIER_VALUES.map((value) => [value, 0])) as Record<TierValue, number>;
  for (const venue of venues) counts[venue.tier] += 1;
  return counts;
}
