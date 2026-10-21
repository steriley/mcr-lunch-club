import { and, desc, eq, lt, max, sql } from 'drizzle-orm';
import { inspections, venues, type InspectionRow } from '@/db/schema';
import { isUniqueViolation } from '@/lib/admin-api';
import type { Database } from '@/lib/db-client';
import { londonDate } from '@/lib/london-date';
import { actorName, type Actor } from '@/lib/venue-events';

/**
 * Dual-verified inspections ("Visited today").
 *
 * An inspection counts only when two different admins press "Visited today"
 * on the same Europe/London calendar day, judged by the server clock. The
 * first press creates a pending inspection; the second, by someone else,
 * confirms it. A pending inspection from an earlier day has lapsed: lapsing
 * is applied lazily on the next press (no cron). The venue row is locked for
 * the duration, and a partial unique index allows only one pending
 * inspection per venue, so near-simultaneous presses cannot double up.
 */

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
type Executor = Database | Tx;

export type VisitOutcome =
  | { result: 'waiting'; inspection: InspectionRow }
  | { result: 'confirmed'; inspection: InspectionRow; confirmedNow: boolean }
  | { result: 'not_found' };

/** Re-derives venues.last_inspection_date from confirmed inspections (verified or legacy). */
export async function refreshLastInspectionDate(db: Executor, venueId: string): Promise<string | null> {
  const [latest] = await db
    .select({ date: max(inspections.inspectionDate) })
    .from(inspections)
    .where(and(eq(inspections.venueId, venueId), eq(inspections.status, 'confirmed')));
  const date = latest?.date ?? null;
  await db.update(venues).set({ lastInspectionDate: date }).where(eq(venues.id, venueId));
  return date;
}

async function visitOnce(db: Database, venueId: string, actor: Actor, today: string, now: Date): Promise<VisitOutcome> {
  return db.transaction(async (tx) => {
    // Serialise presses for this venue.
    const locked = await tx.execute(sql`select ${venues.id} from ${venues} where ${venues.id} = ${venueId} for update`);
    if (!locked.rows.length) return { result: 'not_found' };

    // Lazy lapse: an unconfirmed press from an earlier London day no longer counts.
    await tx
      .update(inspections)
      .set({ status: 'lapsed' })
      .where(and(eq(inspections.venueId, venueId), eq(inspections.status, 'pending'), lt(inspections.inspectionDate, today)));

    const [confirmedToday] = await tx
      .select()
      .from(inspections)
      .where(
        and(eq(inspections.venueId, venueId), eq(inspections.status, 'confirmed'), eq(inspections.kind, 'verified'), eq(inspections.inspectionDate, today))
      )
      .limit(1);
    if (confirmedToday) return { result: 'confirmed', inspection: confirmedToday, confirmedNow: false };

    const [pending] = await tx
      .select()
      .from(inspections)
      .where(and(eq(inspections.venueId, venueId), eq(inspections.status, 'pending')))
      .limit(1);

    if (!pending) {
      const [created] = await tx
        .insert(inspections)
        .values({ venueId, inspectionDate: today, status: 'pending', kind: 'verified', firstAdminId: actor.id, firstAdminName: actorName(actor), createdAt: now })
        .returning();
      return { result: 'waiting', inspection: created };
    }

    // The same admin pressing again changes nothing: one person can never confirm their own visit.
    if (pending.firstAdminId === actor.id) return { result: 'waiting', inspection: pending };

    const [confirmed] = await tx
      .update(inspections)
      .set({ status: 'confirmed', secondAdminId: actor.id, secondAdminName: actorName(actor), confirmedAt: now })
      .where(and(eq(inspections.id, pending.id), eq(inspections.status, 'pending')))
      .returning();
    await refreshLastInspectionDate(tx, venueId);
    return { result: 'confirmed', inspection: confirmed, confirmedNow: true };
  });
}

/** "Visited today" for `actor`. `now` is injectable for tests; production uses the server clock. */
export async function recordVisit(db: Database, venueId: string, actor: Actor, now: Date = new Date()): Promise<VisitOutcome> {
  const today = londonDate(now);
  try {
    return await visitOnce(db, venueId, actor, today, now);
  } catch (error) {
    // Backstop: the row lock already serialises presses, but if two ever both try to start a pending
    // inspection the partial unique index rejects one. Retrying sees the other's row and confirms it.
    if (isUniqueViolation(error)) return visitOnce(db, venueId, actor, today, now);
    throw error;
  }
}

export interface VisitStatus {
  today: string;
  /** Someone pressed today and it still needs a second admin. Times are ISO timestamps. */
  pending: { firstAdminName: string; byMe: boolean; firstAt: string } | null;
  /** Today's verified inspection, once confirmed. */
  confirmed: { firstAdminName: string; secondAdminName: string; firstAt: string; confirmedAt: string | null } | null;
}

/** What the "Visited today" control shows. Read-only: an earlier day's pending press shows as nothing. */
export async function getVisitStatus(db: Database, venueId: string, userId: string, now: Date = new Date()): Promise<VisitStatus> {
  const today = londonDate(now);
  const rows = await db
    .select()
    .from(inspections)
    .where(and(eq(inspections.venueId, venueId), eq(inspections.inspectionDate, today), eq(inspections.kind, 'verified')));
  const confirmed = rows.find((row) => row.status === 'confirmed');
  const pending = rows.find((row) => row.status === 'pending');
  return {
    today,
    pending:
      pending && !confirmed
        ? { firstAdminName: pending.firstAdminName ?? 'Another admin', byMe: pending.firstAdminId === userId, firstAt: pending.createdAt.toISOString() }
        : null,
    confirmed: confirmed
      ? {
          firstAdminName: confirmed.firstAdminName ?? 'A former admin',
          secondAdminName: confirmed.secondAdminName ?? 'a former admin',
          firstAt: confirmed.createdAt.toISOString(),
          confirmedAt: confirmed.confirmedAt?.toISOString() ?? null,
        }
      : null,
  };
}

export async function listConfirmedInspections(db: Database, venueId: string): Promise<InspectionRow[]> {
  return db
    .select()
    .from(inspections)
    .where(and(eq(inspections.venueId, venueId), eq(inspections.status, 'confirmed')))
    .orderBy(desc(inspections.inspectionDate), desc(inspections.confirmedAt));
}

/** The latest dual-verified inspection, or null. Legacy rows never count. */
export async function latestVerifiedInspection(db: Executor, venueId: string): Promise<InspectionRow | null> {
  const [row] = await db
    .select()
    .from(inspections)
    .where(and(eq(inspections.venueId, venueId), eq(inspections.status, 'confirmed'), eq(inspections.kind, 'verified')))
    .orderBy(desc(inspections.inspectionDate))
    .limit(1);
  return row ?? null;
}

/** "Verified by A and B" or "Legacy record (imported from the Chairs' records)". */
export function describeInspection(row: Pick<InspectionRow, 'kind' | 'firstAdminName' | 'secondAdminName' | 'inspectionDate'>): string {
  if (row.kind === 'legacy') return "Legacy record (imported from the Chairs' records)";
  return `Verified by ${row.firstAdminName ?? 'a former admin'} and ${row.secondAdminName ?? 'a former admin'}`;
}
