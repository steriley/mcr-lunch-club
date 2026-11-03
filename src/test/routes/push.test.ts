import '../setup-env';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pushDelivery } from '@/lib/push/dispatch';
import type { PushEvent } from '@/lib/push/messages';
import { POST as propose } from '@/pages/api/admin/venues/[id]/proposals';
import { POST as approve } from '@/pages/api/admin/proposals/[id]/approve';
import { POST as decline } from '@/pages/api/admin/proposals/[id]/decline';
import { POST as withdraw } from '@/pages/api/admin/proposals/[id]/withdraw';
import { POST as visitedToday } from '@/pages/api/admin/venues/[id]/visited-today';
import { POST as createVenue } from '@/pages/api/admin/venues';
import { POST as suggest } from '@/pages/api/suggestions';
import { GET as pushConfig } from '@/pages/api/admin/push/config';
import {
  DELETE as removeSubscription,
  POST as saveSubscription,
} from '@/pages/api/admin/push/subscriptions';
import { PUT as savePreferences } from '@/pages/api/admin/push/preferences';
import { POST as sendTest } from '@/pages/api/admin/push/test';
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
  stubDbSequence,
  stubExecute,
  stubTransactions,
} from '../route-helpers';

/**
 * Which admin actions send which pushes (#115). The sender is swapped for a recorder, so these
 * check that each action notifies exactly once on success, only after its transaction has
 * finished, and never when it is refused.
 */

