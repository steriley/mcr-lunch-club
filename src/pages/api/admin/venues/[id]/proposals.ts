import { z } from 'zod';
import { adminRoute } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { mapOutcome } from '@/lib/outcome';
import { notifyChairs } from '@/lib/push/dispatch';
import { proposalEvent } from '@/lib/push/messages';
import { proposeTier } from '@/lib/tier-proposals';
import { TIER_VALUES } from '@/lib/tiers';

export const prerender = false;

const bodySchema = z.object({ proposedTier: z.enum(TIER_VALUES, { error: 'Choose a verdict.' }) });

/**
 * POST /api/admin/venues/[id]/proposals: propose a tier change. Replaces the
 * caller's own pending proposal; refused while another admin's is pending.
 */
export const POST = adminRoute(
  { action: 'Propose verdict', status: 201, params: { id: 'venue_not_found' }, body: bodySchema },
  async ({ params, body, actor }) => {
    const result = await proposeTier(db, params.id, body.proposedTier, actor);
    if (result.ok) notifyChairs(proposalEvent(result.value));
    return mapOutcome(result, (proposal) => ({ proposal }));
  }
);
