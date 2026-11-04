import { adminRoute } from '@/lib/admin-api';
import { briberyInputSchema } from '@/lib/bribery-schema';
import { createBribery, serializeBribery } from '@/lib/bribery';
import { db } from '@/lib/db';
import { mapOutcome } from '@/lib/outcome';

export const prerender = false;

export const POST = adminRoute(
  { action: 'Create bribery record', status: 201, body: briberyInputSchema },
  async ({ body, actor }) =>
    mapOutcome(await createBribery(db, body, actor.email), (record) => ({
      record: serializeBribery(record),
    }))
);
