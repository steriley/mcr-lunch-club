import { and, eq, ne } from 'drizzle-orm';
import { venueSuggestions } from '@/db/schema';
import { adminRoute, jsonError, jsonResponse } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { suggestionStatusSchema } from '@/lib/suggestion-schema';
import { serializeSuggestion } from '@/lib/suggestions';

export const prerender = false;

const NOT_FOUND = 'Suggestion not found.';

/**
 * Dismiss a suggestion, or move it back to the inbox. An accepted suggestion
 * is final (it links to the venue made from it), so a stale inbox tab cannot
 * undo another Chair's acceptance: that answers 409 and changes nothing.
 */
export const PATCH = adminRoute(
  {
    action: 'Update suggestion',
    publishes: false,
    params: { id: NOT_FOUND },
    body: suggestionStatusSchema,
  },
  async ({ params, body, actor }) => {
    const reviewed = body.status === 'dismissed';
    const [row] = await db
      .update(venueSuggestions)
      .set({
        status: body.status,
        reviewedAt: reviewed ? new Date() : null,
        reviewedBy: reviewed ? actor.id : null,
      })
      .where(and(eq(venueSuggestions.id, params.id), ne(venueSuggestions.status, 'accepted')))
      .returning();
    if (row) return jsonResponse({ suggestion: serializeSuggestion(row) });

    const [existing] = await db
      .select({ id: venueSuggestions.id })
      .from(venueSuggestions)
      .where(eq(venueSuggestions.id, params.id))
      .limit(1);
    return existing
      ? jsonError(
          409,
          'Another Chair has already accepted this suggestion and made a venue from it. Reload the inbox to see it.'
        )
      : jsonError(404, NOT_FOUND);
  }
);

export const DELETE = adminRoute(
  { action: 'Delete suggestion', publishes: false, params: { id: NOT_FOUND } },
  async ({ params }) => {
    const [row] = await db
      .delete(venueSuggestions)
      .where(eq(venueSuggestions.id, params.id))
      .returning({ id: venueSuggestions.id });
    if (!row) return jsonError(404, NOT_FOUND);
    return jsonResponse({ ok: true });
  }
);