const originalDeliver = pushDelivery.deliver;
afterEach(() => {
  restoreStubs();
  pushDelivery.deliver = originalDeliver;
  for (const key of ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'])
    process.env[key] = '';
});

function capturePushes(transactions?: { open: number }) {
  const sent: { event: PushEvent; openTransactions: number }[] = [];
  pushDelivery.deliver = async (event) => {
    sent.push({ event, openTransactions: transactions?.open ?? 0 });
  };
  return sent;
}

const PROPOSAL_ID = '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d';
const pending = {
  id: PROPOSAL_ID,
  venueId: VENUE_ID,
  fromTier: 'to_be_assessed',
  proposedTier: 'rejected',
  proposedBy: 'other-admin',
  proposedByName: 'Jo',
  status: 'pending',
};
const venueRow = {
  id: VENUE_ID,
  slug: 'chip-shop',
  name: 'Chip Shop',
  tier: 'rejected',
  createdAt: new Date(),
  updatedAt: new Date(),
  latitude: null,
  longitude: null,
  distanceMiles: null,
  closedAt: null,
};
const ctx = (id: string, body?: unknown) => ({
  request: adminRequest('POST', body ?? {}),
  params: { id },
});

describe('pushes from verdict proposals', () => {
  it('a new proposal notifies once, after its transaction', async () => {
    signInAs({ ...ADMIN, name: 'Sam' });
    const transactions = stubTransactions();
    const sent = capturePushes(transactions);
    // venue lock, pending lookup
    stubDbSequence('select', [[{ id: VENUE_ID, tier: 'under_consideration' }], []]);
    const created = {
      id: PROPOSAL_ID,
      venueId: VENUE_ID,
      fromTier: 'under_consideration',
      proposedTier: 'if_we_must',
      proposedBy: ADMIN.id,
      proposedByName: 'Sam',
      status: 'pending',
    };
    stubDb('insert', [created]);
    const response = await run(propose, ctx(VENUE_ID, { proposedTier: 'if_we_must' }));
    assert.equal(response.status, 201);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].openTransactions, 0);
    assert.deepEqual(sent[0].event, {
      type: 'proposal',
      venueId: VENUE_ID,
      proposerId: ADMIN.id,
      proposerName: 'Sam',
      fromTier: 'under_consideration',
      toTier: 'if_we_must',
    });
  });

  it('a refused proposal notifies nobody', async () => {
    signInAs();
    stubTransactions();
    const sent = capturePushes();
    stubDbSequence('select', [[{ id: VENUE_ID, tier: 'under_consideration' }], [pending]]);
    assert.equal((await run(propose, ctx(VENUE_ID, { proposedTier: 'approved' }))).status, 409);
    assert.equal(sent.length, 0);
  });

  it('approving tells the proposer, after the transaction', async () => {
    signInAs({ ...ADMIN, name: 'Alex' });
    const transactions = stubTransactions();
    const sent = capturePushes(transactions);
    stubDb('select', [pending]);
    stubDbSequence('update', [
      [{ ...pending, status: 'approved', decidedBy: ADMIN.id, decidedByName: 'Alex' }],
      [venueRow],
    ]);
    stubDb('insert', []);
    assert.equal((await run(approve, ctx(PROPOSAL_ID))).status, 200);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].openTransactions, 0);
    assert.deepEqual(sent[0].event, {
      type: 'decision',
      proposalId: PROPOSAL_ID,
      venueId: VENUE_ID,
      proposerId: 'other-admin',
      deciderName: 'Alex',
      approved: true,
    });
  });

  it('declining tells the proposer without the reason', async () => {
    signInAs({ ...ADMIN, name: 'Alex' });
    stubTransactions();
    const sent = capturePushes();
    stubDb('select', [pending]);
    stubDb('update', [
      { ...pending, status: 'declined', decidedByName: 'Alex', declineReason: 'Soggy chips' },
    ]);
    assert.equal((await run(decline, ctx(PROPOSAL_ID, { reason: 'Soggy chips' }))).status, 200);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].event.type, 'decision');
    assert.ok(!JSON.stringify(sent[0].event).includes('Soggy'));
  });

  it('refused decisions and withdrawals notify nobody', async () => {
    signInAs();
    stubTransactions();
    const sent = capturePushes();
    // own_proposal
    stubDb('select', [{ ...pending, proposedBy: ADMIN.id }]);
    stubDb('update', []);
    assert.equal((await run(approve, ctx(PROPOSAL_ID))).status, 403);
    // not_pending
    stubDb('select', [{ ...pending, status: 'approved' }]);
    assert.equal((await run(decline, ctx(PROPOSAL_ID, { reason: 'x' }))).status, 409);
    // a withdrawal succeeds but tells nobody
    stubDb('select', [{ ...pending, proposedBy: ADMIN.id }]);
    stubDb('update', [{ ...pending, proposedBy: ADMIN.id, status: 'withdrawn' }]);
    assert.equal((await run(withdraw, ctx(PROPOSAL_ID))).status, 200);
    assert.equal(sent.length, 0);
  });

  it('a database error notifies nobody', async () => {
    signInAs();
    stubTransactions();
    const sent = capturePushes();
    stubDb('select', new Error('db down'));
    assert.equal((await quietly(() => run(approve, ctx(PROPOSAL_ID)))).status, 500);
    assert.equal(sent.length, 0);
  });

  it('a failing push never fails the action', async () => {
    signInAs();
    stubTransactions();
    pushDelivery.deliver = async () => {
      throw new Error('push service down');
    };
    stubDb('select', [pending]);
    stubDbSequence('update', [[{ ...pending, status: 'approved' }], [venueRow]]);
    stubDb('insert', []);
    const response = await quietly(async () => {
      const result = await run(approve, ctx(PROPOSAL_ID));
      await new Promise((resolve) => setImmediate(resolve));
      return result;
    });
    assert.equal(response.status, 200);
  });

  it('creating a venue with a verdict notifies about its first proposal', async () => {
    signInAs({ ...ADMIN, name: 'Sam' });
    const transactions = stubTransactions();
    const sent = capturePushes(transactions);
    stubDbSequence('select', [[], [{ ...venueRow, tier: null }], []]);
    const proposal = {
      id: PROPOSAL_ID,
      venueId: VENUE_ID,
      fromTier: null,
      proposedTier: 'to_be_assessed',
      proposedBy: ADMIN.id,
      proposedByName: 'Sam',
      status: 'pending',
    };
    stubDbSequence('insert', [[venueRow], [], [proposal]]);
    const response = await run(createVenue, {
      request: adminRequest('POST', {
        name: 'Chip Shop',
        slug: 'chip-shop',
        cost: '££',
        proposedTier: 'to_be_assessed',
      }),
      params: {},
    });
    assert.equal(response.status, 201);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].openTransactions, 0);
    assert.equal(sent[0].event.type, 'proposal');
    assert.equal((sent[0].event as { fromTier: unknown }).fromTier, null);
  });
});

