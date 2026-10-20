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
