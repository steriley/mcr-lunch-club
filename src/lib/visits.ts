import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import {
  inspections,
  venueVisits,
  venues,
  type InspectionRow,
  type VenueVisitRow,
} from '@/db/schema';
import type { Database, Tx } from '@/lib/db-client';
import { listNotesForVisits, type SerializedNote } from '@/lib/field-notes';
import { visitStatusLabel } from '@/lib/inspection-display';
import { londonDate } from '@/lib/london-date';
import { actorName, recordVenueEvent, type Actor } from '@/lib/venue-events';

/**
 * Visits: one Chair at one venue on one Europe/London day. "Visited today" creates or links the
 * presser's visit inside its own transaction (src/lib/inspections.ts); "Log a visit" records one
 * with no inspection, which never starts, confirms or counts towards one, never touches
 * `last_inspection_date` and never moves a tier. Any number of visits per venue; one per Chair per
 * day. Internal only: no public page, serializer or island may import this module
 * (src/test/public-safety.test.ts).
 */

type Executor = Database | Tx;

type InspectionState = Pick<InspectionRow, 'status' | 'outcome'>;

export interface SerializedVisit {
  id: string;
  venueId: string;
  /** YYYY-MM-DD, London day. */
  visitDate: string;
  visitorId: string | null;
  visitorName: string | null;
  createdAt: string;
  inspectionId: string | null;
  /** "Pending", "Confirmed: below par", "Unconfirmed" or "Visit only". */
  statusLabel: string;
  notes: SerializedNote[];
}

export type LogVisitResult =
  | { result: 'logged'; visit: SerializedVisit }
  /** This Chair already has a visit on that day; add another note to it instead. */
  | { result: 'already_logged'; visit: SerializedVisit }
  | { result: 'future_date' }
  | { result: 'not_found' };

export function serializeVisit(
  visit: VenueVisitRow,
  inspection: InspectionState | null,
  notes: SerializedNote[] = []
): SerializedVisit {
  return {
    id: visit.id,
    venueId: visit.venueId,
    visitDate: visit.visitDate,
    visitorId: visit.visitorId,
    visitorName: visit.visitorName,
    createdAt: visit.createdAt.toISOString(),
    inspectionId: visit.inspectionId,
    statusLabel: visitStatusLabel(visit.inspectionId ? inspection : null),
    notes,
  };
}

/**
 * The actor's visit to `venueId` on `visitDate`: inserted, or (if they already have one that day)
 * linked to `inspectionId` when it has none yet. Repeating it changes nothing. Run it inside the
 * caller's transaction so a press and its visit commit together.
 */
export async function ensureVisit(
  tx: Executor,
  venueId: string,
  actor: Actor,
  visitDate: string,
  inspectionId: string | null = null,
  now: Date = new Date()
): Promise<VenueVisitRow> {
  const [visit] = await tx
    .insert(venueVisits)
    .values({
      venueId,
      visitDate,
      inspectionId,
      visitorId: actor.id,
      visitorName: actorName(actor),
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: [venueVisits.venueId, venueVisits.visitorId, venueVisits.visitDate],
      targetWhere: sql`${venueVisits.visitorId} is not null`,
      // Keep a link that is already there; otherwise take this one (which may still be null).
      set: { inspectionId: sql`coalesce(${venueVisits.inspectionId}, excluded.inspection_id)` },
    })
    .returning();
  return visit;
}

async function loadVisits(db: Executor, where: SQL | undefined): Promise<SerializedVisit[]> {
  const rows = await db
    .select({ visit: venueVisits, status: inspections.status, outcome: inspections.outcome })
    .from(venueVisits)
    .leftJoin(inspections, eq(inspections.id, venueVisits.inspectionId))
    .where(where)
    .orderBy(desc(venueVisits.visitDate), desc(venueVisits.createdAt));
  const notes = await listNotesForVisits(
    db,
    rows.map(({ visit }) => visit)
  );
  return rows.map(({ visit, status, outcome }) =>
    serializeVisit(visit, status ? { status, outcome } : null, notes.get(visit.id) ?? [])
  );
}

/** Every visit to a venue, newest first, by every Chair, each with all its notes (oldest first). */
export function listVisitsForVenue(db: Executor, venueId: string): Promise<SerializedVisit[]> {
  return loadVisits(db, eq(venueVisits.venueId, venueId));
}

/** The visits that made up these inspections, with their notes, keyed by inspection id. */
export async function listVisitsForInspections(
  db: Executor,
  inspectionIds: string[]
): Promise<Map<string, SerializedVisit[]>> {
  const byInspection = new Map<string, SerializedVisit[]>();
  const ids = [...new Set(inspectionIds)];
  if (!ids.length) return byInspection;
  for (const visit of await loadVisits(db, inArray(venueVisits.inspectionId, ids))) {
    const list = byInspection.get(visit.inspectionId!) ?? [];
    list.push(visit);
    byInspection.set(visit.inspectionId!, list);
  }
  return byInspection;
}

/**
 * "Log a visit": the actor visited `venueId` on `visitDate` (today or earlier, London clock). The
 * visit has no inspection. `now` is injectable for tests.
 */
export async function logVisit(
  db: Database,
  venueId: string,
  actor: Actor,
  visitDate: string,
  now: Date = new Date()
): Promise<LogVisitResult> {
  if (visitDate > londonDate(now)) return { result: 'future_date' };
  return db.transaction(async (tx) => {
    const [venue] = await tx
      .select({ id: venues.id })
      .from(venues)
      .where(eq(venues.id, venueId))
      .limit(1);
    if (!venue) return { result: 'not_found' };

    const [created] = await tx
      .insert(venueVisits)
      .values({
        venueId,
        visitDate,
        visitorId: actor.id,
        visitorName: actorName(actor),
        createdAt: now,
      })
      .onConflictDoNothing({
        target: [venueVisits.venueId, venueVisits.visitorId, venueVisits.visitDate],
        where: sql`${venueVisits.visitorId} is not null`,
      })
      .returning();
    if (!created) {
      const [existing] = await loadVisits(
        tx,
        and(
          eq(venueVisits.venueId, venueId),
          eq(venueVisits.visitorId, actor.id),
          eq(venueVisits.visitDate, visitDate)
        )
      );
      return { result: 'already_logged', visit: existing };
    }
    await recordVenueEvent(tx, venueId, 'visit_logged', actor, {
      visitId: created.id,
      visitDate,
    });
    return { result: 'logged', visit: serializeVisit(created, null) };
  });
}
