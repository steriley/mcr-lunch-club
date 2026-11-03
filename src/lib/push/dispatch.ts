import { waitUntil } from '@vercel/functions';
import { db } from '@/lib/db';
import { getPushEnvironment } from '@/lib/env';
import type { PushEvent } from '@/lib/push/messages';
import { deliverPushEvent } from '@/lib/push/notify';
import { webPushSender } from '@/lib/push/web-push-sender';

/**
 * The one way an admin action sends a push (#115). Call it only once the action's transaction has
 * committed and succeeded: a rolled-back or refused action must never notify anyone.
 *
 * The send runs with `waitUntil` and is never awaited, so a slow or failing push service never
 * delays or fails the action. With no VAPID keys configured it does nothing.
 */
export function notifyChairs(event: PushEvent): void {
  let delivery: Promise<unknown>;
  try {
    delivery = pushDelivery.deliver(event);
  } catch (error) {
    delivery = Promise.reject(error);
  }
  waitUntil(
    delivery.catch((error) =>
      console.error(
        `[push] Could not send the ${event.type} notification:`,
        error instanceof Error ? error.message : 'Unknown error'
      )
    )
  );
}

/** Swapped out by the route tests, which check which events each action sends. */
export const pushDelivery = {
  async deliver(event: PushEvent): Promise<void> {
    const keys = getPushEnvironment();
    if (!keys) return;
    await deliverPushEvent(db, event, { sender: webPushSender(keys) });
  },
};
