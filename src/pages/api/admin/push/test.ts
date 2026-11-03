import { adminRoute, jsonError, jsonResponse } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { getPushEnvironment } from '@/lib/env';
import { sendTestPush } from '@/lib/push/notify';
import { claimTestSlot } from '@/lib/push/store';
import { webPushSender } from '@/lib/push/web-push-sender';

export const prerender = false;

/**
 * POST /api/admin/push/test: "Test notification" to the caller's own devices only. A few a minute
 * at most. The Chair asked for it, so this one waits for the push services' answers.
 */
export const POST = adminRoute({ action: 'Send test notification' }, async ({ actor }) => {
  const keys = getPushEnvironment();
  if (!keys) return jsonError(409, 'Notifications are not set up on this site.');
  if (!(await claimTestSlot(db, actor.id)))
    return jsonError(429, 'A test notification was sent a moment ago. Try again shortly.');
  const report = await sendTestPush(db, actor.id, { sender: webPushSender(keys) });
  return jsonResponse(report);
});
