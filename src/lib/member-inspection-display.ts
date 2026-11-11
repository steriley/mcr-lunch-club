import type { TierValue } from '@/lib/tiers';

/**
 * People's Inspections (#137): the stored values and how they read. Dependency-free, so the public
 * venue page's island and the database schema can import it without pulling in Zod.
 */

/**
 * The verdict a member gives. "Under Consideration" is the Chairs' holding phase while they
 * double-approve a venue, so it is not a member's call.
 */
export const MEMBER_VERDICT_VOTES = ['approve', 'if_we_must', 'reject'] as const;
/** What the lunch cost, in the club's own pound signs (the same three as a venue's `cost`). */
export const MEMBER_COSTS = ['£', '££', '£££'] as const;
/** The club tier each vote reads as, so a vote shows with that tier's own wording, colour and mark. */
export const VERDICT_VOTE_TIERS = {
  approve: 'approved',
  if_we_must: 'if_we_must',
  reject: 'rejected',
} as const satisfies Record<MemberVerdictVote, TierValue>;
export const MEMBER_VERIFICATIONS = ['none', 'gps'] as const;
export const MEMBER_INSPECTION_STATUSES = ['visible', 'held', 'removed'] as const;
/** Which anti-gaming check held a log for the Chairs. */
export const MEMBER_HOLD_REASONS = ['new_accounts', 'score_spike'] as const;

export type MemberCost = (typeof MEMBER_COSTS)[number];
export type MemberVerdictVote = (typeof MEMBER_VERDICT_VOTES)[number];
export type MemberInspectionStatus = (typeof MEMBER_INSPECTION_STATUSES)[number];
export type MemberHoldReason = (typeof MEMBER_HOLD_REASONS)[number];

export const VERDICT_VOTE_LABELS: Record<MemberVerdictVote, string> = {
  approve: 'Approve',
  if_we_must: 'If we must',
  reject: 'Reject',
};

export const HOLD_REASON_LABELS: Record<MemberHoldReason, string> = {
  new_accounts: 'Many logs from new accounts',
  score_spike: 'Verdicts swung against the 90-day mean',
};
