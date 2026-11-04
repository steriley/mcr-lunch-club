import { adminRoute, jsonError, jsonResponse } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { notifyChairs } from '@/lib/push/dispatch';
import { decisionEvent } from '@/lib/push/messages';
import {
  approveProposal,
  PROPOSAL_ERROR_MESSAGES,
  PROPOSAL_ERROR_STATUS,
} from '@/lib/tier-proposals';

export const prerender = false;

export const POST = adminRoute(
  { action: 'Approve proposal', publish: 'queue', params: { id: 'proposal_not_found' } },
  async ({ params, actor, publishedVenue }) => {
    const result = await approveProposal(db, params.id, actor);
    if (!result.ok)
      return jsonError(PROPOSAL_ERROR_STATUS[result.error], PROPOSAL_ERROR_MESSAGES[result.error]);
    await publishedVenue(result.value.venueId);
    notifyChairs(decisionEvent(result.value));
    return jsonResponse({ proposal: result.value });
  }
);
