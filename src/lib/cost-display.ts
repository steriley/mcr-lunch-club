import type { CostTier } from '@/types';

/** The club's cost key, as written in the manifesto. */
export const COST_LABELS: Record<CostTier, string> = {
  '£': 'Under £10',
  '££': 'Above £10',
  '£££': 'Payday treat',
};
