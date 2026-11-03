import '../setup-env';
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { eq, sql } from 'drizzle-orm';
import { user } from '@/db/auth-schema';
import { inspections, venueEvents, venueVisits, venues, visitNotes } from '@/db/schema';
import { db as appDb } from '@/lib/db';
import { addNote, deleteNote, editNote, listNotesForVenue } from '@/lib/field-notes';
import { recordVisit } from '@/lib/inspections';
import { getPublicInspections, getPublicVenue, getPublicVenues } from '@/lib/public-data';
import { ensureVisit, listVisitsForInspections, listVisitsForVenue, logVisit } from '@/lib/visits';
import { loadVenueTimeline } from '@/lib/venue-history';
import {
  closeTestDb,
  createAdmin,
  createVenue,
  resetTestDb,
  skipIntegration,
  testDb,
  violates,
  type TestAdmin,
} from './db';

describe('visits and field notes (database)', { skip: skipIntegration }, () => {
  let sam: TestAdmin;
  let alex: TestAdmin;
  let jo: TestAdmin;
  let venueId: string;

  // Noon in London on 21 Oct 2026 (BST), and later days.
  const day1 = new Date('2026-10-21T11:00:00Z');
  const day1Later = new Date('2026-10-21T15:00:00Z');
  const day2 = new Date('2026-10-22T11:00:00Z');
  const day9 = new Date('2026-10-29T11:00:00Z');
  const day20 = new Date('2026-11-09T12:00:00Z');

  beforeEach(async () => {
    await resetTestDb();
    sam = await createAdmin('sam', 'Sam');
    alex = await createAdmin('alex', 'Alex');
    jo = await createAdmin('jo', 'Jo');
    venueId = await createVenue('Chip Shop', { tier: 'approved' });
  });

  after(closeTestDb);

  const visits = async () =>
    (await testDb())
      .select()
      .from(venueVisits)
      .where(eq(venueVisits.venueId, venueId))
      .orderBy(venueVisits.visitDate, venueVisits.createdAt);
  const venueRow = async () =>
    (await (await testDb()).select().from(venues).where(eq(venues.id, venueId)))[0];

  describe('Visited today', () => {
    it("a press creates the presser's visit linked to the inspection; the cosigner's creates the second; repeats create nothing", async () => {
      const db = await testDb();
      const first = await recordVisit(db, venueId, sam, 'satisfactory', day1);
      assert.equal(first.result, 'waiting');
      let rows = await visits();
      assert.equal(rows.length, 1);
      assert.equal(first.result === 'waiting' && first.visit.id, rows[0].id);
      assert.deepEqual(
        { visitor: rows[0].visitorId, name: rows[0].visitorName, date: rows[0].visitDate },
        { visitor: 'sam', name: 'Sam', date: '2026-10-21' }
      );
      assert.equal(first.result === 'waiting' && rows[0].inspectionId, first.inspection.id);

      await recordVisit(db, venueId, sam, 'satisfactory', day1Later);
      assert.equal((await visits()).length, 1, 'a repeat press adds no visit');

      const second = await recordVisit(db, venueId, alex, undefined, day1Later);
      assert.equal(second.result, 'confirmed');
      rows = await visits();
      assert.equal(rows.length, 2);
      assert.ok(rows.every((row) => row.inspectionId === second.inspection?.id));
      assert.deepEqual(rows.map((row) => row.visitorId).sort(), ['alex', 'sam']);

      await recordVisit(db, venueId, alex, undefined, day1Later);
      await recordVisit(db, venueId, sam, undefined, day1Later);
      assert.equal((await visits()).length, 2);
    });

    it('a refused press records no visit', async () => {
      const db = await testDb();
      assert.equal(
        (await recordVisit(db, venueId, sam, undefined, day1)).result,
        'outcome_required'
      );
      await recordVisit(db, venueId, sam, 'satisfactory', day1);
      const refused = await recordVisit(db, venueId, alex, 'below_par', day1);
      assert.equal(refused.result, 'outcome_mismatch');
      assert.deepEqual(
        (await visits()).map((row) => row.visitorId),
        ['sam']
      );
    });

    it('a standalone visit logged earlier the same day is linked, not duplicated', async () => {
      const db = await testDb();
      const logged = await logVisit(db, venueId, sam, '2026-10-21', day1);
      assert.equal(logged.result, 'logged');
      const pressed = await recordVisit(db, venueId, sam, 'below_par', day1Later);
      const rows = await visits();
      assert.equal(rows.length, 1);
      assert.equal(logged.result === 'logged' && rows[0].id, logged.visit.id);
      assert.equal(rows[0].inspectionId, pressed.result === 'waiting' && pressed.inspection.id);
    });

    it("a third Chair's press on a confirmed day is their own visit, not part of the inspection", async () => {
      const db = await testDb();
      await recordVisit(db, venueId, sam, 'satisfactory', day1);
      const confirmed = await recordVisit(db, venueId, alex, undefined, day1);
      await recordVisit(db, venueId, jo, undefined, day1Later);
      const rows = await visits();
      assert.equal(rows.length, 3);
      assert.equal(rows.find((row) => row.visitorId === 'jo')!.inspectionId, null);
      const linked = await listVisitsForInspections(db, [
        confirmed.result === 'confirmed' ? confirmed.inspection.id : '',
      ]);
      assert.deepEqual([...linked.values()][0].map((visit) => visit.visitorName).sort(), [
        'Alex',
        'Sam',
      ]);
    });
  });

  describe('Log a visit', () => {
    it('records third and later visits, with and without a new inspection, and never touches inspections or tiers', async () => {
      const db = await testDb();
      await recordVisit(db, venueId, sam, 'satisfactory', day1);
      await recordVisit(db, venueId, alex, undefined, day1);
      const before = await venueRow();
      assert.equal(before.lastInspectionDate, '2026-10-21');
      const inspectionsBefore = await db.select().from(inspections);

      // A third visit each, standalone.
      assert.equal((await logVisit(db, venueId, sam, '2026-10-22', day9)).result, 'logged');
      assert.equal((await logVisit(db, venueId, alex, '2026-10-29', day9)).result, 'logged');
      const after = await venueRow();
      assert.equal(after.lastInspectionDate, '2026-10-21');
      assert.equal(after.tier, 'approved');
      assert.deepEqual(await db.select().from(inspections), inspectionsBefore);

      // A fourth each, through a fresh inspection on a later day.
      await recordVisit(db, venueId, sam, 'below_par', day20);
      await recordVisit(db, venueId, alex, undefined, day20);
      assert.equal((await visits()).length, 6);
      assert.equal((await venueRow()).lastInspectionDate, '2026-11-09');
    });

    it('allows one visit per Chair per day and refuses the future', async () => {
      const db = await testDb();
      assert.equal((await logVisit(db, venueId, sam, '2026-10-20', day1)).result, 'logged');
      const again = await logVisit(db, venueId, sam, '2026-10-20', day2);
      assert.equal(again.result, 'already_logged');
      assert.equal((await logVisit(db, venueId, alex, '2026-10-20', day2)).result, 'logged');
      assert.equal((await logVisit(db, venueId, sam, '2026-10-22', day1)).result, 'future_date');
      assert.equal(
        (await logVisit(db, '00000000-0000-4000-8000-000000000000', sam, '2026-10-20', day1))
          .result,
        'not_found'
      );
      assert.equal((await visits()).length, 2);
    });

    it('shows on the timeline as text only', async () => {
      const db = await testDb();
      const logged = await logVisit(db, venueId, sam, '2026-10-20', day1);
      assert.equal(logged.result, 'logged');
      if (logged.result !== 'logged') return;
      await addNote(db, logged.visit.id, sam, 'Secret sauce was off.', day1);
      const timeline = await loadVenueTimeline(db, venueId);
      const texts = timeline.map((entry) => entry.text);
      assert.ok(texts.some((text) => text.startsWith('Visit logged by Sam on ')));
      assert.ok(texts.some((text) => text.startsWith('Field note added by Sam on ')));
      assert.ok(!JSON.stringify(timeline).includes('Secret sauce'));
      const events = await db.select().from(venueEvents).where(eq(venueEvents.venueId, venueId));
      assert.ok(!JSON.stringify(events).includes('Secret sauce'));
    });
  });

  describe('notes', () => {
    /** Sam's visits of every kind: pending, confirmed, lapsed and standalone. */
    async function visitsOfEveryKind() {
      const db = await testDb();
      const lapsedVenue = await createVenue('Lapsed Diner');
      const confirmedVenue = await createVenue('Confirmed Cafe');
      const lapsed = await recordVisit(db, lapsedVenue, sam, 'satisfactory', day1);
      await recordVisit(db, lapsedVenue, sam, 'satisfactory', day2); // lapses day 1's press
      const confirmed = await recordVisit(db, confirmedVenue, sam, 'satisfactory', day2);
      await recordVisit(db, confirmedVenue, alex, undefined, day2);
      const pending = await recordVisit(db, venueId, sam, 'below_par', day2);
      const standalone = await logVisit(db, venueId, sam, '2026-10-20', day2);
      const id = (outcome: { result: string; visit?: { id: string } }) => outcome.visit!.id;
      return {
        lapsed: id(lapsed),
        confirmed: id(confirmed),
        pending: id(pending),
        standalone: id(standalone),
        lapsedVenue,
        confirmedVenue,
      };
    }

    it('can be added and edited days later on pending, confirmed, lapsed and standalone visits', async () => {
      const db = await testDb();
      const kinds = await visitsOfEveryKind();
      for (const [kind, visitId] of Object.entries(kinds).filter(
        ([key]) => !key.endsWith('Venue')
      )) {
        const added = await addNote(db, visitId, sam, `  About the ${kind} visit.  `, day9);
        assert.equal(added.result, 'added', kind);
        if (added.result !== 'added') continue;
        assert.equal(added.note.body, `About the ${kind} visit.`);
        assert.ok(added.note.daysAfterVisit >= 7, kind);
        const edited = await editNote(db, added.note.id, sam, 'Revised.', day20);
        assert.equal(edited.result, 'edited', kind);
        assert.equal(edited.result === 'edited' && edited.note.editedAt, day20.toISOString());
      }
      const lapsedVisits = await listVisitsForVenue(db, kinds.lapsedVenue);
      assert.equal(
        lapsedVisits.find((visit) => visit.id === kinds.lapsed)!.statusLabel,
        'Unconfirmed'
      );
      const confirmedVisits = await listVisitsForVenue(db, kinds.confirmedVenue);
      assert.equal(confirmedVisits[0].statusLabel, 'Confirmed: satisfactory');
      const labels = (await listVisitsForVenue(db, venueId)).map((visit) => visit.statusLabel);
      assert.deepEqual(labels, ['Pending', 'Visit only']);
    });

    it('any active Chair can read every note on every visit, including ones they were not part of', async () => {
      const db = await testDb();
      await recordVisit(db, venueId, sam, 'satisfactory', day1);
      await recordVisit(db, venueId, alex, undefined, day1);
      const [alexVisit, samVisit] = (await listVisitsForVenue(db, venueId)).sort((a, b) =>
        a.visitorName!.localeCompare(b.visitorName!)
      );
      await addNote(db, samVisit.id, sam, 'Sam: crisp batter.', day1);
      await addNote(db, samVisit.id, sam, 'Sam: second thought.', day2);
      await addNote(db, alexVisit.id, alex, 'Alex: slow service.', day2);

      // Reading is not tied to the viewer: Jo was on neither visit and sees everything.
      const seen = await listVisitsForVenue(db, venueId);
      const all = seen.flatMap((visit) => visit.notes.map((note) => note.body));
      assert.deepEqual(all.sort(), [
        'Alex: slow service.',
        'Sam: crisp batter.',
        'Sam: second thought.',
      ]);
      const samNotes = seen.find((visit) => visit.id === samVisit.id)!.notes;
      assert.deepEqual(
        samNotes.map((note) => note.body),
        ['Sam: crisp batter.', 'Sam: second thought.'],
        'oldest first'
      );
      assert.equal((await listNotesForVenue(db, venueId)).length, 3);
    });

    it("only the visit's Chair can add, edit or delete", async () => {
      const db = await testDb();
      const logged = await logVisit(db, venueId, sam, '2026-10-20', day1);
      const visitId = logged.result === 'logged' ? logged.visit.id : '';
      assert.equal((await addNote(db, visitId, alex, 'Not mine.', day1)).result, 'not_your_visit');
      const added = await addNote(db, visitId, sam, 'Mine.', day1);
      const noteId = added.result === 'added' ? added.note.id : '';
      assert.equal((await editNote(db, noteId, alex, 'Changed.', day2)).result, 'not_your_visit');
      assert.equal((await deleteNote(db, noteId, jo)).result, 'not_your_visit');
      const [stored] = await db.select().from(visitNotes).where(eq(visitNotes.id, noteId));
      assert.equal(stored.body, 'Mine.');
      assert.equal(stored.editedAt, null);
      assert.equal((await deleteNote(db, noteId, sam)).result, 'deleted');
      assert.equal((await db.select().from(visitNotes)).length, 0);
      assert.equal((await deleteNote(db, noteId, sam)).result, 'not_found');
    });

    it('the database refuses a public note and an empty one', async () => {
      const db = await testDb();
      const visit = await ensureVisit(db, venueId, sam, '2026-10-20');
      await assert.rejects(
        db.insert(visitNotes).values({ visitId: visit.id, body: 'Hello', visibility: 'public' }),
        violates('visit_notes_internal_only')
      );
      await assert.rejects(
        db.insert(visitNotes).values({ visitId: visit.id, body: '   ' }),
        violates('visit_notes_body_length')
      );
      await assert.rejects(
        db.insert(visitNotes).values({ visitId: visit.id, body: 'x'.repeat(4001) }),
        violates('visit_notes_body_length')
      );
    });
  });

  describe('history and cascades', () => {
    it('visitor names survive user deletion', async () => {
      const db = await testDb();
      const logged = await logVisit(db, venueId, jo, '2026-10-20', day1);
      if (logged.result !== 'logged') throw new Error('not logged');
      await addNote(db, logged.visit.id, jo, 'Jo was here.', day1);
      await db.delete(user).where(eq(user.id, jo.id));
      const [visit] = await listVisitsForVenue(db, venueId);
      assert.equal(visit.visitorId, null);
      assert.equal(visit.visitorName, 'Jo');
      assert.equal(visit.notes[0].body, 'Jo was here.');
    });

    it('deleting a visit deletes its notes; deleting a venue deletes its visits; deleting an inspection unlinks', async () => {
      const db = await testDb();
      const pressed = await recordVisit(db, venueId, sam, 'satisfactory', day1);
      if (pressed.result !== 'waiting') throw new Error('not waiting');
      await addNote(db, pressed.visit.id, sam, 'Note.', day1);

      await db.delete(inspections).where(eq(inspections.id, pressed.inspection.id));
      const [unlinked] = await visits();
      assert.equal(unlinked.inspectionId, null);

      await db.delete(venueVisits).where(eq(venueVisits.id, pressed.visit.id));
      assert.equal((await db.select().from(visitNotes)).length, 0);

      const logged = await logVisit(db, venueId, sam, '2026-10-20', day1);
      if (logged.result !== 'logged') throw new Error('not logged');
      await addNote(db, logged.visit.id, sam, 'Note.', day1);
      await db.delete(venues).where(eq(venues.id, venueId));
      assert.equal((await db.select().from(venueVisits)).length, 0);
      assert.equal((await db.select().from(visitNotes)).length, 0);
    });
  });

  describe('migration backfill', () => {
    const migration = readFileSync('drizzle/0017_visits_and_notes.sql', 'utf8');
    const backfill = migration
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .find((statement) => /INSERT INTO "venue_visits"/.test(statement));

    it('creates one visit per recorded Chair of each verified inspection, skips legacy rows, and is idempotent', async () => {
      assert.ok(backfill, 'the migration has a backfill statement');
      const db = await testDb();
      const other = await createVenue('Other Place');
      // Inserted directly, as if recorded before visits existed.
      await db.insert(inspections).values([
        {
          venueId,
          inspectionDate: '2026-09-01',
          status: 'confirmed',
          kind: 'verified',
          outcome: 'satisfactory',
          firstAdminId: sam.id,
          firstAdminName: 'Sam',
          secondAdminId: alex.id,
          secondAdminName: 'Alex',
          confirmedAt: new Date('2026-09-01T13:00:00Z'),
        },
        {
          venueId,
          inspectionDate: '2026-09-05',
          status: 'lapsed',
          kind: 'verified',
          outcome: 'below_par',
          firstAdminId: jo.id,
          firstAdminName: 'Jo',
        },
        // A Chair since deleted: only the name snapshot is left.
        {
          venueId: other,
          inspectionDate: '2026-09-02',
          status: 'confirmed',
          kind: 'verified',
          outcome: 'satisfactory',
          firstAdminId: null,
          firstAdminName: 'Former Chair',
          secondAdminId: sam.id,
          secondAdminName: 'Sam',
        },
        { venueId, inspectionDate: '2024-01-01', status: 'confirmed', kind: 'legacy' },
      ]);

      await db.execute(sql.raw(backfill!));
      await db.execute(sql.raw(backfill!));

      const rows = await db.select().from(venueVisits);
      const summary = rows
        .map((row) => `${row.visitDate} ${row.visitorName} ${row.visitorId ?? '-'}`)
        .sort();
      assert.deepEqual(summary, [
        '2026-09-01 Alex alex',
        '2026-09-01 Sam sam',
        '2026-09-02 Former Chair -',
        '2026-09-02 Sam sam',
        '2026-09-05 Jo jo',
      ]);
      assert.ok(rows.every((row) => row.inspectionId !== null));
    });
  });

  describe('public safety', () => {
    /** Points the public queries (which use the app's db) at the test database. */
    async function asPublic<T>(fn: () => Promise<T>): Promise<T> {
      const db = await testDb();
      const original = (appDb as any).select;
      (appDb as any).select = (...args: unknown[]) => (db as any).select(...args);
      try {
        return await fn();
      } finally {
        (appDb as any).select = original;
      }
    }

    it('public venue and ledger data never include visits or notes', async () => {
      const db = await testDb();
      await recordVisit(db, venueId, sam, 'satisfactory', day1);
      const confirmed = await recordVisit(db, venueId, alex, undefined, day1);
      if (confirmed.result !== 'confirmed') throw new Error('not confirmed');
      await addNote(db, confirmed.visit.id, alex, 'PRIVATE-NOTE-TEXT', day1);
      const logged = await logVisit(db, venueId, jo, '2026-10-20', day1);
      if (logged.result !== 'logged') throw new Error('not logged');
      await addNote(db, logged.visit.id, jo, 'PRIVATE-NOTE-TEXT', day2);
      const slug = (await venueRow()).slug;

      const output = JSON.stringify(
        await asPublic(async () => ({
          venues: await getPublicVenues(),
          venue: await getPublicVenue(slug),
          ledger: await getPublicInspections(),
          venueLedger: await getPublicInspections(slug),
        }))
      );
      assert.ok(output.includes(slug), 'the venue is public');
      assert.ok(output.includes(confirmed.inspection.id), 'its inspection is public');
      for (const secret of [
        'PRIVATE-NOTE-TEXT',
        confirmed.visit.id,
        logged.visit.id,
        'visitNotes',
        'visitorName',
        'notes',
        'Jo',
      ]) {
        assert.ok(!output.includes(secret), `public output contains ${secret}`);
      }
    });
  });
});
