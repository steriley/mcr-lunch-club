/**
 * People's Inspections (#137): the stored values and how they read. Dependency-free, so the public
 * venue page's island and the database schema can import it without pulling in Zod.
 */

export const MEMBER_VERDICT_VOTES = ['approve', 'consider', 'if_we_must', 'reject'] as const;
export const MEMBER_VERIFICATIONS = ['none', 'gps'] as const;
export const MEMBER_INSPECTION_STATUSES = ['visible', 'held', 'removed'] as const;
/** Which anti-gaming check held a log for the Chairs. */
export const MEMBER_HOLD_REASONS = ['new_accounts', 'score_spike'] as const;

export type MemberVerdictVote = (typeof MEMBER_VERDICT_VOTES)[number];
export type MemberInspectionStatus = (typeof MEMBER_INSPECTION_STATUSES)[number];
export type MemberHoldReason = (typeof MEMBER_HOLD_REASONS)[number];

export const VERDICT_VOTE_LABELS: Record<MemberVerdictVote, string> = {
  approve: 'Approve',
  consider: 'Consider',
  if_we_must: 'If we must',
  reject: 'Reject',
};

export const HOLD_REASON_LABELS: Record<MemberHoldReason, string> = {
  new_accounts: 'Many logs from new accounts',
  score_spike: 'Scores spiked against the 90-day mean',
};

/** Pence as "£8.50". */
export function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}
