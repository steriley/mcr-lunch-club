import { briberyRecords } from '@/db/schema';
import { adminRoute, jsonError, jsonResponse } from '@/lib/admin-api';
import { briberyInputSchema } from '@/lib/bribery-schema';
import { briberyValues, serializeBribery } from '@/lib/bribery';
import { db } from '@/lib/db';

export const prerender = false;

export const POST = adminRoute(
  { action: 'Create bribery record', publish: 'queue', body: briberyInputSchema },
  async ({ body, actor }) => {
    const result = await briberyValues(db, body);
    if (!result.ok)
      return jsonError(400, 'Please correct the highlighted fields.', { venueId: result.error });

    const [row] = await db
      .insert(briberyRecords)
      .values({ ...result.values, createdBy: actor.email })
      .returning();
    return jsonResponse({ record: serializeBribery(row) }, 201);
  }
);
