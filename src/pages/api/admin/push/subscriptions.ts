import { adminRoute, jsonError, jsonResponse } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { getPushEnvironment } from '@/lib/env';
import { pushSubscriptionSchema, removeSubscriptionSchema } from '@/lib/push/schema';
import { deleteSubscription, listDevices, upsertSubscription } from '@/lib/push/store';

export const prerender = false;

/** GET /api/admin/push/subscriptions: the caller's devices. */
export const GET = adminRoute({ action: 'List push devices' }, async ({ actor }) =>
  jsonResponse({ devices: await listDevices(db, actor.id) })
);

/**
 * POST /api/admin/push/subscriptions: saves this device for the caller. Upserts by endpoint, so a
 * device that was another Chair's moves to the caller.
 */
export const POST = adminRoute(
  { action: 'Save push device', body: pushSubscriptionSchema },
  async ({ body, actor }) => {
    if (!getPushEnvironment()) return jsonError(409, 'Notifications are not set up on this site.');
    await upsertSubscription(db, actor.id, body);
    return jsonResponse({ devices: await listDevices(db, actor.id) });
  }
);

/** DELETE /api/admin/push/subscriptions: removes one of the caller's own devices, by endpoint or id. */
export const DELETE = adminRoute(
  { action: 'Remove push device', body: removeSubscriptionSchema },
  async ({ body, actor }) => {
    const removed = await deleteSubscription(db, actor.id, body);
    return jsonResponse({ removed, devices: await listDevices(db, actor.id) });
  }
);
