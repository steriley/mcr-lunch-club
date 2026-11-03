import { asc, eq, inArray } from 'drizzle-orm';
import { venueVisits, visitNotes, type VisitNoteRow } from '@/db/schema';
import type { Database, Tx } from '@/lib/db-client';
import { londonDate } from '@/lib/london-date';
import { recordVenueEvent, type Actor } from '@/lib/venue-events';

/**
 * Field notes: what a Chair wrote about their own visit (src/lib/visits.ts). Only the visit's Chair
 * may add, edit or delete one, at any time and whatever became of the inspection. Every active Chair
 * may read every note. Internal only: no public page, serializer or island may import this module
 * (src/test/public-safety.test.ts), and push payloads never carry a note.
 */

type Executor = Database | Tx;

export interface SerializedNote {
  id: string;
  visitId: string;
  body: string;
  /** ISO timestamps. */
  createdAt: string;
  editedAt: string | null;
  /** Whole London days between the visit and the note being written; 0 on the day. */
  daysAfterVisit: number;
}

export type AddNoteResult =
  | { result: 'added'; note: SerializedNote; venueId: string }
  | { result: 'not_found' }
  | { result: 'not_your_visit' };

export type EditNoteResult =
  | { result: 'edited'; note: SerializedNote }
  | { result: 'not_found' }
  | { result: 'not_your_visit' };

export type DeleteNoteResult =
  { result: 'deleted' } | { result: 'not_found' } | { result: 'not_your_visit' };

const DAY_MS = 86_400_000;

/** Days from the visit's date to the London day of `writtenAt`, never negative. */
export function daysAfterVisit(visitDate: string, writtenAt: Date): number {
  const days = Math.round(
    (Date.parse(`${londonDate(writtenAt)}T00:00:00Z`) - Date.parse(`${visitDate}T00:00:00Z`)) /
      DAY_MS
  );
  return Math.max(0, days);
}

function serializeNote(note: VisitNoteRow, visitDate: string): SerializedNote {
  return {
    id: note.id,
    visitId: note.visitId,
    body: note.body,
    createdAt: note.createdAt.toISOString(),
    editedAt: note.editedAt?.toISOString() ?? null,
    daysAfterVisit: daysAfterVisit(visitDate, note.createdAt),
  };
}

/** A note on the actor's own visit. `body` should already be validated (noteBodySchema); it is trimmed again here. */
export async function addNote(
  db: Database,
  visitId: string,
  actor: Actor,
  body: string,
  now: Date = new Date()
): Promise<AddNoteResult> {
  return db.transaction(async (tx) => {
    const [visit] = await tx
      .select({
        id: venueVisits.id,
        venueId: venueVisits.venueId,
        visitorId: venueVisits.visitorId,
        visitDate: venueVisits.visitDate,
      })
      .from(venueVisits)
      .where(eq(venueVisits.id, visitId))
      .limit(1);
    if (!visit) return { result: 'not_found' };
    if (visit.visitorId !== actor.id) return { result: 'not_your_visit' };
    const [note] = await tx
      .insert(visitNotes)
      .values({ visitId, body: body.trim(), createdAt: now })
      .returning();
    // Ids only: the timeline never shows a note's text.
    await recordVenueEvent(tx, visit.venueId, 'field_note_added', actor, {
      visitId,
      noteId: note.id,
    });
    return { result: 'added', note: serializeNote(note, visit.visitDate), venueId: visit.venueId };
  });
}

async function findOwnNote(db: Executor, noteId: string, actor: Actor) {
  const [found] = await db
    .select({
      note: visitNotes,
      visitorId: venueVisits.visitorId,
      visitDate: venueVisits.visitDate,
    })
    .from(visitNotes)
    .innerJoin(venueVisits, eq(venueVisits.id, visitNotes.visitId))
    .where(eq(visitNotes.id, noteId))
    .limit(1);
  if (!found) return { result: 'not_found' } as const;
  if (found.visitorId !== actor.id) return { result: 'not_your_visit' } as const;
  return { result: 'found', note: found.note, visitDate: found.visitDate } as const;
}

/** Replaces the text of a note on the actor's own visit and stamps `edited_at`. No revision history. */
export async function editNote(
  db: Database,
  noteId: string,
  actor: Actor,
  body: string,
  now: Date = new Date()
): Promise<EditNoteResult> {
  return db.transaction(async (tx) => {
    const found = await findOwnNote(tx, noteId, actor);
    if (found.result !== 'found') return found;
    const [note] = await tx
      .update(visitNotes)
      .set({ body: body.trim(), editedAt: now })
      .where(eq(visitNotes.id, noteId))
      .returning();
    if (!note) return { result: 'not_found' };
    return { result: 'edited', note: serializeNote(note, found.visitDate) };
  });
}

export async function deleteNote(
  db: Database,
  noteId: string,
  actor: Actor
): Promise<DeleteNoteResult> {
  return db.transaction(async (tx) => {
    const found = await findOwnNote(tx, noteId, actor);
    if (found.result !== 'found') return found;
    await tx.delete(visitNotes).where(eq(visitNotes.id, noteId));
    return { result: 'deleted' };
  });
}

/** Every note on these visits, oldest first, keyed by visit id. Readable by any active Chair. */
export async function listNotesForVisits(
  db: Executor,
  visits: { id: string; visitDate: string }[]
): Promise<Map<string, SerializedNote[]>> {
  const byVisit = new Map<string, SerializedNote[]>(visits.map((visit) => [visit.id, []]));
  if (!visits.length) return byVisit;
  const dates = new Map(visits.map((visit) => [visit.id, visit.visitDate]));
  const rows = await db
    .select()
    .from(visitNotes)
    .where(inArray(visitNotes.visitId, [...dates.keys()]))
    .orderBy(asc(visitNotes.createdAt), asc(visitNotes.id));
  for (const row of rows)
    byVisit.get(row.visitId)?.push(serializeNote(row, dates.get(row.visitId)!));
  return byVisit;
}

/** Every note on one venue's visits, whoever wrote them, oldest first. */
export async function listNotesForVenue(
  db: Executor,
  venueId: string
): Promise<(SerializedNote & { visitorName: string | null })[]> {
  const rows = await db
    .select({
      note: visitNotes,
      visitDate: venueVisits.visitDate,
      visitorName: venueVisits.visitorName,
    })
    .from(visitNotes)
    .innerJoin(venueVisits, eq(venueVisits.id, visitNotes.visitId))
    .where(eq(venueVisits.venueId, venueId))
    .orderBy(asc(visitNotes.createdAt), asc(visitNotes.id));
  return rows.map((row) => ({
    ...serializeNote(row.note, row.visitDate),
    visitorName: row.visitorName,
  }));
}
