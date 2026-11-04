import { z } from 'zod';
import { adminRoute, jsonError, jsonResponse } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { notifyChairs } from '@/lib/push/dispatch';
import { proposalEvent } from '@/lib/push/messages';
import { PROPOSAL_ERROR_MESSAGES, PROPOSAL_ERROR_STATUS, proposeTier } from '@/lib/tier-proposals';
import { TIER_VALUES } from '@/lib/tiers';

export const prerender = false;

const bodySchema = z.object({ proposedTier: z.enum(TIER_VALUES, { error: 'Choose a verdict.' }) });

/**
 * POST /api/admin/venues/[id]/proposals: propose a tier change. Replaces the
 * caller's own pending proposal; refused while another admin's is pending.
 */
export const POST = adminRoute(
  {
    action: 'Propose verdict',

    params: { id: 'venue_not_found' },
    body: bodySchema,
  },
  async ({ params, body, actor }) => {
    const result = await proposeTier(db, params.id, body.proposedTier, actor);
    if (!result.ok)
      return jsonError(PROPOSAL_ERROR_STATUS[result.error], PROPOSAL_ERROR_MESSAGES[result.error]);
    notifyChairs(proposalEvent(result.value));
    return jsonResponse({ proposal: result.value }, 201);
  }
);
