import { eq } from 'drizzle-orm';
import { briberyRecords } from '@/db/schema';
import { adminRoute, jsonError, jsonResponse } from '@/lib/admin-api';
import { briberyInputSchema, briberyPublishSchema } from '@/lib/bribery-schema';
import { briberyValues, serializeBribery } from '@/lib/bribery';
import { db } from '@/lib/db';

export const prerender = false;

const NOT_FOUND = 'Bribery record not found.';
const notFound = () => jsonError(404, NOT_FOUND);

export const PUT = adminRoute(
  {
    action: 'Update bribery record',
    publish: 'queue',
    params: { id: NOT_FOUND },
    body: briberyInputSchema,
  },
  async ({ params, body }) => {
    const result = await briberyValues(db, body);
    if (!result.ok)
      return jsonError(400, 'Please correct the highlighted fields.', { venueId: result.error });

    const [row] = await db
      .update(briberyRecords)
      .set(result.values)
      .where(eq(briberyRecords.id, params.id))
      .returning();
    return row ? jsonResponse({ record: serializeBribery(row) }) : notFound();
  }
);

/** Publish or unpublish without resending the whole record. */
export const PATCH = adminRoute(
  {
    action: 'Publish bribery record',
    publish: 'queue',
    params: { id: NOT_FOUND },
    body: briberyPublishSchema,
  },
  async ({ params, body }) => {
    const [row] = await db
      .update(briberyRecords)
      .set({ published: body.published, updatedAt: new Date() })
      .where(eq(briberyRecords.id, params.id))
      .returning();
    return row ? jsonResponse({ record: serializeBribery(row) }) : notFound();
  }
);

export const DELETE = adminRoute(
  { action: 'Delete bribery record', publish: 'queue', params: { id: NOT_FOUND } },
  async ({ params }) => {
    const [row] = await db
      .delete(briberyRecords)
      .where(eq(briberyRecords.id, params.id))
      .returning({ id: briberyRecords.id });
    return row ? jsonResponse({ ok: true }) : notFound();
  }
);
