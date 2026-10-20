import '../setup-env';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GET, POST } from '@/pages/api/admin/venues';
import * as byId from '@/pages/api/admin/venues/[id]';
import { POST as publish } from '@/pages/api/admin/venues/[id]/publish';
import { POST as unpublish } from '@/pages/api/admin/venues/[id]/unpublish';
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
} from '../route-helpers';

const now = new Date('2026-01-01T00:00:00.000Z');
const row = {
  id: VENUE_ID,
  slug: 'chip-shop',
  name: 'Chip Shop',
  tier: 'approved',
  latitude: '53.480000',
  longitude: '-2.250000',
  distanceMiles: '0.40',
  createdAt: now,
  updatedAt: now,
};
const input = { name: 'Chip Shop', slug: 'chip-shop', tier: 'approved', cost: '££' };

afterEach(restoreStubs);

describe('GET /api/admin/venues', () => {
  it('requires an admin', async () => {
    signInAs(null);
    assert.equal((await run(GET, { request: adminRequest('GET'), url: new URL('https://x.test/') })).status, 401);
    signInAs({ id: 'u', role: 'user' });
    assert.equal((await run(GET, { request: adminRequest('GET'), url: new URL('https://x.test/') })).status, 403);
  });

  it('lists serialised venues and applies filters', async () => {
    signInAs();
    const calls = stubDb('select', [row]);
    const url = new URL('https://x.test/?query=100%25_chips&tier=Approved&status=published');
    const response = await run(GET, { request: adminRequest('GET'), url });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.venues.length, 1);
    assert.equal(body.venues[0].latitude, 53.48);
    assert.equal(body.venues[0].createdAt, now.toISOString());
    assert.ok(calls.some((call) => call.method === 'where' && call.args[0] !== undefined));
  });

  it('supports the draft filter and no filters at all', async () => {
    signInAs();
    let calls = stubDb('select', []);
    await run(GET, { request: adminRequest('GET'), url: new URL('https://x.test/?status=draft') });
    assert.ok(calls.some((call) => call.method === 'where' && call.args[0] !== undefined));

    calls = stubDb('select', []);
    await run(GET, { request: adminRequest('GET'), url: new URL('https://x.test/') });
    assert.ok(calls.some((call) => call.method === 'where' && call.args[0] === undefined));
  });

  it('returns 500 on database errors', async () => {
    signInAs();
    stubDb('select', new Error('db down'));
    const response = await quietly(() => run(GET, { request: adminRequest('GET'), url: new URL('https://x.test/') }));
    assert.equal(response.status, 500);
  });
});

describe('POST /api/admin/venues', () => {
  const post = (body: unknown) => run(POST, { request: adminRequest('POST', body) });

  it('rejects untrusted origins', async () => {
    signInAs();
    const request = adminRequest('POST', input, { origin: 'https://evil.example' });
    assert.equal((await run(POST, { request })).status, 403);
  });

  it('validates the body', async () => {
    signInAs();
    const response = await post({ name: '' });
    assert.equal(response.status, 400);
    assert.ok((await response.json()).fields.name);
    assert.equal((await post('{broken')).status, 400);
  });

  it('rejects a slug that is already taken', async () => {
    signInAs();
    stubDb('select', [{ id: 'other' }]);
    const response = await post(input);
    assert.equal(response.status, 409);
    assert.ok((await response.json()).fields.slug);
  });

  it('creates the venue and records a revision', async () => {
    signInAs();
    stubDb('select', []);
    const inserts = stubDbSequence('insert', [[row], []]);
    const response = await post(input);
    assert.equal(response.status, 201);
    assert.equal((await response.json()).venue.slug, 'chip-shop');
    const values = inserts.filter((call) => call.method === 'values').map((call) => call.args[0] as any);
    assert.equal(values[0].updatedBy, ADMIN.id);
    assert.equal(values[1].venueId, VENUE_ID);
  });

  it('maps a unique violation race to a 409', async () => {
    signInAs();
    stubDb('select', []);
    stubDb('insert', Object.assign(new Error('dup'), { code: '23505' }));
    assert.equal((await post(input)).status, 409);
  });

  it('returns 500 on other database errors', async () => {
    signInAs();
    stubDb('select', []);
    stubDb('insert', new Error('db down'));
    assert.equal((await quietly(() => post(input))).status, 500);
  });
});

