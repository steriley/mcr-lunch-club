import { and, count, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { user } from '@/db/auth-schema';
import {
  inspections,
  notificationPreferences,
  pushSubscriptions,
  tierProposals,
  venueSuggestions,
  type NotificationPreferencesRow,
} from '@/db/schema';
import type { Database } from '@/lib/db-client';
import { londonDate } from '@/lib/london-date';
import {
  badgeCount,
  DEFAULT_PREFERENCES,
  type ChairCandidate,
  type NotificationPreferences,
  type PendingWork,
} from '@/lib/push/messages';
import type { PushSubscriptionInput } from '@/lib/push/schema';

/** Chairs' push subscriptions and notification preferences (#115). */

/** At most one suggestion push per Chair in this window; the next one carries the running count. */
const SUGGESTION_PUSH_INTERVAL_MS = 10 * 60_000;
/** "Send a test notification": a few a minute at most. */
const TEST_PUSH_INTERVAL_MS = 15_000;

function preferencesOf(row: Partial<NotificationPreferencesRow> | null | undefined) {
  if (!row) return { ...DEFAULT_PREFERENCES };
  return {
    proposals: row.proposals ?? DEFAULT_PREFERENCES.proposals,
    decisions: row.decisions ?? DEFAULT_PREFERENCES.decisions,
    visits: row.visits ?? DEFAULT_PREFERENCES.visits,
    suggestions: row.suggestions ?? DEFAULT_PREFERENCES.suggestions,
  };
}

/**
 * Saves this device for `userId`. Unique by endpoint: a device last used by another Chair moves
 * to this one. `oldEndpoint` (from a key rotation or `pushsubscriptionchange`) is removed if it
 * was this Chair's.
 */
export async function upsertSubscription(
  db: Database,
  userId: string,
  input: PushSubscriptionInput
): Promise<void> {
  const replaced =
    input.oldEndpoint && input.oldEndpoint !== input.endpoint
      ? (
          await db
            .delete(pushSubscriptions)
            .where(
              and(
                eq(pushSubscriptions.endpoint, input.oldEndpoint),
                eq(pushSubscriptions.userId, userId)
              )
            )
            .returning({ label: pushSubscriptions.userAgentLabel })
        )[0]
      : undefined;
  const label = input.label ?? replaced?.label ?? null;
  await db
    .insert(pushSubscriptions)
    .values({
      userId,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgentLabel: label,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        userAgentLabel: label,
        failureCount: 0,
      },
    });
}

/** Removes one of the caller's own devices, by endpoint (this device) or id (the device list). */
export async function deleteSubscription(
  db: Database,
  userId: string,
  which: { endpoint: string } | { id: string }
): Promise<boolean> {
  const match =
    'endpoint' in which
      ? eq(pushSubscriptions.endpoint, which.endpoint)
      : eq(pushSubscriptions.id, which.id);
  const rows = await db
    .delete(pushSubscriptions)
    .where(and(match, eq(pushSubscriptions.userId, userId)))
    .returning({ id: pushSubscriptions.id });
  return rows.length > 0;
}

/** A deactivated Chair's devices stop at once. */
export async function deleteUserSubscriptions(db: Database, userId: string): Promise<number> {
  const rows = await db
    .delete(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .returning({ id: pushSubscriptions.id });
  return rows.length;
}

export interface DeviceListItem {
  id: string;
  label: string | null;
  endpoint: string;
  createdAt: string;
  lastSuccessAt: string | null;
  failureCount: number;
}

export async function listDevices(db: Database, userId: string): Promise<DeviceListItem[]> {
  const rows = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .orderBy(pushSubscriptions.createdAt);
  return rows.map((row) => ({
    id: row.id,
    label: row.userAgentLabel,
    endpoint: row.endpoint,
    createdAt: row.createdAt.toISOString(),
    lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
    failureCount: row.failureCount,
  }));
}

export interface PreferencesState extends NotificationPreferences {
  promptDismissed: boolean;
}

export async function getPreferences(db: Database, userId: string): Promise<PreferencesState> {
  const [row] = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);
  return { ...preferencesOf(row), promptDismissed: Boolean(row?.promptDismissedAt) };
}

export async function savePreferences(
  db: Database,
  userId: string,
  changes: Partial<NotificationPreferences> & { promptDismissed?: boolean },
  now: Date = new Date()
): Promise<PreferencesState> {
  const { promptDismissed, ...flags } = changes;
  const set = {
    ...flags,
    ...(promptDismissed === undefined ? {} : { promptDismissedAt: promptDismissed ? now : null }),
    updatedAt: now,
  };
  await db
    .insert(notificationPreferences)
    .values({ userId, ...DEFAULT_PREFERENCES, ...set })
    .onConflictDoUpdate({ target: notificationPreferences.userId, set });
  return getPreferences(db, userId);
}

