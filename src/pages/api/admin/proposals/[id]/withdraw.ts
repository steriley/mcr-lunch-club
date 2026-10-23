import { adminRoute, jsonError, jsonResponse } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { PROPOSAL_ERROR_MESSAGES, PROPOSAL_ERROR_STATUS, withdrawProposal } from '@/lib/tier-proposals';

export const prerender = false;

export const POST = adminRoute({ action: 'withdraw proposal', publishes: false, params: { id: 'Proposal not found.' } }, async ({ params, actor }) => {
  const result = await withdrawProposal(db, params.id, actor);
  if (!result.ok) return jsonError(PROPOSAL_ERROR_STATUS[result.error], PROPOSAL_ERROR_MESSAGES[result.error]);
  return jsonResponse({ proposal: result.value });
});
