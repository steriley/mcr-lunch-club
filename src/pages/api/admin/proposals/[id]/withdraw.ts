import { adminRoute } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { mapOutcome } from '@/lib/outcome';
import { withdrawProposal } from '@/lib/tier-proposals';

export const prerender = false;

export const POST = adminRoute(
  { action: 'Withdraw proposal', params: { id: 'proposal_not_found' } },
  async ({ params, actor }) =>
    mapOutcome(await withdrawProposal(db, params.id, actor), (proposal) => ({ proposal }))
);