/** True (and the slot taken) when this Chair has not sent a test push in the last few seconds. */
export async function claimTestSlot(
  db: Database,
  userId: string,
  now: Date = new Date()
): Promise<boolean> {
  const rows = await db
    .insert(notificationPreferences)
    .values({ userId, ...DEFAULT_PREFERENCES, testSentAt: now })
    .onConflictDoUpdate({
      target: notificationPreferences.userId,
      set: { testSentAt: now },
      setWhere: or(
        isNull(notificationPreferences.testSentAt),
        lt(notificationPreferences.testSentAt, new Date(now.getTime() - TEST_PUSH_INTERVAL_MS))
      ),
    })
    .returning({ userId: notificationPreferences.userId });
  return rows.length > 0;
}

/**
 * Of these Chairs, the ones due a suggestion push, marking them notified. Only Chairs with a
 * preferences row can have suggestions on, so no row means not due.
 */
export async function claimSuggestionSlots(
  db: Database,
  userIds: string[],
  now: Date = new Date()
): Promise<string[]> {
  if (userIds.length === 0) return [];
  const rows = await db
    .update(notificationPreferences)
    .set({ suggestionsNotifiedAt: now })
    .where(
      and(
        inArray(notificationPreferences.userId, userIds),
        or(
          isNull(notificationPreferences.suggestionsNotifiedAt),
          lt(
            notificationPreferences.suggestionsNotifiedAt,
            new Date(now.getTime() - SUGGESTION_PUSH_INTERVAL_MS)
          )
        )
      )
    )
    .returning({ userId: notificationPreferences.userId });
  return rows.map((row) => row.userId);
}

/** Every account with its preferences; selectRecipients keeps the active Chairs. */
export async function loadChairs(db: Database): Promise<ChairCandidate[]> {
  const rows = await db
    .select({
      id: user.id,
      role: user.role,
      banned: user.banned,
      banExpires: user.banExpires,
      preferences: notificationPreferences,
    })
    .from(user)
    .leftJoin(notificationPreferences, eq(notificationPreferences.userId, user.id));
  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    banned: row.banned,
    banExpires: row.banExpires,
    preferences: preferencesOf(row.preferences),
  }));
}

async function countNewSuggestions(db: Database): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(venueSuggestions)
    .where(eq(venueSuggestions.status, 'new'));
  return row?.total ?? 0;
}

/** Pending proposals, today's unconfirmed visit presses and new suggestions, for the badge. */
export async function loadPendingWork(db: Database, now: Date = new Date()): Promise<PendingWork> {
  const [proposals, visits, newSuggestions] = await Promise.all([
    db
      .select({ by: tierProposals.proposedBy })
      .from(tierProposals)
      .where(eq(tierProposals.status, 'pending')),
    db
      .select({ by: inspections.firstAdminId })
      .from(inspections)
      .where(
        and(
          eq(inspections.status, 'pending'),
          eq(inspections.kind, 'verified'),
          eq(inspections.inspectionDate, londonDate(now))
        )
      ),
    countNewSuggestions(db),
  ]);
  return {
    proposalProposers: proposals.map((row) => row.by),
    visitPressers: visits.map((row) => row.by),
    newSuggestions,
  };
}

export async function badgeFor(db: Database, userId: string, now = new Date()): Promise<number> {
  const [work, preferences] = await Promise.all([
    loadPendingWork(db, now),
    getPreferences(db, userId),
  ]);
  return badgeCount(userId, work, preferences);
}

export async function subscriptionsFor(db: Database, userIds: string[]) {
  if (userIds.length === 0) return [];
  return db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, userIds));
}

export async function recordDelivery(
  db: Database,
  subscriptionId: string,
  outcome: 'delivered' | 'gone' | 'failed',
  now: Date = new Date()
): Promise<void> {
  if (outcome === 'gone') {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscriptionId));
  } else if (outcome === 'delivered') {
    await db
      .update(pushSubscriptions)
      .set({ lastSuccessAt: now, failureCount: 0 })
      .where(eq(pushSubscriptions.id, subscriptionId));
  } else {
    await db
      .update(pushSubscriptions)
      .set({ failureCount: sql`${pushSubscriptions.failureCount} + 1` })
      .where(eq(pushSubscriptions.id, subscriptionId));
  }
}
