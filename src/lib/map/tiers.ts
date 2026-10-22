import type { TierStatus } from '@/types';
import { TIER_COLORS } from '@/lib/tier-display';

export interface TierColors {
  bg: string;
  border: string;
  text: string;
  pinBg: string;
}

export interface TierMetadata {
  status: TierStatus;
  slug: string;
  label: string;
  colors: TierColors;
  nearMeEligible: boolean;
  nearMeDefault: boolean;
}

/**
 * Chip and pin fills come from TIER_COLORS (the single source of tier colours);
 * only the map-specific border and text colours are defined here.
 */
function tierColors(status: TierStatus, border: string): TierColors {
  return { bg: TIER_COLORS[status], border, text: '#ffffff', pinBg: TIER_COLORS[status] };
}

export const TIER_METADATA: Record<TierStatus, TierMetadata> = {
  Approved: {
    status: 'Approved',
    slug: 'approved',
    label: 'Approved',
    colors: tierColors('Approved', '#155b39'),
    nearMeEligible: true,
    nearMeDefault: true,
  },
  'Under Consideration': {
    status: 'Under Consideration',
    slug: 'under-consideration',
    label: 'Under Consideration',
    colors: tierColors('Under Consideration', '#8a5100'),
    nearMeEligible: true,
    nearMeDefault: false,
  },
  'To Be Assessed': {
    status: 'To Be Assessed',
    slug: 'to-be-assessed',
    label: 'To Be Assessed',
    colors: tierColors('To Be Assessed', '#454e5c'),
    nearMeEligible: true,
    nearMeDefault: false,
  },
  'If We Must': {
    status: 'If We Must',
    slug: 'if-we-must',
    label: 'If We Must',
    colors: tierColors('If We Must', '#602d64'),
    nearMeEligible: true,
    nearMeDefault: false,
  },
  Rejected: {
    status: 'Rejected',
    slug: 'rejected',
    label: 'Rejected',
    colors: tierColors('Rejected', '#8f201d'),
    nearMeEligible: false,
    nearMeDefault: false,
  },
  'Gone But Not Forgotten': {
    status: 'Gone But Not Forgotten',
    slug: 'gone-but-not-forgotten',
    label: 'Gone But Not Forgotten',
    colors: tierColors('Gone But Not Forgotten', '#52525b'),
    nearMeEligible: false,
    nearMeDefault: false,
  },
};

/**
 * Backward-compatible color mapping directly indexing by TierStatus.
 */
export const STATUS_COLORS: Record<TierStatus, TierColors> = {
  Approved: TIER_METADATA['Approved'].colors,
  'Under Consideration': TIER_METADATA['Under Consideration'].colors,
  'To Be Assessed': TIER_METADATA['To Be Assessed'].colors,
  Rejected: TIER_METADATA['Rejected'].colors,
  'If We Must': TIER_METADATA['If We Must'].colors,
  'Gone But Not Forgotten': TIER_METADATA['Gone But Not Forgotten'].colors,
};

/**
 * Tiers eligible for display in Near Me locate mode.
 */
export const NEAR_ME_ELIGIBLE_TIERS: TierStatus[] = Object.values(TIER_METADATA)
  .filter((tier) => tier.nearMeEligible)
  .map((tier) => tier.status);

/**
 * Default tier selected when opening Near Me mode (Approved only).
 */
export const NEAR_ME_DEFAULT_TIERS: TierStatus[] = Object.values(TIER_METADATA)
  .filter((tier) => tier.nearMeDefault)
  .map((tier) => tier.status);

/**
 * Check whether a tier status is eligible for Near Me locate mode.
 */
export function isNearMeEligible(status: TierStatus): boolean {
  return TIER_METADATA[status]?.nearMeEligible ?? false;
}

/**
 * Get tier metadata by status with fallback to Approved.
 */
export function getTierMetadata(status: TierStatus): TierMetadata {
  return TIER_METADATA[status] || TIER_METADATA['Approved'];
}

/**
 * Toggle a tier in the Near Me selection. The last remaining tier cannot be
 * switched off, so the list and map are never emptied by filters alone.
 */
export function toggleNearMeTier(selected: readonly TierStatus[], status: TierStatus): TierStatus[] {
  if (!selected.includes(status)) return [...selected, status];
  if (selected.length <= 1) return [...selected];
  return selected.filter((tier) => tier !== status);
}
