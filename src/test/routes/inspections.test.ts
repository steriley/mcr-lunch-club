import '../setup-env';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { POST as visitedToday } from '@/pages/api/admin/venues/[id]/visited-today';
import { isBanned } from '@/lib/admin-api';
import {
  ADMIN,
  VENUE_ID,
  adminRequest,
  quietly,
  restoreStubs,
  run,
  signInAs,
  stubDb,
  stubExecute,
  stubTransactions,
} from '../route-helpers';

afterEach(restoreStubs);

const values0 = (calls: { method: string; args: unknown[] }[]) =>
  calls.find((call) => call.method === 'values')!.args[0] as any;

const ctx = (id: string = VENUE_ID, origin?: string, body?: unknown) => ({
  request: adminRequest('POST', body, { origin }),
  params: { id },
});

describe('POST /api/admin/venues/[id]/visited-today', () => {
  it('404s when the venue does not exist', async () => {
    signInAs();
    stubTransactions();
    stubExecute([]);
    assert.equal((await run(visitedToday, ctx())).status, 404);
  });

  it('starts a pending inspection on a first press and reports the waiting state', async () => {
    signInAs({ ...ADMIN, name: 'Sam' });
    stubTransactions();
    stubExecute([{ id: VENUE_ID }]);
    const pending = {
      id: 'i1',
      venueId: VENUE_ID,
      status: 'pending',
      kind: 'verified',
      firstAdminId: ADMIN.id,
      firstAdminName: 'Sam',
      outcome: 'below_par',
      inspectionDate: '2026-10-21',
      createdAt: new Date('2026-10-21T11:44:00Z'),
    };
    stubDb('update', []);
    // confirmed-today lookup, pending lookup, then the status read.
    const { stubDbSequence } = await import('../route-helpers');
    stubDbSequence('select', [[], [], [pending]]);
    const visit = {
      id: 'v1',
      venueId: VENUE_ID,
      visitDate: '2026-10-21',
      inspectionId: 'i1',
      visitorId: ADMIN.id,
      visitorName: 'Sam',
      createdAt: new Date('2026-10-21T11:44:00Z'),
    };
    const inserts = stubDbSequence('insert', [[pending], [visit]]);
    const response = await run(visitedToday, ctx(VENUE_ID, undefined, { outcome: 'below_par' }));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.result, 'waiting');
    // Only the press that confirms an inspection has a timeline line.
    assert.equal(body.timelineEntry, null);
    // The press records the Chair's visit, linked to the inspection it started.
    assert.deepEqual(body.visit, {
      id: 'v1',
      venueId: VENUE_ID,
      visitDate: '2026-10-21',
      visitorId: ADMIN.id,
      visitorName: 'Sam',
      createdAt: '2026-10-21T11:44:00.000Z',
      inspectionId: 'i1',
      statusLabel: 'Pending',
      notes: [],
    });
    const visitValues = inserts.filter((call) => call.method === 'values')[1].args[0] as any;
    assert.deepEqual(
      {
        inspectionId: visitValues.inspectionId,
        visitorId: visitValues.visitorId,
        visitorName: visitValues.visitorName,
      },
      { inspectionId: 'i1', visitorId: ADMIN.id, visitorName: 'Sam' }
    );
    assert.equal(visitValues.visitDate, values0(inserts).inspectionDate);
    assert.deepEqual(body.status.pending, {
      firstAdminName: 'Sam',
      byMe: true,
      firstAt: '2026-10-21T11:44:00.000Z',
      outcome: 'below_par',
    });
    const values = values0(inserts);
    assert.equal(values.firstAdminId, ADMIN.id);
    assert.equal(values.status, 'pending');
    assert.equal(values.outcome, 'below_par');
    assert.match(values.inspectionDate, /^\d{4}-\d{2}-\d{2}$/);
  });

  it('refuses a first press that does not say how the inspection went', async () => {
    signInAs();
    stubTransactions();
    stubExecute([{ id: VENUE_ID }]);
    stubDb('update', []);
    const { stubDbSequence } = await import('../route-helpers');
    stubDbSequence('select', [[], []]);
    const inserts = stubDb('insert', []);
    const response = await run(visitedToday, ctx());
    assert.equal(response.status, 400);
    assert.deepEqual((await response.json()).fields, {
      outcome: 'Choose satisfactory or below par.',
    });
    assert.equal(inserts.length, 0);
  });

  it('rejects an outcome that is not satisfactory or below par', async () => {
    signInAs();
    const response = await run(visitedToday, ctx(VENUE_ID, undefined, { outcome: 'great' }));
    assert.equal(response.status, 400);
    assert.ok((await response.json()).fields.outcome);
  });

  it('refuses a cosigner who names a different outcome from the first Chair’s', async () => {
    signInAs({ ...ADMIN, id: 'other-admin' });
    stubTransactions();
    stubExecute([{ id: VENUE_ID }]);
    stubDb('update', []);
    const pending = {
      id: 'i1',
      venueId: VENUE_ID,
      status: 'pending',
      kind: 'verified',
      firstAdminId: ADMIN.id,
      outcome: 'satisfactory',
    };
    const { stubDbSequence } = await import('../route-helpers');
    stubDbSequence('select', [[], [pending]]);
    const response = await run(visitedToday, ctx(VENUE_ID, undefined, { outcome: 'below_par' }));
    assert.equal(response.status, 409);
  });

  it('returns 500 on database errors', async () => {
    signInAs();
    stubTransactions();
    stubExecute(new Error('db down'));
    assert.equal((await quietly(() => run(visitedToday, ctx()))).status, 500);
  });
});

describe('isBanned', () => {
  it('treats banned accounts as inactive until any ban expiry passes', () => {
    const now = new Date('2026-10-21T12:00:00Z');
    assert.equal(isBanned({ banned: false }, now), false);
    assert.equal(isBanned({ banned: null }, now), false);
    assert.equal(isBanned({ banned: true }, now), true);
    assert.equal(isBanned({ banned: true, banExpires: '2026-10-22T00:00:00Z' }, now), true);
    assert.equal(
      isBanned({ banned: true, banExpires: new Date('2026-10-20T00:00:00Z') }, now),
      false
    );
  });
});
