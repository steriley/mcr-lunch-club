/**
 * The single source of truth for venue tiers: stored values (database, API)
 * and display labels (admin UI, public site). Labels match the club's document.
 */
export const TIERS = [
  { value: 'approved', label: 'Approved' },
  { value: 'under_consideration', label: 'Under Consideration' },
  { value: 'to_be_assessed', label: 'To Be Assessed' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'if_we_must', label: 'If We Must' },
  { value: 'gone_but_not_forgotten', label: 'Gone But Not Forgotten' },
] as const;

export type TierValue = (typeof TIERS)[number]['value'];
export type TierLabel = (typeof TIERS)[number]['label'];

export const TIER_VALUES = TIERS.map((tier) => tier.value) as [TierValue, ...TierValue[]];

export function isTierValue(value: unknown): value is TierValue {
  return TIERS.some((tier) => tier.value === value);
}

export function tierLabel(value: TierValue): TierLabel {
  return TIERS.find((tier) => tier.value === value)!.label;
}

/** Accepts a stored value or a display label; returns null when unrecognised. */
export function parseTier(input: string | null | undefined): TierValue | null {
  const trimmed = String(input ?? '').trim();
  const match = TIERS.find((tier) => tier.value === trimmed || tier.label === trimmed);
  return match?.value ?? null;
}

/** URL segment used by the public `/tiers/[tier]` pages, e.g. `under-consideration`. */
export function tierPathSegment(value: TierValue): string {
  return value.replace(/_/g, '-');
}
