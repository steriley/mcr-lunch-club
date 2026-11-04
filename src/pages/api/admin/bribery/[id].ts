import { adminRoute } from '@/lib/admin-api';
import { briberyInputSchema, briberyPublishSchema } from '@/lib/bribery-schema';
import { deleteBribery, serializeBribery, setBriberyPublished, updateBribery } from '@/lib/bribery';
import { db } from '@/lib/db';
import { mapOutcome } from '@/lib/outcome';

export const prerender = false;

const params = { id: 'bribery_not_found' } as const;

export const PUT = adminRoute(
  { action: 'Update bribery record', params, body: briberyInputSchema },
  async ({ params, body }) =>
    mapOutcome(await updateBribery(db, params.id, body), (record) => ({
      record: serializeBribery(record),
    }))
);

/** Publish or unpublish without resending the whole record. */
export const PATCH = adminRoute(
  { action: 'Publish bribery record', params, body: briberyPublishSchema },
  async ({ params, body }) =>
    mapOutcome(await setBriberyPublished(db, params.id, body.published), (record) => ({
      record: serializeBribery(record),
    }))
);

export const DELETE = adminRoute({ action: 'Delete bribery record', params }, async ({ params }) =>
  mapOutcome(await deleteBribery(db, params.id), () => ({ ok: true }))
);
