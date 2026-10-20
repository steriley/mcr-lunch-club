import type { APIRoute } from 'astro';
import { z } from 'zod';
import { jsonError, jsonResponse, readJson, requireAdmin, serverError, uuidParam, validationError } from '@/lib/admin-api';
import { db } from '@/lib/db';
import {
  approveProposal,
  DECLINE_REASON_MAX,
  declineProposal,
  PROPOSAL_ERROR_MESSAGES,
  PROPOSAL_ERROR_STATUS,
  withdrawProposal,
} from '@/lib/tier-proposals';

const declineSchema = z.object({
  reason: z.string({ error: 'Give a reason for declining.' }).trim().min(1, 'Give a reason for declining.').max(DECLINE_REASON_MAX),
});

/** Handler for POST /api/admin/proposals/[id]/approve, /decline and /withdraw. */
export function proposalDecisionHandler(action: 'approve' | 'decline' | 'withdraw'): APIRoute {
  return async ({ request, params }) => {
    const session = await requireAdmin(request);
    if (session instanceof Response) return session;

    const id = uuidParam.safeParse(params.id);
    if (!id.success) return jsonError(404, 'Proposal not found.');

    let reason = '';
    if (action === 'decline') {
      const parsed = declineSchema.safeParse(await readJson(request));
      if (!parsed.success) return validationError(parsed.error);
      reason = parsed.data.reason;
    }

    try {
      const actor = { id: session.user.id, name: session.user.name, email: session.user.email };
      const result =
        action === 'approve'
          ? await approveProposal(db, id.data, actor)
          : action === 'decline'
            ? await declineProposal(db, id.data, actor, reason)
            : await withdrawProposal(db, id.data, actor);
      if (!result.ok) return jsonError(PROPOSAL_ERROR_STATUS[result.error], PROPOSAL_ERROR_MESSAGES[result.error]);
      return jsonResponse({ proposal: result.value });
    } catch (error) {
      return serverError(`${action} proposal`, error);
    }
  };
}