describe('pushes from "Visited today"', () => {
  const inspection = {
    id: 'i1',
    venueId: VENUE_ID,
    status: 'pending',
    kind: 'verified',
    firstAdminId: ADMIN.id,
    firstAdminName: 'Sam',
    outcome: 'satisfactory',
    inspectionDate: '2026-11-03',
    createdAt: new Date('2026-11-03T12:00:00Z'),
  };
  // The presser's visit row (src/lib/visits.ts), written in the same transaction.
  const visit = {
    id: 'v1',
    venueId: VENUE_ID,
    visitDate: '2026-11-03',
    inspectionId: 'i1',
    visitorId: ADMIN.id,
    visitorName: 'Sam',
    createdAt: new Date('2026-11-03T12:00:00Z'),
  };
  const press = (body?: unknown) => ({
    request: adminRequest('POST', body),
    params: { id: VENUE_ID },
  });

  it('a first press asks the others, after the transaction', async () => {
    signInAs({ ...ADMIN, name: 'Sam' });
    const transactions = stubTransactions();
    const sent = capturePushes(transactions);
    stubExecute([{ id: VENUE_ID }]);
    stubDb('update', []);
    stubDbSequence('select', [[], [], [inspection]]);
    stubDbSequence('insert', [[inspection], [visit]]);
    assert.equal(
      (await quietly(() => run(visitedToday, press({ outcome: 'satisfactory' })))).status,
      200
    );
    assert.equal(sent.length, 1);
    assert.equal(sent[0].openTransactions, 0);
    assert.deepEqual(sent[0].event, {
      type: 'visit_waiting',
      venueId: VENUE_ID,
      date: '2026-11-03',
      firstChairId: ADMIN.id,
      firstChairName: 'Sam',
    });
  });

  it('pressing again yourself sends nothing more', async () => {
    signInAs();
    stubTransactions();
    const sent = capturePushes();
    stubExecute([{ id: VENUE_ID }]);
    stubDb('update', []);
    stubDbSequence('select', [[], [inspection], [inspection]]);
    stubDb('insert', [visit]);
    const response = await quietly(() => run(visitedToday, press({ outcome: 'satisfactory' })));
    assert.equal((await response.json()).result, 'waiting');
    assert.equal(sent.length, 0);
  });

  it('the countersign tells the first Chair; a later press tells nobody', async () => {
    signInAs({ ...ADMIN, id: 'alex', name: 'Alex' });
    stubTransactions();
    const sent = capturePushes();
    const confirmed = {
      ...inspection,
      status: 'confirmed',
      secondAdminId: 'alex',
      secondAdminName: 'Alex',
    };
    stubExecute([{ id: VENUE_ID }]);
    stubDbSequence('update', [[], [confirmed], []]);
    stubDbSequence('select', [[], [inspection], [{ date: '2026-11-03' }], [confirmed]]);
    stubDb('insert', [{ ...visit, visitorId: 'alex', visitorName: 'Alex' }]);
    assert.equal((await quietly(() => run(visitedToday, press()))).status, 200);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].event.type, 'visit_confirmed');

    stubDb('update', []);
    stubDbSequence('select', [[confirmed], [confirmed]]);
    assert.equal((await quietly(() => run(visitedToday, press()))).status, 200);
    assert.equal(sent.length, 1);
  });

  it('a refused press sends nothing', async () => {
    signInAs({ ...ADMIN, id: 'alex' });
    stubTransactions();
    const sent = capturePushes();
    stubExecute([{ id: VENUE_ID }]);
    stubDb('update', []);
    stubDbSequence('select', [[], [inspection]]);
    assert.equal((await run(visitedToday, press({ outcome: 'below_par' }))).status, 409);
    assert.equal(sent.length, 0);
  });
});

describe('pushes from public suggestions', () => {
  const suggestion = (body: Record<string, unknown>) => ({
    request: adminRequest('POST', body, { path: '/api/suggestions' }),
    clientAddress: '203.0.113.7',
  });
  const input = { name: 'Pasty Palace', address: '14 Peter Street', rationale: 'Excellent.' };

  it('a stored suggestion notifies; a honeypot or rate-limited one does not', async () => {
    const sent = capturePushes();
    stubDbSequence('select', [[{ total: 0 }], [{ total: 0 }]]);
    stubDb('insert', []);
    assert.equal((await run(suggest, suggestion(input))).status, 201);
    assert.deepEqual(
      sent.map((push) => push.event),
      [{ type: 'suggestion' }]
    );

    assert.equal((await run(suggest, suggestion({ ...input, website: 'x' }))).status, 201);
    stubDbSequence('select', [[{ total: 99 }]]);
    assert.equal((await run(suggest, suggestion(input))).status, 429);
    assert.equal(sent.length, 1);
  });
});

