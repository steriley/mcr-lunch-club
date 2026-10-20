import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { venueSuggestions } from '@/db/schema';
import { jsonError, jsonResponse, readJson, requireAdmin, serverError, uuidParam, validationError } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { suggestionStatusSchema } from '@/lib/suggestion-schema';
import { serializeSuggestion } from '@/lib/suggestions';

export const prerender = false;

/** Dismiss a suggestion, or move it back to the inbox. */
export const PATCH: APIRoute = async ({ request, params }) => {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  const id = uuidParam.safeParse(params.id);
  if (!id.success) return jsonError(404, 'Suggestion not found.');

  const parsed = suggestionStatusSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);

  try {
    const reviewed = parsed.data.status === 'dismissed';
    const [row] = await db
      .update(venueSuggestions)
      .set({
        status: parsed.data.status,
        reviewedAt: reviewed ? new Date() : null,
        reviewedBy: reviewed ? session.user.id : null,
      })
      .where(eq(venueSuggestions.id, id.data))
      .returning();
    if (!row) return jsonError(404, 'Suggestion not found.');
    return jsonResponse({ suggestion: serializeSuggestion(row) });
  } catch (error) {
    return serverError('Update suggestion', error);
  }
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  const id = uuidParam.safeParse(params.id);
  if (!id.success) return jsonError(404, 'Suggestion not found.');

  try {
    const [row] = await db.delete(venueSuggestions).where(eq(venueSuggestions.id, id.data)).returning({ id: venueSuggestions.id });
    if (!row) return jsonError(404, 'Suggestion not found.');
    return jsonResponse({ ok: true });
  } catch (error) {
    return serverError('Delete suggestion', error);
  }
};
