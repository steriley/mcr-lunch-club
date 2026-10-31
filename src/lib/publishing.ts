import { asc, count, desc, eq, gt, lte, sql } from 'drizzle-orm';
import { user } from '@/db/auth-schema';
import { pendingPublishChanges, publishRequests, publishState, venues } from '@/db/schema';
import type { Database } from '@/lib/db-client';
import { requestRebuild } from '@/lib/rebuild';

/**
 * Batch publishing (#100). The public pages are prerendered, so a Chair's edit
 * reaches them only when a production build runs. Publishing admin actions
 * record a pending change; any production build (the Publish button, a cron,
 * a git push) clears the ones saved before it started (`settlePublish`). The
 * Deploy Hook's HTTP response never decides whether a change is live.
 */

export type PublishSource = 'chair' | 'auto' | 'nightly' | 'bulletin';

/** How long a Chair's Publish waits for the Deploy Hook. They asked for it, so waiting is fine. */
const PUBLISH_HOOK_TIMEOUT_MS = 15_000;
/** A request accepted this recently, with nothing recorded since, is not repeated. */
const PUBLISH_DEBOUNCE_MS = 60_000;
/** After this long without a build clearing the changes, the publish counts as unconfirmed. */
const PUBLISH_CONFIRM_WINDOW_MS = 5 * 60_000;

export interface PendingChange {
  id: string;
  action: string;
  venueId: string | null;
  venueName: string | null;
  actorName: string | null;
  createdAt: string;
}

type PublishBarState = 'idle' | 'pending' | 'publishing' | 'unconfirmed';

export interface PublishStatus {
  state: PublishBarState;
  /** All pending changes. */
  count: number;
  /** While publishing: how many of them the requested build covers. */
  publishing: number;
  /** While publishing: changes recorded after the request, which that build may not include. */
  newSince: number;
  /** When the publish in flight (or the unconfirmed one) was requested. */
  requestedAt: string | null;
  changes: PendingChange[];
}

export async function recordPendingChange(
  db: Database,
  change: { action: string; venueId?: string | null; actorId: string }
): Promise<void> {
  await db.insert(pendingPublishChanges).values({
    action: change.action,
    venueId: change.venueId ?? null,
    actorId: change.actorId,
  });
}

export async function countPendingChanges(db: Database): Promise<number> {
  const [row] = await db.select({ total: count() }).from(pendingPublishChanges);
  return row?.total ?? 0;
}

export async function recordPublishRequest(
  db: Database,
  request: { source: PublishSource; requestedBy: string | null; accepted: boolean }
): Promise<void> {
  await db.insert(publishRequests).values(request);
}

/**
 * Asks Vercel for a build and records the request. Returns whether the hook
 * accepted it. Never throws on a failed hook; the request is recorded either way.
 */
export async function publishNow(
  db: Database,
  {
    source,
    requestedBy,
    reason,
  }: { source: PublishSource; requestedBy: string | null; reason: string }
): Promise<boolean> {
  const result = await requestRebuild(reason, { timeoutMs: PUBLISH_HOOK_TIMEOUT_MS });
  const accepted = result === 'accepted';
  try {
    await recordPublishRequest(db, { source, requestedBy, accepted });
  } catch (error) {
    console.error(
      'Could not record the publish request:',
      error instanceof Error ? error.message : error
    );
  }
  return accepted;
}

/** Pure: what the bar shows, from the pending changes and the latest publish request. */
export function derivePublishStatus(input: {
  changes: PendingChange[];
  latestRequest: { requestedAt: Date; accepted: boolean } | null;
  lastPublishedAt: Date | null;
  now: Date;
}): PublishStatus {
  const { changes, latestRequest, lastPublishedAt, now } = input;
  const base = { count: changes.length, publishing: 0, newSince: 0, requestedAt: null, changes };
  if (changes.length === 0) return { ...base, state: 'idle' };

  // A request from before the last settled build was answered by that build.
  const open =
    latestRequest && (!lastPublishedAt || latestRequest.requestedAt > lastPublishedAt)
      ? latestRequest
      : null;
  if (!open) return { ...base, state: 'pending' };

  const newSince = changes.filter((change) => new Date(change.createdAt) > open.requestedAt).length;
  const requestedAt = open.requestedAt.toISOString();
  const age = now.getTime() - open.requestedAt.getTime();

  if (open.accepted && age < PUBLISH_CONFIRM_WINDOW_MS && newSince < changes.length) {
    return {
      ...base,
      state: 'publishing',
      publishing: changes.length - newSince,
      newSince,
      requestedAt,
    };
  }
  // Changes recorded after a failed or stale request are an ordinary new batch.
  if (newSince === changes.length) return { ...base, state: 'pending' };
  return { ...base, state: 'unconfirmed', requestedAt };
}

