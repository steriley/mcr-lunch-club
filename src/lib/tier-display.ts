import type { CostTier, TierStatus } from '@/types';

/** Banner colour, icon and motto for each tier, shared by the venue sheet and the venue page. */
export const TIER_BANNERS: Record<TierStatus, { bg: string; icon: string; quote: string }> = {
  Approved: {
    bg: 'bg-[#1E7A4E]',
    icon: '🏆',
    quote: 'The Highest Honour in Manchester Lunching: The Right to be Returned To',
  },
  'Under Consideration': {
    bg: 'bg-[#C27803]',
    icon: '⏳',
    quote: 'The Waiting Chamber of Judgement — Pending further evidence and appetite',
  },
  'To Be Assessed': {
    bg: 'bg-[#5A6474]',
    icon: '📜',
    quote: 'Entered the Field of Vision — Fate remains undecided pending inspection',
  },
  'If We Must': {
    bg: 'bg-[#7C3A82]',
    icon: '🌧',
    quote: 'Not Celebrated, But Tolerated — Acceptable only when circumstance forces our hand',
  },
  Rejected: {
    bg: 'bg-[#B92B27]',
    icon: '⛔',
    quote: 'Removed from the Sacred Lunch Rotation — Returnable only through exceptional redemption',
  },
  'Gone But Not Forgotten': {
    bg: 'bg-[#71717A]',
    icon: '🕊',
    quote: 'Doors Closed, But Legend Remains in the Lunching Annals',
  },
};

/** The club's cost key, as written in the manifesto. */
export const COST_LABELS: Record<CostTier, string> = {
  '£': 'Under £10',
  '££': 'Above £10',
  '£££': 'Payday treat',
};

/** The order tiers appear in on the homepage filter and the tier page tabs. */
export const TIER_DISPLAY_ORDER: readonly TierStatus[] = [
  'Approved',
  'Under Consideration',
  'To Be Assessed',
  'If We Must',
  'Rejected',
  'Gone But Not Forgotten',
];

/** Tiers selected on the homepage by default (and after Reset Filters) for the widest view of lunching options. */
export const DEFAULT_HOME_TIERS: readonly TierStatus[] = ['Approved', 'Under Consideration', 'To Be Assessed'];

/** Accent colour for each tier's chip. Matches the banner backgrounds above. */
export const TIER_COLORS: Record<TierStatus, string> = {
  Approved: '#1E7A4E',
  'Under Consideration': '#C27803',
  'To Be Assessed': '#5A6474',
  'If We Must': '#7C3A82',
  Rejected: '#B92B27',
  'Gone But Not Forgotten': '#71717A',
};

/** Number of venues in each tier, including tiers with none. */
export function countVenuesByTier(venues: readonly { status: TierStatus }[]): Record<TierStatus, number> {
  const counts = Object.fromEntries(TIER_DISPLAY_ORDER.map((tier) => [tier, 0])) as Record<TierStatus, number>;
  for (const venue of venues) counts[venue.status] += 1;
  return counts;
}
