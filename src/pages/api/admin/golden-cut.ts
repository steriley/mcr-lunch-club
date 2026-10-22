import { adminRoute, jsonError, jsonResponse } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { listGoldenCut, saveGoldenCut } from '@/lib/golden-cut';
import { goldenCutInputSchema } from '@/lib/golden-cut-schema';

export const prerender = false;

export const GET = adminRoute({ action: 'Load the Golden Cut' }, async () => jsonResponse({ entries: await listGoldenCut(db) }));

/** Replaces the whole list, in the order given. Any admin; no countersign. */
export const PUT = adminRoute({ action: 'Save the Golden Cut', body: goldenCutInputSchema }, async ({ body, actor }) => {
  const result = await saveGoldenCut(db, body.entries, actor);
  if (!result.ok) return jsonError(400, result.error);
  return jsonResponse({ entries: await listGoldenCut(db) });
});