export async function getPublishStatus(db: Database, now = new Date()): Promise<PublishStatus> {
  const rows = await db
    .select({
      id: pendingPublishChanges.id,
      action: pendingPublishChanges.action,
      venueId: pendingPublishChanges.venueId,
      venueName: venues.name,
      actorName: user.name,
      createdAt: pendingPublishChanges.createdAt,
    })
    .from(pendingPublishChanges)
    .leftJoin(venues, eq(pendingPublishChanges.venueId, venues.id))
    .leftJoin(user, eq(pendingPublishChanges.actorId, user.id))
    .orderBy(asc(pendingPublishChanges.createdAt));

  const [latestRequest] = await db
    .select({ requestedAt: publishRequests.requestedAt, accepted: publishRequests.accepted })
    .from(publishRequests)
    .orderBy(desc(publishRequests.requestedAt))
    .limit(1);
  const [state] = await db.select().from(publishState).where(eq(publishState.id, 1));

  return derivePublishStatus({
    changes: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    latestRequest: latestRequest ?? null,
    lastPublishedAt: state?.lastPublishedAt ?? null,
    now,
  });
}

/**
 * True when a request the hook accepted under a minute ago is still the
 * newest word and no change has been recorded since: a second click would only
 * queue another build of the same state.
 */
export async function isAlreadyPublishing(db: Database, now = new Date()): Promise<boolean> {
  const [latest] = await db
    .select({ requestedAt: publishRequests.requestedAt, accepted: publishRequests.accepted })
    .from(publishRequests)
    .orderBy(desc(publishRequests.requestedAt))
    .limit(1);
  if (!latest?.accepted) return false;
  if (now.getTime() - latest.requestedAt.getTime() >= PUBLISH_DEBOUNCE_MS) return false;
  const [since] = await db
    .select({ total: count() })
    .from(pendingPublishChanges)
    .where(gt(pendingPublishChanges.createdAt, latest.requestedAt));
  return (since?.total ?? 0) === 0;
}

/** Only a production Vercel build marks and settles, like decideDeployMigration. */
export function isProductionBuild(env: Record<string, string | undefined>): boolean {
  return env.VERCEL_ENV === 'production';
}

/**
 * The database's own clock, as an ISO string with microseconds, taken at the
 * start of a build. Changes are stamped by the database too, so the cut and
 * the changes can be compared without the build machine's clock or the
 * rounding of a JS Date.
 */
export async function databaseNow(db: Database): Promise<string> {
  const result = await db.execute(
    sql`select to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as now`
  );
  return String((result.rows[0] as { now: string }).now);
}

/**
 * A production build that started at `cut` is done: every change saved up to
 * then was in it. Later ones were not, so they stay pending.
 */
export async function settlePublish(db: Database, cut: string): Promise<number> {
  return db.transaction(async (tx) => {
    const cutAt = sql`${cut}::timestamptz`;
    const removed = await tx
      .delete(pendingPublishChanges)
      .where(lte(pendingPublishChanges.createdAt, cutAt))
      .returning({ id: pendingPublishChanges.id });
    await tx
      .insert(publishState)
      .values({ id: 1, lastPublishedAt: sql`${cut}::timestamptz` })
      .onConflictDoUpdate({
        target: publishState.id,
        set: { lastPublishedAt: sql`${cut}::timestamptz` },
      });
    return removed.length;
  });
}
