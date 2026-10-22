import { eq } from 'drizzle-orm';
import { venueSuggestions } from '@/db/schema';
import { adminRoute, jsonError, jsonResponse } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { suggestionStatusSchema } from '@/lib/suggestion-schema';
import { serializeSuggestion } from '@/lib/suggestions';

export const prerender = false;

const NOT_FOUND = 'Suggestion not found.';

/** Dismiss a suggestion, or move it back to the inbox. */
export const PATCH = adminRoute(
  { action: 'Update suggestion', params: { id: NOT_FOUND }, body: suggestionStatusSchema },
  async ({ params, body, actor }) => {
    const reviewed = body.status === 'dismissed';
    const [row] = await db
      .update(venueSuggestions)
      .set({
        status: body.status,
        reviewedAt: reviewed ? new Date() : null,
        reviewedBy: reviewed ? actor.id : null,
      })
      .where(eq(venueSuggestions.id, params.id))
      .returning();
    if (!row) return jsonError(404, NOT_FOUND);
    return jsonResponse({ suggestion: serializeSuggestion(row) });
  }
);

export const DELETE = adminRoute({ action: 'Delete suggestion', params: { id: NOT_FOUND } }, async ({ params }) => {
  const [row] = await db.delete(venueSuggestions).where(eq(venueSuggestions.id, params.id)).returning({ id: venueSuggestions.id });
  if (!row) return jsonError(404, NOT_FOUND);
  return jsonResponse({ ok: true });
});
