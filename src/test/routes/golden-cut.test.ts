import '../setup-env';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PUT } from '@/pages/api/admin/golden-cut';
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
  stubExecute,
  stubTransactions,
} from '../route-helpers';

afterEach(restoreStubs);

const OTHER_ID = '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d';
const put = (body: unknown, origin?: string) =>
  run(PUT, { request: adminRequest('PUT', body, { origin }) });
const listed = {
  entry: { venueId: VENUE_ID, position: 1, puffPiece: 'The best.', anchorDish: null },
  venue: {
    name: 'Chip Shop',
    tier: 'approved',
    latitude: '53.48',
    longitude: '-2.25',
    closedAt: null,
  },
};

describe('/api/admin/golden-cut', () => {
  it('PUT validates the body', async () => {
    signInAs();
    assert.equal(
      (await put({ entries: [{ venueId: VENUE_ID }, { venueId: VENUE_ID }] })).status,
      400
    );
    assert.equal((await put('nonsense')).status, 400);
  });

  it('PUT refuses a venue that is not Approved, changing nothing', async () => {
    signInAs();
    stubTransactions();
    stubExecute();
    stubDb('select', [{ id: VENUE_ID, name: 'Chip Shop', tier: 'if_we_must' }]);
    const deletes = stubDb('delete');
    const response = await put({ entries: [{ venueId: VENUE_ID }] });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /Chip Shop is not Approved/);
    assert.equal(deletes.length, 0);
  });

  it('PUT refuses a venue that no longer exists', async () => {
    signInAs();
    stubTransactions();
    stubExecute();
    stubDb('select', []);
    assert.match(
      (await (await put({ entries: [{ venueId: VENUE_ID }] })).json()).error,
      /no longer exists/
    );
  });

  it('PUT replaces the list in the order given, under a table lock', async () => {
    signInAs();
    const transactions = stubTransactions();
    const locks = stubExecute();
    stubDbSequence('select', [
      [
        { id: VENUE_ID, name: 'Chip Shop', tier: 'approved' },
        { id: OTHER_ID, name: 'Pie Shop', tier: 'approved' },
      ],
      [listed],
    ]);
    stubDb('delete');
    const inserts = stubDb('insert');
    const response = await put({
      entries: [
        { venueId: OTHER_ID, anchorDish: 'Pie' },
        { venueId: VENUE_ID, puffPiece: 'The best.' },
      ],
    });
    assert.equal(response.status, 200);
    assert.equal(transactions.count, 1);
    assert.equal(locks.length, 1);
    const values = inserts.find((call) => call.method === 'values')!.args[0] as any[];
    assert.deepEqual(
      values.map((row) => [
        row.venueId,
        row.position,
        row.puffPiece,
        row.anchorDish,
        row.updatedBy,
      ]),
      [
        [OTHER_ID, 1, null, 'Pie', ADMIN.id],
        [VENUE_ID, 2, 'The best.', null, ADMIN.id],
      ]
    );
    assert.equal((await response.json()).entries.length, 1);
  });

  it('PUT with an empty list clears it without inserting', async () => {
    signInAs();
    stubTransactions();
    stubExecute();
    stubDb('select', []);
    stubDb('delete');
    const inserts = stubDb('insert');
    assert.equal((await put({ entries: [] })).status, 200);
    assert.equal(inserts.length, 0);
  });

  it('PUT returns 500 on database errors', async () => {
    signInAs();
    stubTransactions();
    stubExecute(new Error('db down'));
    assert.equal((await quietly(() => put({ entries: [] }))).status, 500);
  });
});
