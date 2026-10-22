import '../setup-env';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '@/pages/api/suggestions';
import * as byId from '@/pages/api/admin/suggestions/[id]';
import { POST as CREATE_VENUE } from '@/pages/api/admin/venues';
import { ADMIN, VENUE_ID, adminRequest, quietly, restoreStubs, run, signInAs, stubDb, stubDbSequence, stubTransactions } from '../route-helpers';

afterEach(restoreStubs);

const createdAt = new Date('2026-10-20T11:00:00.000Z');
const input = { name: 'Pasty Palace', address: '14 Peter Street', rationale: 'Fast, cheap and excellent.' };
const row = { id: VENUE_ID, ...input, status: 'new', venueId: null, senderHash: 'secret', createdAt, reviewedAt: null };

/** The public form posts from the site itself; `clientAddress` mimics Astro's getter. */
function publicContext(body: unknown, options: { origin?: string | null; ip?: string | null; forwardedFor?: string } = {}) {
  const request = adminRequest('POST', body, { origin: options.origin, path: '/api/suggestions' });
  if (options.forwardedFor) request.headers.set('x-forwarded-for', options.forwardedFor);
  return {
    request,
    get clientAddress(): string {
      if (options.ip === null) throw new Error('clientAddress is not available');
      return options.ip ?? '203.0.113.7';
    },
  };
}

const notLimited = () => stubDbSequence('select', [[{ total: 0 }], [{ total: 0 }]]);

describe('POST /api/suggestions', () => {
  it('refuses other origins and requests without one', async () => {
    assert.equal((await run(POST, publicContext(input, { origin: 'https://attacker.example' }))).status, 403);
    assert.equal((await run(POST, publicContext(input, { origin: null }))).status, 403);
  });

  it('validates the body', async () => {
    const response = await run(POST, publicContext({ name: '' }));
    assert.equal(response.status, 400);
    assert.ok((await response.json()).fields.name);
  });

  it('stores a suggestion with a hashed sender, never the raw address', async () => {
    notLimited();
    const inserts = stubDb('insert', []);
    const response = await run(POST, publicContext({ ...input, website: '' }));
    assert.equal(response.status, 201);

    const values = inserts.find((call) => call.method === 'values')!.args[0] as any;
    assert.equal(values.name, 'Pasty Palace');
    assert.match(values.senderHash, /^[0-9a-f]{32}$/);
    assert.equal('website' in values, false);
    assert.ok(!JSON.stringify(values).includes('203.0.113.7'));
  });

  it('falls back to x-forwarded-for when the host cannot supply the client address', async () => {
    notLimited();
    const inserts = stubDb('insert', []);
    const response = await run(POST, publicContext(input, { ip: null, forwardedFor: '198.51.100.1, 10.0.0.1' }));
    assert.equal(response.status, 201);
    assert.ok((inserts.find((call) => call.method === 'values')!.args[0] as any).senderHash);
  });

  it('pretends to accept honeypot submissions without storing them', async () => {
    const inserts = stubDb('insert', []);
    const response = await run(POST, publicContext({ ...input, website: 'http://spam.example' }));
    assert.equal(response.status, 201);
    assert.equal(inserts.length, 0);
  });

  it('returns 429 when rate limited, without storing', async () => {
    stubDbSequence('select', [[{ total: 0 }], [{ total: 99 }]]);
    const inserts = stubDb('insert', []);
    assert.equal((await run(POST, publicContext(input))).status, 429);
    assert.equal(inserts.length, 0);
  });

  it('returns 500 on database errors', async () => {
    stubDb('select', new Error('db down'));
    assert.equal((await quietly(() => run(POST, publicContext(input)))).status, 500);
  });
});

const ctx = (method: string, id: string | undefined, body?: unknown) => ({ request: adminRequest(method, body), params: { id } });

