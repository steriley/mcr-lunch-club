import '../setup-env';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { POST as propose } from '@/pages/api/admin/venues/[id]/proposals';
import { POST as approve } from '@/pages/api/admin/proposals/[id]/approve';
import { POST as decline } from '@/pages/api/admin/proposals/[id]/decline';
import { POST as withdraw } from '@/pages/api/admin/proposals/[id]/withdraw';
import { ADMIN, VENUE_ID, adminRequest, quietly, restoreStubs, run, signInAs, stubDb, stubDbSequence, stubTransactions } from '../route-helpers';

afterEach(restoreStubs);

const PROPOSAL_ID = '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d';
const pending = { id: PROPOSAL_ID, venueId: VENUE_ID, fromTier: 'to_be_assessed', proposedTier: 'rejected', proposedBy: 'other-admin', status: 'pending' };
const ctx = (id: string, body?: unknown, origin?: string) => ({ request: adminRequest('POST', body ?? {}, { origin }), params: { id } });

describe('tier proposal endpoints', () => {
  it('propose validates the tier', async () => {
    signInAs();
    assert.equal((await run(propose, ctx(VENUE_ID, { proposedTier: 'great' }))).status, 400);
    assert.equal((await run(propose, ctx(VENUE_ID, {}))).status, 400);
  });

  it('propose explains a missing verified inspection for Approved', async () => {
    signInAs();
    stubTransactions();
    // venue lock, pending lookup, latest verified inspection
    stubDbSequence('select', [[{ id: VENUE_ID, tier: 'under_consideration' }], [], []]);
    const response = await run(propose, ctx(VENUE_ID, { proposedTier: 'approved' }));
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /Visited today/);
  });

  it('approve refuses the proposer', async () => {
    signInAs();
    stubTransactions();
    stubDb('select', [{ ...pending, proposedBy: ADMIN.id }]);
    const updates = stubDb('update', []);
    const response = await run(approve, ctx(PROPOSAL_ID));
    assert.equal(response.status, 403);
    assert.match((await response.json()).error, /different admin/);
    assert.equal(updates.length, 0);
  });

  it('approve sets the venue tier from the proposal', async () => {
    signInAs({ ...ADMIN, name: 'Alex' });
    stubTransactions();
    stubDb('select', [pending]);
    const updates = stubDbSequence('update', [[{ ...pending, status: 'approved' }], [{ id: VENUE_ID, tier: 'rejected', createdAt: new Date(), updatedAt: new Date(), latitude: null, longitude: null, distanceMiles: null, closedAt: null }]]);
    stubDb('insert', []);
    const response = await run(approve, ctx(PROPOSAL_ID));
    assert.equal(response.status, 200);
    const sets = updates.filter((call) => call.method === 'set').map((call) => call.args[0] as any);
    assert.equal(sets[0].status, 'approved');
    assert.equal(sets[0].decidedBy, ADMIN.id);
    assert.equal(sets[0].decidedByName, 'Alex');
    assert.equal(sets[1].tier, 'rejected');
  });

  it('decline needs a non-empty reason', async () => {
    signInAs();
    for (const body of [{}, { reason: '' }, { reason: '   ' }, { reason: 'x'.repeat(1001) }]) {
      assert.equal((await run(decline, ctx(PROPOSAL_ID, body))).status, 400);
    }
  });

  it('decline stores the trimmed reason', async () => {
    signInAs();
    stubTransactions();
    stubDb('select', [pending]);
    const updates = stubDb('update', [{ ...pending, status: 'declined' }]);
    assert.equal((await run(decline, ctx(PROPOSAL_ID, { reason: '  Not yet.  ' }))).status, 200);
    assert.equal((updates.find((call) => call.method === 'set')!.args[0] as any).declineReason, 'Not yet.');
  });

  it('only the proposer can withdraw', async () => {
    signInAs();
    stubTransactions();
    stubDb('select', [pending]);
    assert.equal((await run(withdraw, ctx(PROPOSAL_ID))).status, 403);
  });

  it('a decided proposal cannot be decided again', async () => {
    signInAs();
    stubTransactions();
    stubDb('select', [{ ...pending, status: 'declined' }]);
    assert.equal((await run(approve, ctx(PROPOSAL_ID))).status, 409);
  });

  it('returns 500 on database errors', async () => {
    signInAs();
    stubTransactions();
    stubDb('select', new Error('db down'));
    assert.equal((await quietly(() => run(approve, ctx(PROPOSAL_ID)))).status, 500);
  });
});
