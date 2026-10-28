import '../setup-env';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { POST as close } from '@/pages/api/admin/venues/[id]/close';
import { POST as reopen } from '@/pages/api/admin/venues/[id]/reopen';
import {
  ADMIN,
  VENUE_ID,
  adminRequest,
  quietly,
  renderSql,
  restoreStubs,
  run,
  signInAs,
  stubDb,
  stubTransactions,
} from '../route-helpers';

afterEach(restoreStubs);

const now = new Date('2026-10-21T12:00:00.000Z');
const row = {
  id: VENUE_ID,
  slug: 'chip-shop',
  name: 'Chip Shop',
  tier: 'if_we_must',
  latitude: null,
  longitude: null,
  distanceMiles: null,
  createdAt: now,
  updatedAt: now,
  closedAt: now,
};
const ctx = (id: string = VENUE_ID, origin?: string) => ({
  request: adminRequest('POST', undefined, { origin }),
  params: { id },
});

describe('POST /api/admin/venues/[id]/close and /reopen', () => {
  it('closes the venue, keeps its tier and logs who did it, in one transaction', async () => {
    signInAs({ ...ADMIN, name: 'Sam' });
    const transactions = stubTransactions();
    const updates = stubDb('update', [row]);
    const inserts = stubDb('insert', []);
    const response = await run(close, ctx());
    assert.equal(response.status, 200);
    assert.ok((await response.json()).venue.closedAt);
    assert.equal(transactions.count, 1);

    const set = updates.find((call) => call.method === 'set')!.args[0] as any;
    assert.ok(set.closedAt instanceof Date);
    assert.equal(set.closedBy, ADMIN.id);
    assert.ok(!('tier' in set), 'closing must not touch the tier');
    assert.match(
      renderSql(updates.find((call) => call.method === 'where')!.args[0]).sql,
      /"closed_at" is null/
    );

    const event = inserts.find((call) => call.method === 'values')!.args[0] as any;
    assert.deepEqual(
      {
        kind: event.kind,
        actorId: event.actorId,
        actorName: event.actorName,
        venueId: event.venueId,
      },
      {
        kind: 'closed',
        actorId: ADMIN.id,
        actorName: 'Sam',
        venueId: VENUE_ID,
      }
    );
  });

  it('reopens the venue, clearing who closed it, and logs it', async () => {
    signInAs({ ...ADMIN, name: '' });
    stubTransactions();
    const updates = stubDb('update', [{ ...row, closedAt: null }]);
    const inserts = stubDb('insert', []);
    assert.equal((await run(reopen, ctx())).status, 200);
    assert.deepEqual(updates.find((call) => call.method === 'set')!.args[0], {
      closedAt: null,
      closedBy: null,
    });
    const event = inserts.find((call) => call.method === 'values')!.args[0] as any;
    assert.equal(event.kind, 'reopened');
    assert.equal(
      event.actorName,
      ADMIN.email,
      'falls back to the email when there is no display name'
    );
  });

  it('409s without logging when the venue is already in that state, and 404s when it is missing', async () => {
    signInAs();
    stubTransactions();
    stubDb('update', []);
    const inserts = stubDb('insert', []);
    stubDb('select', [{ id: VENUE_ID }]);
    assert.equal((await run(close, ctx())).status, 409);
    assert.equal((await run(reopen, ctx())).status, 409);
    assert.equal(inserts.length, 0);

    stubDb('select', []);
    assert.equal((await run(close, ctx())).status, 404);
  });

  it('returns 500 on database errors', async () => {
    signInAs();
    stubTransactions();
    stubDb('update', new Error('db down'));
    assert.equal((await quietly(() => run(close, ctx()))).status, 500);
  });
});
