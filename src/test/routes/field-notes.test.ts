import '../setup-env';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { POST as logVisitRoute } from '@/pages/api/admin/venues/[id]/visits';
import { POST as addNoteRoute } from '@/pages/api/admin/visits/[id]/notes';
import { DELETE as deleteNoteRoute, PATCH as editNoteRoute } from '@/pages/api/admin/notes/[id]';
import {
  ADMIN,
  VENUE_ID,
  adminRequest,
  quietly,
  restoreStubs,
  run,
  signInAs,
  stubDb,
  stubDbSequence,
  stubTransactions,
} from '../route-helpers';

afterEach(restoreStubs);

const VISIT_ID = '6a1f0c3e-2b4d-4e5f-8a9b-0c1d2e3f4a5b';
const NOTE_ID = '7b2e1d4f-3c5e-4f6a-9b0c-1d2e3f4a5b6c';

const visitRow = {
  id: VISIT_ID,
  venueId: VENUE_ID,
  visitDate: '2026-11-01',
  inspectionId: null,
  visitorId: ADMIN.id,
  visitorName: 'Sam',
  createdAt: new Date('2026-11-03T12:00:00Z'),
};
const noteRow = {
  id: NOTE_ID,
  visitId: VISIT_ID,
  body: 'Chips were cold.',
  visibility: 'internal',
  createdAt: new Date('2026-11-03T12:05:00Z'),
  editedAt: null,
};

const ctx = (method: string, id: string, body?: unknown) => ({
  request: adminRequest(method, body),
  params: { id },
});

describe('POST /api/admin/venues/[id]/visits', () => {
  it('refuses a signed-out request', async () => {
    signInAs(null);
    assert.equal(
      (await run(logVisitRoute, ctx('POST', VENUE_ID, { visitDate: '2026-11-01' }))).status,
      401
    );
  });

  it('logs a standalone visit and records it on the timeline', async () => {
    signInAs({ ...ADMIN, name: 'Sam' });
    stubTransactions();
    stubDb('select', [{ id: VENUE_ID }]);
    const inserts = stubDbSequence('insert', [[visitRow], []]);
    const response = await run(logVisitRoute, ctx('POST', VENUE_ID, { visitDate: '2026-11-01' }));
    assert.equal(response.status, 201);
    const { visit } = await response.json();
    assert.equal(visit.statusLabel, 'Visit only');
    assert.equal(visit.inspectionId, null);
    assert.deepEqual(visit.notes, []);
    const values = inserts.filter((call) => call.method === 'values').map((c) => c.args[0] as any);
    assert.equal(values[0].visitorId, ADMIN.id);
    assert.equal(values[0].visitDate, '2026-11-01');
    assert.equal(values[0].inspectionId, undefined, 'a logged visit never names an inspection');
    assert.equal(values[1].kind, 'visit_logged');
    assert.deepEqual(Object.keys(values[1].detail).sort(), ['visitDate', 'visitId']);
  });

  it('refuses a future date', async () => {
    signInAs();
    const response = await run(logVisitRoute, ctx('POST', VENUE_ID, { visitDate: '2999-01-01' }));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).fields.visitDate, 'A visit cannot be in the future.');
  });

  it('refuses something that is not a calendar day', async () => {
    signInAs();
    for (const visitDate of ['2026-02-30', 'yesterday', '', 20261101]) {
      const response = await run(logVisitRoute, ctx('POST', VENUE_ID, { visitDate }));
      assert.equal(response.status, 400, String(visitDate));
      assert.ok((await response.json()).fields.visitDate);
    }
  });

  it('404s for an unknown venue', async () => {
    signInAs();
    stubTransactions();
    stubDb('select', []);
    assert.equal(
      (await run(logVisitRoute, ctx('POST', VENUE_ID, { visitDate: '2026-11-01' }))).status,
      404
    );
    assert.equal(
      (await run(logVisitRoute, ctx('POST', 'not-a-uuid', { visitDate: '2026-11-01' }))).status,
      404
    );
  });

  it('409s when the Chair already has a visit that day', async () => {
    signInAs();
    stubTransactions();
    stubDbSequence('select', [
      [{ id: VENUE_ID }],
      [{ visit: visitRow, status: null, outcome: null }],
      [],
    ]);
    stubDb('insert', []);
    const response = await run(logVisitRoute, ctx('POST', VENUE_ID, { visitDate: '2026-11-01' }));
    assert.equal(response.status, 409);
    assert.equal((await response.json()).fields.visitDate, 'You already have a visit on that day.');
  });

  it('records no pending publish change', async () => {
    signInAs();
    stubTransactions();
    stubDb('select', [{ id: VENUE_ID }]);
    const inserts = stubDbSequence('insert', [[visitRow], []]);
    await run(logVisitRoute, ctx('POST', VENUE_ID, { visitDate: '2026-11-01' }));
    // The visit and its timeline event; nothing for pending_publish_changes.
    assert.equal(inserts.filter((call) => call.method === 'values').length, 2);
  });
});

