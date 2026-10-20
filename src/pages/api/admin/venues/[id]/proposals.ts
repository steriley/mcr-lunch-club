import type { APIRoute } from 'astro';
import { z } from 'zod';
import { jsonError, jsonResponse, readJson, requireAdmin, serverError, uuidParam, validationError } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { PROPOSAL_ERROR_MESSAGES, PROPOSAL_ERROR_STATUS, proposeTier } from '@/lib/tier-proposals';
import { TIER_VALUES } from '@/lib/tiers';

export const prerender = false;

const bodySchema = z.object({ proposedTier: z.enum(TIER_VALUES, { error: 'Choose a tier.' }) });

/**
 * POST /api/admin/venues/[id]/proposals: propose a tier change. Replaces the
 * caller's own pending proposal; refused while another admin's is pending.
 */
export const POST: APIRoute = async ({ request, params }) => {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  const id = uuidParam.safeParse(params.id);
  if (!id.success) return jsonError(404, 'Venue not found.');

  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);

  try {
    const result = await proposeTier(db, id.data, parsed.data.proposedTier, { id: session.user.id, name: session.user.name, email: session.user.email });
    if (!result.ok) return jsonError(PROPOSAL_ERROR_STATUS[result.error], PROPOSAL_ERROR_MESSAGES[result.error]);
    return jsonResponse({ proposal: result.value }, 201);
  } catch (error) {
    return serverError('Propose tier', error);
  }
};
