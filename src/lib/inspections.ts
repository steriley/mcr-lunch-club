import { and, desc, eq, lt, max, sql } from 'drizzle-orm';
import { inspections, venues, type InspectionRow, type VenueVisitRow } from '@/db/schema';
import { isUniqueViolation } from '@/lib/db-errors';
import type { Database, Tx } from '@/lib/db-client';
import { INSPECTION_OUTCOME_LABELS } from '@/lib/inspection-display';
import { londonDate } from '@/lib/london-date';
import { fail, ok, type Outcome } from '@/lib/outcome';
import { actorName, type Actor } from '@/lib/venue-events';
import { ensureVisit } from '@/lib/visits';
import type { InspectionOutcome } from '@/types';

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
 *
 * The first press also sets the outcome (satisfactory or below par); the
 * cosigner affirms that outcome and cannot choose a different one.
 *
 * Every accepted press also records the presser's visit for the day (src/lib/visits.ts) in the
 * same transaction, linked to the inspection it started or confirmed. A refused press records none.
 */

type Executor = Database | Tx;

/** What a successful "Visited today" press did. */
export type VisitResult =
  /**
   * `startedNow`: this press started it (a repeat press by the same Chair changes nothing).
   * `visit`: the presser's visit for today (src/lib/visits.ts), created or linked by this press.
   */
  | { result: 'waiting'; inspection: InspectionRow; startedNow: boolean; visit: VenueVisitRow }
  | { result: 'confirmed'; inspection: InspectionRow; confirmedNow: boolean; visit: VenueVisitRow };

type VisitError =
  | 'venue_not_found'
  /** A first press must say how the inspection went. */
  | 'outcome_required'
  /** The cosigner named a different outcome from the one the first Chair set. */
  | 'outcome_mismatch';

export type VisitOutcome = Outcome<VisitResult, VisitError>;

/** Re-derives venues.last_inspection_date from confirmed inspections (verified or legacy). */
export async function refreshLastInspectionDate(
  db: Executor,
  venueId: string
): Promise<string | null> {
  const [latest] = await db
    .select({ date: max(inspections.inspectionDate) })
    .from(inspections)
    .where(and(eq(inspections.venueId, venueId), eq(inspections.status, 'confirmed')));
  const date = latest?.date ?? null;
  await db.update(venues).set({ lastInspectionDate: date }).where(eq(venues.id, venueId));
  return date;
}

/** An accepted press: it adds a visit (and perhaps an inspection) the public pages may show. */
const visited = (venueId: string, value: VisitResult): VisitOutcome =>
  ok(value, { action: 'Record visit', venueId, when: 'queue' });

async function visitOnce(
  db: Database,
  venueId: string,
  actor: Actor,
  outcome: InspectionOutcome | undefined,
  today: string,
  now: Date
): Promise<VisitOutcome> {
  return db.transaction(async (tx) => {
    // Serialise presses for this venue.
    const locked = await tx.execute(
      sql`select ${venues.id} from ${venues} where ${venues.id} = ${venueId} for update`
    );
    if (!locked.rows.length) return fail('venue_not_found');

    // Lazy lapse: an unconfirmed press from an earlier London day no longer counts.
    await tx
      .update(inspections)
      .set({ status: 'lapsed' })
      .where(
        and(
          eq(inspections.venueId, venueId),
          eq(inspections.status, 'pending'),
          lt(inspections.inspectionDate, today)
        )
      );

    const [confirmedToday] = await tx
      .select()
      .from(inspections)
      .where(
        and(
          eq(inspections.venueId, venueId),
          eq(inspections.status, 'confirmed'),
          eq(inspections.kind, 'verified'),
          eq(inspections.inspectionDate, today)
        )
      )
      .limit(1);
    if (confirmedToday) {
      // A third Chair's press on an already confirmed day is still their visit, but not part of it.
      const verifier =
        confirmedToday.firstAdminId === actor.id || confirmedToday.secondAdminId === actor.id;
      const visit = await ensureVisit(
        tx,
        venueId,
        actor,
        today,
        verifier ? confirmedToday.id : null,
        now
      );
      return visited(venueId, {
        result: 'confirmed',
        inspection: confirmedToday,
        confirmedNow: false,
        visit,
      });
    }

    const [pending] = await tx
      .select()
      .from(inspections)
      .where(and(eq(inspections.venueId, venueId), eq(inspections.status, 'pending')))
      .limit(1);

    if (!pending) {
      if (!outcome) return fail('outcome_required');
      const [created] = await tx
        .insert(inspections)
        .values({
          venueId,
          inspectionDate: today,
          status: 'pending',
          kind: 'verified',
          outcome,
          firstAdminId: actor.id,
          firstAdminName: actorName(actor),
          createdAt: now,
        })
        .returning();
      const visit = await ensureVisit(tx, venueId, actor, today, created.id, now);
      return visited(venueId, { result: 'waiting', inspection: created, startedNow: true, visit });
    }

    // The same admin pressing again changes nothing: one person can never confirm their own visit.
    if (pending.firstAdminId === actor.id) {
      const visit = await ensureVisit(tx, venueId, actor, today, pending.id, now);
      return visited(venueId, { result: 'waiting', inspection: pending, startedNow: false, visit });
    }
    if (outcome && outcome !== pending.outcome) return fail('outcome_mismatch');

    const [confirmed] = await tx
      .update(inspections)
      .set({
        status: 'confirmed',
        secondAdminId: actor.id,
        secondAdminName: actorName(actor),
        confirmedAt: now,
      })
      .where(and(eq(inspections.id, pending.id), eq(inspections.status, 'pending')))
      .returning();
    await refreshLastInspectionDate(tx, venueId);
    const visit = await ensureVisit(tx, venueId, actor, today, confirmed.id, now);
    return visited(venueId, {
      result: 'confirmed',
      inspection: confirmed,
      confirmedNow: true,
      visit,
    });
  });
}

