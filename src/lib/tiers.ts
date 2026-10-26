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
  /** URL segment used by the public `/verdicts/[tier]` pages, e.g. `under-consideration`. */
  slug: string;
  /**
   * Accent colour: chips, map pins and banners. Tier colours are theme tokens
   * (`--color-tier-<slug>` in src/styles/global.css), so these are `var()`
   * references: use them in styles, not in colour arithmetic.
   */
  color: string;
  /** Darker edge for map pins and Near Me chips (`--color-tier-<slug>-edge`). */
  border: string;
  /** Pale fill for admin tier badges (`--color-tier-<slug>-tint`). */
  tint: string;
  /** Banner background as a literal Tailwind class (`bg-tier-<slug>`), so Tailwind sees it. */
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
    color: 'var(--color-tier-approved)',
    border: 'var(--color-tier-approved-edge)',
    tint: 'var(--color-tier-approved-tint)',
    bannerClass: 'bg-tier-approved',
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
    color: 'var(--color-tier-under-consideration)',
    border: 'var(--color-tier-under-consideration-edge)',
    tint: 'var(--color-tier-under-consideration-tint)',
    bannerClass: 'bg-tier-under-consideration',
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
    color: 'var(--color-tier-to-be-assessed)',
    border: 'var(--color-tier-to-be-assessed-edge)',
    tint: 'var(--color-tier-to-be-assessed-tint)',
    bannerClass: 'bg-tier-to-be-assessed',
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
    color: 'var(--color-tier-if-we-must)',
    border: 'var(--color-tier-if-we-must-edge)',
    tint: 'var(--color-tier-if-we-must-tint)',
    bannerClass: 'bg-tier-if-we-must',
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
    color: 'var(--color-tier-rejected)',
    border: 'var(--color-tier-rejected-edge)',
    tint: 'var(--color-tier-rejected-tint)',
    bannerClass: 'bg-tier-rejected',
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
    color: 'var(--color-tier-gone-but-not-forgotten)',
    border: 'var(--color-tier-gone-but-not-forgotten-edge)',
    tint: 'var(--color-tier-gone-but-not-forgotten-tint)',
    bannerClass: 'bg-tier-gone-but-not-forgotten',
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
