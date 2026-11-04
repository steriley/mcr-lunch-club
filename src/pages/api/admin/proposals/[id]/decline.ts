import { z } from 'zod';
import { adminRoute, jsonError, jsonResponse } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { notifyChairs } from '@/lib/push/dispatch';
import { decisionEvent } from '@/lib/push/messages';
import {
  DECLINE_REASON_MAX,
  declineProposal,
  PROPOSAL_ERROR_MESSAGES,
  PROPOSAL_ERROR_STATUS,
} from '@/lib/tier-proposals';

export const prerender = false;

const declineSchema = z.object({
  reason: z
    .string({ error: 'Give a reason for declining.' })
    .trim()
    .min(1, 'Give a reason for declining.')
    .max(DECLINE_REASON_MAX),
});

export const POST = adminRoute(
  {
    action: 'Decline proposal',

    params: { id: 'proposal_not_found' },
    body: declineSchema,
  },
  async ({ params, body, actor }) => {
    const result = await declineProposal(db, params.id, actor, body.reason);
    if (!result.ok)
      return jsonError(PROPOSAL_ERROR_STATUS[result.error], PROPOSAL_ERROR_MESSAGES[result.error]);
    notifyChairs(decisionEvent(result.value));
    return jsonResponse({ proposal: result.value });
  }
);
