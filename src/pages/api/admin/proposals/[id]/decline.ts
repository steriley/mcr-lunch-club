import { z } from 'zod';
import { adminRoute } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { mapOutcome } from '@/lib/outcome';
import { notifyChairs } from '@/lib/push/dispatch';
import { decisionEvent } from '@/lib/push/messages';
import { DECLINE_REASON_MAX, declineProposal } from '@/lib/tier-proposals';

export const prerender = false;

const declineSchema = z.object({
  reason: z
    .string({ error: 'Give a reason for declining.' })
    .trim()
    .min(1, 'Give a reason for declining.')
    .max(DECLINE_REASON_MAX),
});

export const POST = adminRoute(
  { action: 'Decline proposal', params: { id: 'proposal_not_found' }, body: declineSchema },
  async ({ params, body, actor }) => {
    const result = await declineProposal(db, params.id, actor, body.reason);
    if (result.ok) notifyChairs(decisionEvent(result.value));
    return mapOutcome(result, (proposal) => ({ proposal }));
  }
);
