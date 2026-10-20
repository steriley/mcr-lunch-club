import '../setup-env';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '@/pages/api/suggestions';
import * as byId from '@/pages/api/admin/suggestions/[id]';
import { POST as ACCEPT } from '@/pages/api/admin/suggestions/[id]/accept';
import { ADMIN, VENUE_ID, adminRequest, quietly, restoreStubs, run, signInAs, stubDb, stubDbSequence } from '../route-helpers';

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
  it('requires an admin', async () => {
    signInAs(null);
    assert.equal((await run(byId.PATCH, ctx('PATCH', VENUE_ID, { status: 'dismissed' }))).status, 401);
    assert.equal((await run(byId.DELETE, ctx('DELETE', VENUE_ID))).status, 401);
    assert.equal((await run(ACCEPT, ctx('POST', VENUE_ID))).status, 401);
  });

  it('404s for malformed ids', async () => {
    signInAs();
    assert.equal((await run(byId.PATCH, ctx('PATCH', 'nope', { status: 'dismissed' }))).status, 404);
    assert.equal((await run(byId.DELETE, ctx('DELETE', 'nope'))).status, 404);
    assert.equal((await run(ACCEPT, ctx('POST', 'nope'))).status, 404);
  });

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

  describe('POST accept', () => {
    it('creates a draft venue and returns its id', async () => {
      signInAs();
      // Load the suggestion, then check the slug is free.
      stubDbSequence('select', [[row], []]);
      stubDb('insert', [{ id: 'new-venue', createdAt, updatedAt: createdAt, latitude: null, longitude: null, distanceMiles: null }]);
      stubDb('update', []);
      const response = await run(ACCEPT, ctx('POST', VENUE_ID));
      assert.equal(response.status, 201);
      assert.deepEqual(await response.json(), { venueId: 'new-venue' });
    });

    it('404s for an unknown suggestion', async () => {
      signInAs();
      stubDb('select', []);
      assert.equal((await run(ACCEPT, ctx('POST', VENUE_ID))).status, 404);
    });

    it('refuses to draft the same suggestion twice', async () => {
      signInAs();
      stubDb('select', [{ ...row, venueId: 'existing' }]);
      assert.equal((await run(ACCEPT, ctx('POST', VENUE_ID))).status, 409);
    });
  });
});
