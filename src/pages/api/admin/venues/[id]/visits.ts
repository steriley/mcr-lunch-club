import { adminRoute, jsonError, jsonResponse } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { visitInputSchema } from '@/lib/field-notes-schema';
import { logVisit } from '@/lib/visits';

export const prerender = false;

/**
 * POST /api/admin/venues/[id]/visits: "Log a visit", body `{ visitDate }` (today or earlier, London
 * clock). A standalone visit: no inspection, no tier effect, nothing public, so no `publish`.
 */
export const POST = adminRoute(
  {
    action: 'Log visit',
    params: { id: 'Venue not found.' },
    body: visitInputSchema(),
  },
  async ({ params, body, actor }) => {
    const outcome = await logVisit(db, params.id, actor, body.visitDate);
    if (outcome.result === 'not_found') return jsonError(404, 'Venue not found.');
    if (outcome.result === 'future_date')
      return jsonError(400, 'Please correct the highlighted fields.', {
        visitDate: 'A visit cannot be in the future.',
      });
    if (outcome.result === 'already_logged')
      return jsonError(
        409,
        'You already have a visit on that day. Add another note to it instead.',
        {
          visitDate: 'You already have a visit on that day.',
        }
      );
    return jsonResponse({ visit: outcome.visit }, 201);
  }
);
