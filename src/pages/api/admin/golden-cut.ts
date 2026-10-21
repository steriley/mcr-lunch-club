import type { APIRoute } from 'astro';
import { jsonError, jsonResponse, readJson, requireAdmin, serverError, validationError } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { listGoldenCut, saveGoldenCut } from '@/lib/golden-cut';
import { goldenCutInputSchema } from '@/lib/golden-cut-schema';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  try {
    return jsonResponse({ entries: await listGoldenCut(db) });
  } catch (error) {
    return serverError('Load the Golden Cut', error);
  }
};

/** Replaces the whole list, in the order given. Any admin; no countersign. */
export const PUT: APIRoute = async ({ request }) => {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  const parsed = goldenCutInputSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);

  try {
    const result = await saveGoldenCut(db, parsed.data.entries, { id: session.user.id, name: session.user.name, email: session.user.email });
    if (!result.ok) return jsonError(400, result.error);
    return jsonResponse({ entries: await listGoldenCut(db) });
  } catch (error) {
    return serverError('Save the Golden Cut', error);
  }
};