describe('POST /api/admin/visits/[id]/notes', () => {
  it('adds a note to your own visit, written days after it', async () => {
    signInAs();
    stubTransactions();
    stubDb('select', [
      { id: VISIT_ID, venueId: VENUE_ID, visitorId: ADMIN.id, visitDate: '2026-11-01' },
    ]);
    const inserts = stubDbSequence('insert', [[noteRow], []]);
    const response = await run(
      addNoteRoute,
      ctx('POST', VISIT_ID, { body: '  Chips were cold.\n' })
    );
    assert.equal(response.status, 201);
    const { note } = await response.json();
    assert.deepEqual(note, {
      id: NOTE_ID,
      visitId: VISIT_ID,
      body: 'Chips were cold.',
      createdAt: '2026-11-03T12:05:00.000Z',
      editedAt: null,
      daysAfterVisit: 2,
    });
    const values = inserts.filter((call) => call.method === 'values').map((c) => c.args[0] as any);
    assert.equal(values[0].body, 'Chips were cold.', 'stored trimmed');
    assert.equal(values[1].kind, 'field_note_added');
    // The timeline event carries ids only, never the text.
    assert.deepEqual(values[1].detail, { visitId: VISIT_ID, noteId: NOTE_ID });
  });

  it("refuses a note on another Chair's visit", async () => {
    signInAs({ ...ADMIN, id: 'alex' });
    stubTransactions();
    stubDb('select', [
      { id: VISIT_ID, venueId: VENUE_ID, visitorId: ADMIN.id, visitDate: '2026-11-01' },
    ]);
    const inserts = stubDb('insert', []);
    const response = await run(addNoteRoute, ctx('POST', VISIT_ID, { body: 'Mine now.' }));
    assert.equal(response.status, 403);
    assert.equal(inserts.length, 0);
  });

  it('404s for an unknown visit', async () => {
    signInAs();
    stubTransactions();
    stubDb('select', []);
    assert.equal((await run(addNoteRoute, ctx('POST', VISIT_ID, { body: 'Hi' }))).status, 404);
  });

  it('refuses an empty or over-long note', async () => {
    signInAs();
    for (const body of ['', '   \n ', 'x'.repeat(4001), undefined]) {
      const response = await run(addNoteRoute, ctx('POST', VISIT_ID, { body }));
      assert.equal(response.status, 400);
      assert.ok((await response.json()).fields.body);
    }
  });

  it('accepts exactly 4,000 characters', async () => {
    signInAs();
    stubTransactions();
    stubDb('select', [
      { id: VISIT_ID, venueId: VENUE_ID, visitorId: ADMIN.id, visitDate: '2026-11-01' },
    ]);
    stubDbSequence('insert', [[noteRow], []]);
    const response = await run(addNoteRoute, ctx('POST', VISIT_ID, { body: 'x'.repeat(4000) }));
    assert.equal(response.status, 201);
  });

  it('returns 500 on database errors', async () => {
    signInAs();
    stubTransactions();
    stubDb('select', new Error('db down'));
    assert.equal(
      (await quietly(() => run(addNoteRoute, ctx('POST', VISIT_ID, { body: 'Hi' })))).status,
      500
    );
  });
});

describe('PATCH and DELETE /api/admin/notes/[id]', () => {
  const own = { note: noteRow, visitorId: ADMIN.id, visitDate: '2026-11-01' };

  it('edits your own note and stamps it edited', async () => {
    signInAs();
    stubTransactions();
    stubDb('select', [own]);
    const editedAt = new Date('2026-11-10T09:00:00Z');
    const updates = stubDb('update', [{ ...noteRow, body: 'Chips were lukewarm.', editedAt }]);
    const response = await run(
      editNoteRoute,
      ctx('PATCH', NOTE_ID, { body: 'Chips were lukewarm.' })
    );
    assert.equal(response.status, 200);
    const { note } = await response.json();
    assert.equal(note.body, 'Chips were lukewarm.');
    assert.equal(note.editedAt, '2026-11-10T09:00:00.000Z');
    const set = updates.find((call) => call.method === 'set')!.args[0] as any;
    assert.ok(set.editedAt instanceof Date);
  });

  it("refuses to edit or delete a note on another Chair's visit", async () => {
    signInAs({ ...ADMIN, id: 'alex' });
    stubTransactions();
    stubDb('select', [own]);
    const updates = stubDb('update', []);
    const deletes = stubDb('delete', []);
    assert.equal((await run(editNoteRoute, ctx('PATCH', NOTE_ID, { body: 'Mine.' }))).status, 403);
    assert.equal((await run(deleteNoteRoute, ctx('DELETE', NOTE_ID))).status, 403);
    assert.equal(updates.length, 0);
    assert.equal(deletes.length, 0);
  });

  it('deletes your own note', async () => {
    signInAs();
    stubTransactions();
    stubDb('select', [own]);
    const deletes = stubDb('delete', []);
    const response = await run(deleteNoteRoute, ctx('DELETE', NOTE_ID));
    assert.equal(response.status, 200);
    assert.ok(deletes.length > 0);
  });

  it('404s for an unknown note', async () => {
    signInAs();
    stubTransactions();
    stubDb('select', []);
    assert.equal((await run(deleteNoteRoute, ctx('DELETE', NOTE_ID))).status, 404);
    assert.equal((await run(editNoteRoute, ctx('PATCH', NOTE_ID, { body: 'x' }))).status, 404);
    assert.equal((await run(editNoteRoute, ctx('PATCH', 'nope', { body: 'x' }))).status, 404);
  });

  it('refuses a foreign-origin write', async () => {
    signInAs();
    const request = adminRequest('DELETE', undefined, { origin: 'https://evil.example' });
    assert.equal((await run(deleteNoteRoute, { request, params: { id: NOTE_ID } })).status, 403);
  });
});
