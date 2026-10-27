import '../setup-env';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '@/pages/api/admin/venues';
import * as byId from '@/pages/api/admin/venues/[id]';
import { db } from '@/lib/db';
import { blobClient } from '@/lib/venue-image-storage';
import {
  ADMIN,
  VENUE_ID,
  adminRequest,
  fakeQuery,
  quietly,
  renderSql,
  restoreStubs,
  run,
  signInAs,
  stubDb,
  stubDbSequence,
  stubTransactions,
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

describe('POST /api/admin/venues', () => {
  const post = (body: unknown) => run(POST, { request: adminRequest('POST', body) });

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

  it('creates a hidden venue (no tier) and records a revision, in a transaction', async () => {
    signInAs();
    const transactions = stubTransactions();
    stubDb('select', []);
    const inserts = stubDbSequence('insert', [[row], []]);
    const response = await post({ ...input, tier: 'approved' });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.venue.slug, 'chip-shop');
    assert.equal(body.proposalId, null);
    assert.equal(transactions.count, 1);
    const values = inserts.filter((call) => call.method === 'values').map((call) => call.args[0] as any);
    assert.equal(values[0].updatedBy, ADMIN.id);
    assert.ok(!('tier' in values[0]), 'a client-sent tier is ignored');
    assert.equal(values[1].venueId, VENUE_ID);
  });

  it('turns the chosen tier into a pending proposal by the creator', async () => {
    signInAs({ ...ADMIN, name: 'Sam' });
    stubTransactions();
    // slug check, then the proposal's venue lock and pending lookup
    stubDbSequence('select', [[], [{ ...row, tier: null }], []]);
    const proposal = { id: 'p1', venueId: VENUE_ID, proposedTier: 'to_be_assessed', status: 'pending' };
    const inserts = stubDbSequence('insert', [[row], [], [proposal]]);
    const response = await post({ ...input, proposedTier: 'to_be_assessed' });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).proposalId, 'p1');
    const proposalValues = inserts.filter((call) => call.method === 'values').map((call) => call.args[0] as any)[2];
    assert.deepEqual(
      { tier: proposalValues.proposedTier, from: proposalValues.fromTier, by: proposalValues.proposedBy, name: proposalValues.proposedByName, status: proposalValues.status },
      { tier: 'to_be_assessed', from: null, by: ADMIN.id, name: 'Sam', status: 'pending' }
    );
  });

  it('refuses to propose a new venue straight into Approved', async () => {
    signInAs();
    const response = await post({ ...input, proposedTier: 'approved' });
    assert.equal(response.status, 400);
    assert.ok((await response.json()).fields.proposedTier);
  });

  it('maps a unique violation race to a 409', async () => {
    signInAs();
    stubTransactions();
    stubDb('select', []);
    stubDb('insert', Object.assign(new Error('dup'), { code: '23505' }));
    assert.equal((await post(input)).status, 409);
  });

  it('returns 500 on other database errors', async () => {
    signInAs();
    stubTransactions();
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

  describe('PUT', () => {
    let transactions: { count: number };
    beforeEach(() => {
      transactions = stubTransactions();
    });

    it('validates the body', async () => {
      signInAs();
      assert.equal((await run(byId.PUT, ctx('PUT', VENUE_ID, { name: '' }))).status, 400);
    });

    it('rejects a slug used by another venue', async () => {
      signInAs();
      stubDb('select', [{ id: 'other' }]);
      assert.equal((await run(byId.PUT, ctx('PUT', VENUE_ID, input))).status, 409);
    });

    it('does not count the venue being edited as a slug clash', async () => {
      signInAs();
      const selects = stubDb('select', []);
      stubDb('update', [row]);
      stubDb('insert', []);
      await run(byId.PUT, ctx('PUT', VENUE_ID, input));
      const { sql, params } = renderSql(selects.find((call) => call.method === 'where')!.args[0]);
      assert.match(sql, /"venues"\."id" <> \$2/);
      assert.deepEqual(params, ['chip-shop', VENUE_ID]);
    });

    const stored = { latitude: '53.480000', longitude: '-2.250000', distanceMiles: '0.40', walkingTimeMin: 9, routeUpdatedAt: new Date('2026-10-01T00:00:00Z') };

    it('updates the venue and records a revision', async () => {
      signInAs();
      stubDbSequence('select', [[], [stored]]);
      stubDb('update', [row]);
      const inserts = stubDb('insert', []);
      const response = await run(byId.PUT, ctx('PUT', VENUE_ID, input));
      assert.equal(response.status, 200);
      assert.equal((await response.json()).venue.name, 'Chip Shop');
      assert.ok(inserts.some((call) => call.method === 'values'));
      assert.equal(transactions.count, 1, 'the row and its revision are written together');
    });

    it('returns 404 when the venue no longer exists', async () => {
      signInAs();
      stubDb('select', []);
      stubDb('update', []);
      assert.equal((await run(byId.PUT, ctx('PUT', VENUE_ID, input))).status, 404);
    });

    it('maps unique violations to 409 and other errors to 500', async () => {
      signInAs();
      stubDbSequence('select', [[], [stored]]);
      stubDb('update', Object.assign(new Error('dup'), { code: '23505' }));
      assert.equal((await run(byId.PUT, ctx('PUT', VENUE_ID, input))).status, 409);

      stubDbSequence('select', [[], [stored]]);
      stubDb('update', new Error('db down'));
      assert.equal((await quietly(() => run(byId.PUT, ctx('PUT', VENUE_ID, input)))).status, 500);
    });

    describe('walking route', () => {
      const located = { ...input, latitude: 53.481, longitude: -2.249 };
      let restoreFetch: () => void = () => {};
      afterEach(() => restoreFetch());

      function stubFetch(handler: () => Response | Promise<Response>) {
        const original = globalThis.fetch;
        const calls: string[] = [];
        process.env.ORS_API_KEY = 'test-ors-key';
        globalThis.fetch = (async (url: string | URL) => {
          calls.push(String(url));
          return handler();
        }) as typeof fetch;
        restoreFetch = () => {
          globalThis.fetch = original;
          delete process.env.ORS_API_KEY;
        };
        return calls;
      }

      const setValues = (updates: ReturnType<typeof stubDb>) => updates.find((call) => call.method === 'set')!.args[0] as any;

      it('computes distance and walking time from ORS when the coordinates change', async () => {
        signInAs();
        const fetches = stubFetch(() => Response.json({ routes: [{ summary: { distance: 1609.344, duration: 1170 } }] }));
        stubDbSequence('select', [[], [stored]]);
        const updates = stubDb('update', [row]);
        stubDb('insert', []);
        const response = await run(byId.PUT, ctx('PUT', VENUE_ID, located));
        assert.equal(response.status, 200);
        assert.equal((await response.json()).routeWarning, null);
        assert.equal(fetches.length, 1);
        assert.match(fetches[0], /\/v2\/directions\/foot-walking$/);
        assert.equal(setValues(updates).distanceMiles, '1.00');
        assert.equal(setValues(updates).walkingTimeMin, 24);
      });

      it('keeps the stored route without calling ORS when the coordinates are unchanged', async () => {
        signInAs();
        const fetches = stubFetch(() => Response.json({}));
        stubDbSequence('select', [[], [stored]]);
        const updates = stubDb('update', [row]);
        stubDb('insert', []);
        await run(byId.PUT, ctx('PUT', VENUE_ID, { ...input, latitude: 53.48, longitude: -2.25 }));
        assert.equal(fetches.length, 0);
        assert.equal(setValues(updates).distanceMiles, '0.40');
        assert.equal(setValues(updates).walkingTimeMin, 9);
      });

      it('still saves, with the route pending, when ORS is rate limited', async () => {
        signInAs();
        stubFetch(() => new Response('{}', { status: 429 }));
        stubDbSequence('select', [[], [stored]]);
        const updates = stubDb('update', [row]);
        stubDb('insert', []);
        const response = await run(byId.PUT, ctx('PUT', VENUE_ID, located));
        assert.equal(response.status, 200);
        assert.match((await response.json()).routeWarning, /rate limited/);
        assert.equal(setValues(updates).distanceMiles, null);
        assert.equal(setValues(updates).walkingTimeMin, null);
        assert.equal(setValues(updates).latitude, '53.481000');
      });

      it('ignores distance and walking time sent by the client', async () => {
        signInAs();
        stubDbSequence('select', [[], [{ ...stored, latitude: null, longitude: null, distanceMiles: null, walkingTimeMin: null }]]);
        const updates = stubDb('update', [row]);
        stubDb('insert', []);
        await run(byId.PUT, ctx('PUT', VENUE_ID, { ...input, distanceMiles: 3, walkingTimeMin: 4 }));
        assert.equal(setValues(updates).distanceMiles, null);
        assert.equal(setValues(updates).walkingTimeMin, null);
      });
    });
  });

  describe('DELETE', () => {
    it('deletes, 404s, or 500s', async () => {
      signInAs();
      stubDb('select', []);
      stubDb('delete', [{ id: VENUE_ID }]);
      const ok = await run(byId.DELETE, ctx('DELETE', VENUE_ID));
      assert.deepEqual(await ok.json(), { ok: true });

      stubDb('delete', []);
      assert.equal((await run(byId.DELETE, ctx('DELETE', VENUE_ID))).status, 404);

      stubDb('delete', new Error('db down'));
      assert.equal((await quietly(() => run(byId.DELETE, ctx('DELETE', VENUE_ID)))).status, 500);
    });

    it('collects the photos, deletes the venue, then best-effort deletes only our own blobs', async () => {
      signInAs();
      const owned = 'https://store123.public.blob.vercel-storage.com/prod/venues/v/i-full.webp';
      const ownedThumb = 'https://store123.public.blob.vercel-storage.com/prod/venues/v/i-thumb.webp';
      const order: string[] = [];
      const database = db as any;
      const originalDb = { select: database.select, delete: database.delete };
      const patchDb = (method: 'select' | 'delete', fn: () => unknown) => (database[method] = fn);
      patchDb('select', () => {
        order.push('select');
        return fakeQuery([
          { fullUrl: owned, thumbUrl: ownedThumb },
          { fullUrl: 'https://example.com/migrated.jpg', thumbUrl: null },
        ]).builder;
      });
      patchDb('delete', () => {
        order.push('delete');
        return fakeQuery([{ id: VENUE_ID }]).builder;
      });
      const deleted: string[][] = [];
      const originalDel = blobClient.del;
      const savedToken = process.env.BLOB_READ_WRITE_TOKEN;
      process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_testStore_secret';
      (blobClient as any).del = async (urls: string[]) => {
        order.push('del');
        deleted.push(urls);
        throw new Error('blob store down');
      };
      try {
        const response = await quietly(() => run(byId.DELETE, ctx('DELETE', VENUE_ID)));
        assert.equal(response.status, 200, 'a failed blob delete does not fail the venue delete');
        assert.deepEqual(order, ['select', 'delete', 'del']);
        assert.deepEqual(deleted, [[owned, ownedThumb]]);
      } finally {
        Object.assign(database, originalDb);
        blobClient.del = originalDel;
        if (savedToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
        else process.env.BLOB_READ_WRITE_TOKEN = savedToken;
      }
    });

    it('does not touch Blob when the venue is missing', async () => {
      signInAs();
      stubDb('select', [{ fullUrl: 'https://store123.public.blob.vercel-storage.com/x.webp', thumbUrl: null }]);
      stubDb('delete', []);
      const originalDel = blobClient.del;
      let called = false;
      (blobClient as any).del = async () => {
        called = true;
      };
      try {
        assert.equal((await run(byId.DELETE, ctx('DELETE', VENUE_ID))).status, 404);
        assert.equal(called, false);
      } finally {
        blobClient.del = originalDel;
      }
    });
  });
});