describe('/api/admin/suggestions/[id]', () => {
  describe('PATCH', () => {
    it('dismisses, recording who reviewed it', async () => {
      signInAs();
      const updates = stubDb('update', [{ ...row, status: 'dismissed', reviewedAt: createdAt }]);
      const response = await run(byId.PATCH, ctx('PATCH', VENUE_ID, { status: 'dismissed' }));
      assert.equal(response.status, 200);
      assert.equal((await response.json()).suggestion.status, 'dismissed');
      const set = updates.find((call) => call.method === 'set')!.args[0] as any;
      assert.equal(set.reviewedBy, ADMIN.id);
      assert.ok(set.reviewedAt instanceof Date);
    });

    it('restoring clears the review', async () => {
      signInAs();
      const updates = stubDb('update', [row]);
      await run(byId.PATCH, ctx('PATCH', VENUE_ID, { status: 'new' }));
      const set = updates.find((call) => call.method === 'set')!.args[0] as any;
      assert.equal(set.reviewedBy, null);
      assert.equal(set.reviewedAt, null);
    });

    it('rejects other statuses and unknown ids', async () => {
      signInAs();
      assert.equal((await run(byId.PATCH, ctx('PATCH', VENUE_ID, { status: 'accepted' }))).status, 400);
      stubDb('update', []);
      assert.equal((await run(byId.PATCH, ctx('PATCH', VENUE_ID, { status: 'dismissed' }))).status, 404);
    });
  });

  describe('DELETE', () => {
    it('deletes, 404s when missing and 500s on errors', async () => {
      signInAs();
      stubDb('delete', [{ id: VENUE_ID }]);
      assert.equal((await run(byId.DELETE, ctx('DELETE', VENUE_ID))).status, 200);
      stubDb('delete', []);
      assert.equal((await run(byId.DELETE, ctx('DELETE', VENUE_ID))).status, 404);
      stubDb('delete', new Error('db down'));
      assert.equal((await quietly(() => run(byId.DELETE, ctx('DELETE', VENUE_ID)))).status, 500);
    });
  });

  describe('accepting through the venue form (POST /api/admin/venues with fromSuggestion)', () => {
    const SUGGESTION_ID = '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';
    const venueBody = { name: 'Pasty Palace', slug: 'pasty-palace', cost: '£', latitude: 53.477, longitude: -2.247, fromSuggestion: SUGGESTION_ID };
    const created = { id: 'new-venue', slug: 'pasty-palace', tier: null, createdAt, updatedAt: createdAt, latitude: '53.477000', longitude: '-2.247000', distanceMiles: null, closedAt: null };

    it('needs a picked or manually entered location', async () => {
      signInAs();
      const response = await run(CREATE_VENUE, { request: adminRequest('POST', { ...venueBody, latitude: null, longitude: null }) });
      assert.equal(response.status, 400);
      assert.match((await response.json()).fields.latitude, /location search/);
    });

    it('creates a hidden venue with a To Be Assessed proposal and marks the suggestion accepted, in one transaction', async () => {
      signInAs();
      const transactions = stubTransactions();
      // slug check, then the proposal's venue lock and pending lookup
      stubDbSequence('select', [[], [created], []]);
      const inserts = stubDbSequence('insert', [[created], [], [{ id: 'proposal-1' }]]);
      const updates = stubDb('update', [{ id: SUGGESTION_ID }]);
      // The client asks for Rejected; accepted suggestions are always To Be Assessed.
      const response = await run(CREATE_VENUE, { request: adminRequest('POST', { ...venueBody, proposedTier: 'rejected' }) });
      assert.equal(response.status, 201);
      assert.equal((await response.json()).proposalId, 'proposal-1');
      assert.equal(transactions.count, 1);

      const values = inserts.filter((call) => call.method === 'values').map((call) => call.args[0] as any);
      assert.ok(!('tier' in values[0]), 'the venue has no approved tier');
      assert.equal(values[2].proposedTier, 'to_be_assessed');
      assert.equal(values[2].proposedBy, ADMIN.id);

      const set = updates.find((call) => call.method === 'set')!.args[0] as any;
      assert.equal(set.status, 'accepted');
      assert.equal(set.venueId, 'new-venue');
      assert.equal(set.reviewedBy, ADMIN.id);
      assert.ok(set.reviewedAt instanceof Date);
    });

    it('saves nothing when the suggestion was already accepted or dismissed', async () => {
      signInAs();
      stubTransactions();
      stubDbSequence('select', [[], [created], []]);
      stubDbSequence('insert', [[created], [], [{ id: 'proposal-1' }]]);
      stubDb('update', []);
      const response = await run(CREATE_VENUE, { request: adminRequest('POST', venueBody) });
      assert.equal(response.status, 409);
      assert.match((await response.json()).error, /Nothing was saved/);
    });
  });
});
