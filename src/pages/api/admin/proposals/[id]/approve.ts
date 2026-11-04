import { adminRoute } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { mapOutcome } from '@/lib/outcome';
import { notifyChairs } from '@/lib/push/dispatch';
import { decisionEvent } from '@/lib/push/messages';
import { approveProposal } from '@/lib/tier-proposals';

export const prerender = false;

export const POST = adminRoute(
  { action: 'Approve proposal', params: { id: 'proposal_not_found' } },
  async ({ params, actor }) => {
    const result = await approveProposal(db, params.id, actor);
    if (result.ok) notifyChairs(decisionEvent(result.value));
    return mapOutcome(result, (proposal) => ({ proposal }));
  }
);
