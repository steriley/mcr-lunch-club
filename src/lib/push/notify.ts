import { eq } from 'drizzle-orm';
import { venues, type PushSubscriptionRow } from '@/db/schema';
import type { Database } from '@/lib/db-client';
import { secondsUntilLondonMidnight } from '@/lib/london-date';
import { sendWithRetry, topicFor, type PushSender } from '@/lib/push/delivery';
import {
  badgeCount,
  buildMessage,
  deliveryOptions,
  encodeMessage,
  selectRecipients,
  testMessage,
  type DeliveryOptions,
  type PushEvent,
} from '@/lib/push/messages';
import {
  badgeFor,
  claimSuggestionSlots,
  loadChairs,
  loadPendingWork,
  recordDelivery,
  subscriptionsFor,
} from '@/lib/push/store';
import type { PushMessage } from '@/lib/pwa/push';

/**
 * Sends a Chairs' push for an event that has already been committed (#115). Recipients and their
 * preferences are read now, at send time, so a Chair deactivated a moment ago gets nothing.
 */

export interface DeliveryReport {
  sent: number;
  failed: number;
  removed: number;
}

export interface NotifyDeps {
  sender: PushSender;
  now?: Date;
  /** For tests: the pause before a retry. */
  sleep?: (ms: number) => Promise<unknown>;
}

const EMPTY: DeliveryReport = { sent: 0, failed: 0, removed: 0 };

/** The push service's host, for logs: the rest of an endpoint is a capability and stays out. */
function hostOf(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return 'unknown host';
  }
}

async function venueName(db: Database, event: PushEvent): Promise<string | null> {
  if (event.type === 'suggestion') return null;
  const [row] = await db
    .select({ name: venues.name })
    .from(venues)
    .where(eq(venues.id, event.venueId))
    .limit(1);
  return row?.name ?? null;
}

/**
 * Sends each subscription its recipient's message, all at once: one slow push service never holds
 * up the others. Gone subscriptions are deleted; the rest record a success or a failure.
 */
async function sendToSubscriptions(
  db: Database,
  subscriptions: PushSubscriptionRow[],
  messageFor: (userId: string) => PushMessage,
  options: DeliveryOptions,
  deps: NotifyDeps
): Promise<DeliveryReport> {
  const now = deps.now ?? new Date();
  const results = await Promise.allSettled(
    subscriptions.map(async (subscription) => {
      const message = messageFor(subscription.userId);
      const { outcome, result } = await sendWithRetry(
        deps.sender,
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        encodeMessage(message),
        { ...options, topic: await topicFor(message.tag) },
        deps.sleep
      );
      if (outcome === 'too_large') {
        console.error(
          `[push] Payload refused as too large by ${hostOf(subscription.endpoint)}: a bug.`
        );
      } else if (outcome === 'failed') {
        console.warn(
          `[push] Delivery to ${hostOf(subscription.endpoint)} failed: ${result.error ?? result.statusCode}.`
        );
      }
      const recorded = outcome === 'too_large' ? 'failed' : outcome;
      await recordDelivery(db, subscription.id, recorded, now);
      return recorded;
    })
  );

  const report = { ...EMPTY };
  for (const result of results) {
    if (result.status === 'rejected') {
      report.failed += 1;
      console.error(
        '[push] Could not record a delivery:',
        result.reason instanceof Error ? result.reason.message : 'Unknown error'
      );
    } else if (result.value === 'delivered') report.sent += 1;
    else if (result.value === 'gone') report.removed += 1;
    else report.failed += 1;
  }
  return report;
}

export async function deliverPushEvent(
  db: Database,
  event: PushEvent,
  deps: NotifyDeps
): Promise<DeliveryReport> {
  const now = deps.now ?? new Date();
  const chairs = await loadChairs(db);
  let recipients = selectRecipients(event, chairs, now);
  // A flood of suggestions collapses into one rolling notification, at most every ten minutes.
  if (event.type === 'suggestion') recipients = await claimSuggestionSlots(db, recipients, now);
  if (recipients.length === 0) return EMPTY;

  const subscriptions = await subscriptionsFor(db, recipients);
  if (subscriptions.length === 0) return EMPTY;

  const [work, name] = await Promise.all([loadPendingWork(db, now), venueName(db, event)]);
  const preferences = new Map(chairs.map((chair) => [chair.id, chair.preferences]));
  return sendToSubscriptions(
    db,
    subscriptions,
    (userId) =>
      buildMessage(event, {
        venueName: name,
        badge: badgeCount(userId, work, preferences.get(userId)!),
        suggestionCount: work.newSuggestions,
      }),
    deliveryOptions(event, secondsUntilLondonMidnight(now)),
    deps
  );
}

/** "Send a test notification": the caller's own devices only, whatever their preferences. */
export async function sendTestPush(
  db: Database,
  userId: string,
  deps: NotifyDeps
): Promise<DeliveryReport> {
  const subscriptions = await subscriptionsFor(db, [userId]);
  if (subscriptions.length === 0) return EMPTY;
  const badge = await badgeFor(db, userId, deps.now);
  return sendToSubscriptions(
    db,
    subscriptions,
    () => testMessage(badge),
    deliveryOptions({ type: 'test' }, 0),
    deps
  );
}
