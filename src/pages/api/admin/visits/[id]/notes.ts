import { adminRoute, jsonError, jsonResponse } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { addNote } from '@/lib/field-notes';
import { noteInputSchema } from '@/lib/field-notes-schema';

export const prerender = false;

/**
 * POST /api/admin/visits/[id]/notes: a field note, body `{ body }`, on the signed-in Chair's own
 * visit, at any time after it. Internal, so no `publish`.
 */
export const POST = adminRoute(
  {
    action: 'Add field note',
    params: { id: 'Visit not found.' },
    body: noteInputSchema,
  },
  async ({ params, body, actor }) => {
    const outcome = await addNote(db, params.id, actor, body.body);
    if (outcome.result === 'not_found') return jsonError(404, 'Visit not found.');
    if (outcome.result === 'not_your_visit')
      return jsonError(403, 'Only the Chair who made this visit can add a note to it.');
    return jsonResponse({ note: outcome.note }, 201);
  }
);
