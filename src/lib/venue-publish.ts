import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { venues } from '@/db/schema';
import { jsonError, jsonResponse, requireAdmin, serverError, uuidParam } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { recordVenueRevision, serializeVenue } from '@/lib/venues';

/** Handler for POST /api/admin/venues/[id]/publish and /unpublish. */
export function publishHandler(published: boolean): APIRoute {
  return async ({ request, params }) => {
    const session = await requireAdmin(request);
    if (session instanceof Response) return session;

    const id = uuidParam.safeParse(params.id);
    if (!id.success) return jsonError(404, 'Venue not found.');

    try {
      const [row] = await db
        .update(venues)
        .set({ published, updatedBy: session.user.id, updatedAt: new Date() })
        .where(eq(venues.id, id.data))
        .returning();
      if (!row) return jsonError(404, 'Venue not found.');

      await recordVenueRevision(db, row, session.user.id);
      return jsonResponse({ venue: serializeVenue(row) });
    } catch (error) {
      return serverError(published ? 'Publish venue' : 'Unpublish venue', error);
    }
  };
}
