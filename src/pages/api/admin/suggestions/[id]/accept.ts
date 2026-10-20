import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { venueSuggestions } from '@/db/schema';
import { jsonError, jsonResponse, requireAdmin, serverError, uuidParam } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { createDraftVenueFromSuggestion } from '@/lib/suggestions';

export const prerender = false;

/** Turns a suggestion into an unpublished To Be Assessed venue for the Chairs to finish. */
export const POST: APIRoute = async ({ request, params }) => {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  const id = uuidParam.safeParse(params.id);
  if (!id.success) return jsonError(404, 'Suggestion not found.');

  try {
    const [suggestion] = await db.select().from(venueSuggestions).where(eq(venueSuggestions.id, id.data)).limit(1);
    if (!suggestion) return jsonError(404, 'Suggestion not found.');
    if (suggestion.venueId) return jsonError(409, 'A draft venue has already been created from this suggestion.');

    const venue = await createDraftVenueFromSuggestion(db, suggestion, session.user.id);
    return jsonResponse({ venueId: venue.id }, 201);
  } catch (error) {
    return serverError('Accept suggestion', error);
  }
};
