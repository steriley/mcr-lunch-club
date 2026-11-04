import { adminRoute } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { listGoldenCut, saveGoldenCut } from '@/lib/golden-cut';
import { goldenCutInputSchema } from '@/lib/golden-cut-schema';
import { ok } from '@/lib/outcome';

export const prerender = false;

/** Replaces the whole list, in the order given. Any admin; no countersign. */
export const PUT = adminRoute(
  { action: 'Save the Golden Cut', body: goldenCutInputSchema },
  async ({ body, actor }) => {
    const saved = await saveGoldenCut(db, body.entries, actor);
    if (!saved.ok) return saved;
    return ok({ entries: await listGoldenCut(db) }, saved.published);
  }
);
