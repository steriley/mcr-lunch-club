import type { APIRoute } from 'astro';
import { jsonError, jsonResponse, requireAdmin, serverError, uuidParam } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { closeVenue, reopenVenue } from '@/lib/venue-closure';
import { serializeVenue } from '@/lib/venues';

/** Handler for POST /api/admin/venues/[id]/close and /reopen. */
export function closureHandler(action: 'close' | 'reopen'): APIRoute {
  return async ({ request, params }) => {
    const session = await requireAdmin(request);
    if (session instanceof Response) return session;

    const id = uuidParam.safeParse(params.id);
    if (!id.success) return jsonError(404, 'Venue not found.');

    try {
      const actor = { id: session.user.id, name: session.user.name, email: session.user.email };
      const result = action === 'close' ? await closeVenue(db, id.data, actor) : await reopenVenue(db, id.data, actor);
      if (!result.ok) {
        if (result.reason === 'not_found') return jsonError(404, 'Venue not found.');
        return jsonError(409, result.reason === 'already_closed' ? 'This venue is already marked closed.' : 'This venue is not closed.');
      }
      return jsonResponse({ venue: serializeVenue(result.venue) });
    } catch (error) {
      return serverError(action === 'close' ? 'Close venue' : 'Reopen venue', error);
    }
  };
}
