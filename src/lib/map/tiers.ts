import type { TierStatus } from '@/types';

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

export const TIER_METADATA: Record<TierStatus, TierMetadata> = {
  Approved: {
    status: 'Approved',
    slug: 'approved',
    label: 'Approved',
    colors: { bg: '#1E7A4E', border: '#155b39', text: '#ffffff', pinBg: '#1E7A4E' },
    nearMeEligible: true,
    nearMeDefault: true,
  },
  'Under Consideration': {
    status: 'Under Consideration',
    slug: 'under-consideration',
    label: 'Under Consideration',
    colors: { bg: '#C27803', border: '#8a5100', text: '#ffffff', pinBg: '#C27803' },
    nearMeEligible: true,
    nearMeDefault: false,
  },
  'To Be Assessed': {
    status: 'To Be Assessed',
    slug: 'to-be-assessed',
    label: 'To Be Assessed',
    colors: { bg: '#5A6474', border: '#454e5c', text: '#ffffff', pinBg: '#5A6474' },
    nearMeEligible: true,
    nearMeDefault: false,
  },
  'If We Must': {
    status: 'If We Must',
    slug: 'if-we-must',
    label: 'If We Must',
    colors: { bg: '#7C3A82', border: '#602d64', text: '#ffffff', pinBg: '#7C3A82' },
    nearMeEligible: true,
    nearMeDefault: false,
  },
  Rejected: {
    status: 'Rejected',
    slug: 'rejected',
    label: 'Rejected',
    colors: { bg: '#B92B27', border: '#8f201d', text: '#ffffff', pinBg: '#B92B27' },
    nearMeEligible: false,
    nearMeDefault: false,
  },
  'Gone But Not Forgotten': {
    status: 'Gone But Not Forgotten',
    slug: 'gone-but-not-forgotten',
    label: 'Gone But Not Forgotten',
    colors: { bg: '#71717A', border: '#52525b', text: '#ffffff', pinBg: '#71717A' },
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