describe('push API', () => {
  const configure = () => {
    process.env.VAPID_PUBLIC_KEY = 'BOr5x8vYbDkGhOO2K9Xx2SA7KQXSzc1V';
    process.env.VAPID_PRIVATE_KEY = 'a1b2c3d4e5f6';
    process.env.VAPID_SUBJECT = 'mailto:chairs@example.com';
  };
  const subscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
    keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQ', auth: 'tBHItJI5svbpez7KI4CCXg' },
    label: 'Mac · Chrome',
  };

  it('needs a signed-in Chair, from this site', async () => {
    signInAs(null);
    assert.equal((await run(pushConfig, { request: adminRequest('GET'), params: {} })).status, 401);
    signInAs();
    const foreign = adminRequest('POST', subscription, { origin: 'https://evil.example' });
    assert.equal((await run(saveSubscription, { request: foreign, params: {} })).status, 403);
  });

  it('reports whether push is configured', async () => {
    signInAs();
    let body = await (await run(pushConfig, { request: adminRequest('GET'), params: {} })).json();
    assert.deepEqual(body, { configured: false, publicKey: null });
    configure();
    body = await (await run(pushConfig, { request: adminRequest('GET'), params: {} })).json();
    assert.deepEqual(body, { configured: true, publicKey: 'BOr5x8vYbDkGhOO2K9Xx2SA7KQXSzc1V' });
  });

  it('validates a subscription: https endpoint, base64url keys', async () => {
    signInAs();
    configure();
    for (const bad of [
      { ...subscription, endpoint: 'http://fcm.googleapis.com/x' },
      { ...subscription, endpoint: 'not a url' },
      { ...subscription, keys: { ...subscription.keys, auth: 'has spaces!!' } },
      { endpoint: subscription.endpoint },
    ]) {
      const response = await run(saveSubscription, {
        request: adminRequest('POST', bad),
        params: {},
      });
      assert.equal(response.status, 400, JSON.stringify(bad));
    }
  });

  it('refuses to save a device while push is off', async () => {
    signInAs();
    const response = await run(saveSubscription, {
      request: adminRequest('POST', subscription),
      params: {},
    });
    assert.equal(response.status, 409);
  });

  it('saves for the caller, upserting by endpoint so the device moves to them', async () => {
    signInAs();
    configure();
    const inserts = stubDb('insert', []);
    stubDb('select', []);
    const response = await run(saveSubscription, {
      request: adminRequest('POST', subscription),
      params: {},
    });
    assert.equal(response.status, 200);
    const values = inserts.find((call) => call.method === 'values')!.args[0] as any;
    assert.equal(values.userId, ADMIN.id);
    assert.equal(values.endpoint, subscription.endpoint);
    const conflict = inserts.find((call) => call.method === 'onConflictDoUpdate')!.args[0] as any;
    assert.equal(conflict.set.userId, ADMIN.id);
  });

  it("removes only the caller's own device", async () => {
    signInAs();
    const deletes = stubDb('delete', [{ id: 'd1' }]);
    stubDb('select', []);
    const response = await run(removeSubscription, {
      request: adminRequest('DELETE', { endpoint: subscription.endpoint }),
      params: {},
    });
    assert.equal(response.status, 200);
    const where = renderSql(deletes.find((call) => call.method === 'where')!.args[0]);
    assert.match(where.sql, /"user_id" = \$\d/);
    assert.ok(where.params.includes(ADMIN.id));
  });

  it('validates preferences', async () => {
    signInAs();
    for (const bad of [{}, { proposals: 'yes' }]) {
      const response = await run(savePreferences, {
        request: adminRequest('PUT', bad),
        params: {},
      });
      assert.equal(response.status, 400);
    }
  });

  it('rate-limits test notifications', async () => {
    signInAs();
    configure();
    stubDb('insert', []);
    const response = await run(sendTest, { request: adminRequest('POST'), params: {} });
    assert.equal(response.status, 429);
  });
});