/**
 * "Visited today" for `actor`. `outcome` is required to start an inspection; a cosigner may omit it
 * (they affirm the first Chair's) or repeat the same one. `now` is injectable for tests; production
 * uses the server clock.
 */
export async function recordVisit(
  db: Database,
  venueId: string,
  actor: Actor,
  outcome?: InspectionOutcome,
  now: Date = new Date()
): Promise<VisitOutcome> {
  const today = londonDate(now);
  try {
    return await visitOnce(db, venueId, actor, outcome, today, now);
  } catch (error) {
    // Backstop: the row lock already serialises presses, but if two ever both try to start a pending
    // inspection the partial unique index rejects one. Retrying sees the other's row and confirms it.
    if (isUniqueViolation(error)) return visitOnce(db, venueId, actor, outcome, today, now);
    throw error;
  }
}

export interface VisitStatus {
  today: string;
  /** Someone pressed today and it still needs a second admin. Times are ISO timestamps. */
  pending: {
    firstAdminName: string;
    byMe: boolean;
    firstAt: string;
    outcome: InspectionOutcome | null;
  } | null;
  /** Today's verified inspection, once confirmed. */
  confirmed: {
    firstAdminName: string;
    secondAdminName: string;
    firstAt: string;
    confirmedAt: string | null;
    outcome: InspectionOutcome | null;
  } | null;
}

function pendingView(row: InspectionRow, userId: string): NonNullable<VisitStatus['pending']> {
  return {
    firstAdminName: row.firstAdminName ?? 'Another admin',
    byMe: row.firstAdminId === userId,
    firstAt: row.createdAt.toISOString(),
    outcome: row.outcome,
  };
}

/** What the "Visited today" control shows. Read-only: an earlier day's pending press shows as nothing. */
export async function getVisitStatus(
  db: Database,
  venueId: string,
  userId: string,
  now: Date = new Date()
): Promise<VisitStatus> {
  const today = londonDate(now);
  const rows = await db
    .select()
    .from(inspections)
    .where(
      and(
        eq(inspections.venueId, venueId),
        eq(inspections.inspectionDate, today),
        eq(inspections.kind, 'verified')
      )
    );
  const confirmed = rows.find((row) => row.status === 'confirmed');
  const pending = rows.find((row) => row.status === 'pending');
  return {
    today,
    pending: pending && !confirmed ? pendingView(pending, userId) : null,
    confirmed: confirmed
      ? {
          firstAdminName: confirmed.firstAdminName ?? 'A former admin',
          secondAdminName: confirmed.secondAdminName ?? 'a former admin',
          firstAt: confirmed.createdAt.toISOString(),
          confirmedAt: confirmed.confirmedAt?.toISOString() ?? null,
          outcome: confirmed.outcome,
        }
      : null,
  };
}

export interface PendingInspection {
  inspectionId: string;
  venueId: string;
  venueName: string;
  /** The same shape the venue page's concord card uses, so both pages draw it the same way. */
  status: VisitStatus;
}

/**
 * Today's inspections still waiting for a second Chair, across every venue, oldest first: the
 * Pending page lists them beside the verdict motions. Read-only: a press from an earlier day has
 * lapsed and is left out, as getVisitStatus leaves it out.
 */
export async function listPendingInspections(
  db: Database,
  userId: string,
  now: Date = new Date()
): Promise<PendingInspection[]> {
  const today = londonDate(now);
  const rows = await db
    .select({ inspection: inspections, venueName: venues.name })
    .from(inspections)
    .innerJoin(venues, eq(venues.id, inspections.venueId))
    .where(
      and(
        eq(inspections.status, 'pending'),
        eq(inspections.kind, 'verified'),
        eq(inspections.inspectionDate, today)
      )
    )
    .orderBy(inspections.createdAt);
  return rows.map(({ inspection, venueName }) => ({
    inspectionId: inspection.id,
    venueId: inspection.venueId,
    venueName,
    status: { today, pending: pendingView(inspection, userId), confirmed: null },
  }));
}

export async function listConfirmedInspections(
  db: Database,
  venueId: string
): Promise<InspectionRow[]> {
  return db
    .select()
    .from(inspections)
    .where(and(eq(inspections.venueId, venueId), eq(inspections.status, 'confirmed')))
    .orderBy(desc(inspections.inspectionDate), desc(inspections.confirmedAt));
}

/** The latest dual-verified inspection, or null. Legacy rows never count. */
export async function latestVerifiedInspection(
  db: Executor,
  venueId: string
): Promise<InspectionRow | null> {
  const [row] = await db
    .select()
    .from(inspections)
    .where(
      and(
        eq(inspections.venueId, venueId),
        eq(inspections.status, 'confirmed'),
        eq(inspections.kind, 'verified')
      )
    )
    .orderBy(desc(inspections.inspectionDate))
    .limit(1);
  return row ?? null;
}

/** "Verified by A and B, below par" or "Legacy record (imported from the Chairs' records)". */
export function describeInspection(
  row: Pick<
    InspectionRow,
    'kind' | 'outcome' | 'firstAdminName' | 'secondAdminName' | 'inspectionDate'
  >
): string {
  if (row.kind === 'legacy') return "Legacy record (imported from the Chairs' records)";
  const witnesses = `Verified by ${row.firstAdminName ?? 'a former admin'} and ${row.secondAdminName ?? 'a former admin'}`;
  return row.outcome
    ? `${witnesses}, ${INSPECTION_OUTCOME_LABELS[row.outcome].toLowerCase()}`
    : witnesses;
}