describe('/api/admin/venues/[id]', () => {
  const ctx = (method: string, id: string | undefined, body?: unknown) => ({
    request: adminRequest(method, body),
    params: { id },
  });

  it('returns 404 for malformed ids on every method', async () => {
    signInAs();
    assert.equal((await run(byId.GET, ctx('GET', 'nope'))).status, 404);
    assert.equal((await run(byId.PUT, ctx('PUT', 'nope', input))).status, 404);
    assert.equal((await run(byId.DELETE, ctx('DELETE', 'nope'))).status, 404);
    assert.equal((await run(publish, ctx('POST', 'nope'))).status, 404);
    assert.equal((await run(unpublish, ctx('POST', 'nope'))).status, 404);
  });

  it('requires an admin', async () => {
    signInAs(null);
    assert.equal((await run(byId.GET, ctx('GET', VENUE_ID))).status, 401);
    assert.equal((await run(byId.PUT, ctx('PUT', VENUE_ID, input))).status, 401);
    assert.equal((await run(byId.DELETE, ctx('DELETE', VENUE_ID))).status, 401);
    assert.equal((await run(publish, ctx('POST', VENUE_ID))).status, 401);
  });

  describe('GET', () => {
    it('returns the venue, 404, or 500', async () => {
      signInAs();
      stubDb('select', [row]);
      const found = await run(byId.GET, ctx('GET', VENUE_ID));
      assert.equal(found.status, 200);
      assert.equal((await found.json()).venue.id, VENUE_ID);

      stubDb('select', []);
      assert.equal((await run(byId.GET, ctx('GET', VENUE_ID))).status, 404);

      stubDb('select', new Error('db down'));
      assert.equal((await quietly(() => run(byId.GET, ctx('GET', VENUE_ID)))).status, 500);
    });
  });

  describe('PUT', () => {
    it('validates the body', async () => {
      signInAs();
      assert.equal((await run(byId.PUT, ctx('PUT', VENUE_ID, { name: '' }))).status, 400);
    });

    it('rejects a slug used by another venue', async () => {
      signInAs();
      stubDb('select', [{ id: 'other' }]);
      assert.equal((await run(byId.PUT, ctx('PUT', VENUE_ID, input))).status, 409);
    });

    it('updates the venue and records a revision', async () => {
      signInAs();
      stubDb('select', []);
      stubDb('update', [row]);
      const inserts = stubDb('insert', []);
      const response = await run(byId.PUT, ctx('PUT', VENUE_ID, input));
      assert.equal(response.status, 200);
      assert.equal((await response.json()).venue.name, 'Chip Shop');
      assert.ok(inserts.some((call) => call.method === 'values'));
    });

    it('returns 404 when the venue no longer exists', async () => {
      signInAs();
      stubDb('select', []);
      stubDb('update', []);
      assert.equal((await run(byId.PUT, ctx('PUT', VENUE_ID, input))).status, 404);
    });

    it('maps unique violations to 409 and other errors to 500', async () => {
      signInAs();
      stubDb('select', []);
      stubDb('update', Object.assign(new Error('dup'), { code: '23505' }));
      assert.equal((await run(byId.PUT, ctx('PUT', VENUE_ID, input))).status, 409);

      stubDb('update', new Error('db down'));
      assert.equal((await quietly(() => run(byId.PUT, ctx('PUT', VENUE_ID, input)))).status, 500);
    });
  });

  describe('DELETE', () => {
    it('deletes, 404s, or 500s', async () => {
      signInAs();
      stubDb('delete', [{ id: VENUE_ID }]);
      const ok = await run(byId.DELETE, ctx('DELETE', VENUE_ID));
      assert.deepEqual(await ok.json(), { ok: true });

      stubDb('delete', []);
      assert.equal((await run(byId.DELETE, ctx('DELETE', VENUE_ID))).status, 404);

      stubDb('delete', new Error('db down'));
      assert.equal((await quietly(() => run(byId.DELETE, ctx('DELETE', VENUE_ID)))).status, 500);
    });
  });

  describe('publish and unpublish', () => {
    it('set the published flag and record a revision', async () => {
      signInAs();
      for (const [handler, flag] of [[publish, true], [unpublish, false]] as const) {
        const updates = stubDb('update', [{ ...row, published: flag }]);
        const inserts = stubDb('insert', []);
        const response = await run(handler, ctx('POST', VENUE_ID));
        assert.equal(response.status, 200);
        const set = updates.find((call) => call.method === 'set')!.args[0] as any;
        assert.equal(set.published, flag);
        assert.equal(set.updatedBy, ADMIN.id);
        assert.ok(inserts.some((call) => call.method === 'values'));
      }
    });

    it('404 when the venue is missing and 500 on database errors', async () => {
      signInAs();
      stubDb('update', []);
      assert.equal((await run(publish, ctx('POST', VENUE_ID))).status, 404);

      stubDb('update', new Error('db down'));
      assert.equal((await quietly(() => run(publish, ctx('POST', VENUE_ID)))).status, 500);
      assert.equal((await quietly(() => run(unpublish, ctx('POST', VENUE_ID)))).status, 500);
    });
  });
});
