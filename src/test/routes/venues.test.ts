import '../setup-env';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '@/pages/api/admin/venues';
import * as byId from '@/pages/api/admin/venues/[id]';
import { fail, ok } from '@/lib/outcome';
import {
  ADMIN,
  VENUE_ID,
  adminRequest,
  quietly,
  restoreStubs,
  run,
  signInAs,
  stubLifecycle,
  stubPublishing,
} from '../route-helpers';

/** Route tests check request parsing and the status mapping; the behaviour is in the lifecycle's own tests. */

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
} as never;
const route = { distanceMiles: 0.4, walkingTimeMin: 9, error: null };
const input = { name: 'Chip Shop', slug: 'chip-shop', tier: 'approved', cost: '££' };

afterEach(restoreStubs);

const timelineEntry = {
  id: 'r1',
  kind: 'amendment' as const,
  when: '1 Nov 2026, 10:00',
  text: 'Amended by Sam: Name',
};

describe('POST /api/admin/venues', () => {
  const post = (body: unknown) => run(POST, { request: adminRequest('POST', body) });

  it('validates the body', async () => {
    signInAs();
    const response = await post({ name: '' });
    assert.equal(response.status, 400);
    assert.ok((await response.json()).fields.name);
    assert.equal((await post('{broken')).status, 400);
  });

  it('refuses to propose a new venue straight into Approved', async () => {
    signInAs();
    const response = await post({ ...input, proposedTier: 'approved' });
    assert.equal(response.status, 400);
    assert.ok((await response.json()).fields.proposedTier);
  });

  it('passes the venue, the verdict and the suggestion to the lifecycle, and answers 201', async () => {
    signInAs();
    const calls = stubLifecycle('createVenue', async () =>
      ok({ venue: row, proposal: { id: 'p1' } as never, route })
    );
    const suggestion = '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d';
    const response = await post({
      ...input,
      proposedTier: 'to_be_assessed',
      fromSuggestion: suggestion,
      latitude: 53.48,
      longitude: -2.25,
    });
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), {
      venue: JSON.parse(JSON.stringify((await import('@/lib/venues')).serializeVenue(row))),
      proposalId: 'p1',
      routeWarning: null,
    });
    const [, venueInput, options, actor] = calls[0].arguments;
    assert.equal(venueInput.slug, 'chip-shop');
    assert.ok(!('proposedTier' in venueInput), 'the verdict is an option, not a venue field');
    assert.ok(!('tier' in venueInput), 'a client-sent tier is ignored');
    assert.deepEqual(options, { proposedTier: 'to_be_assessed', fromSuggestion: suggestion });
    assert.equal(actor.id, ADMIN.id);
  });

  it('maps the lifecycle’s refusals', async () => {
    signInAs();
    stubLifecycle('createVenue', async () => fail('slug_taken'));
    const taken = await post(input);
    assert.equal(taken.status, 409);
    assert.ok((await taken.json()).fields.slug);

    stubLifecycle('createVenue', async () => fail('suggestion_unavailable'));
    const gone = await post(input);
    assert.equal(gone.status, 409);
    assert.match((await gone.json()).error, /already been accepted or dismissed/);

    stubLifecycle('createVenue', async () => fail('pending_by_other'));
    const refused = await post(input);
    assert.equal(refused.status, 409);
    const body = await refused.json();
    assert.equal(
      body.fields.proposedTier,
      body.error,
      'a refused verdict points at the verdict field'
    );
  });

  it('returns 500 on other errors', async () => {
    signInAs();
    stubLifecycle('createVenue', async () => {
      throw new Error('db down');
    });
    assert.equal((await quietly(() => post(input))).status, 500);
  });
});

describe('/api/admin/venues/[id]', () => {
  const ctx = (method: string, id: string | undefined, body?: unknown) => ({
    request: adminRequest(method, body),
    params: { id },
  });

  describe('PUT', () => {
    it('validates the body and the id', async () => {
      signInAs();
      assert.equal((await run(byId.PUT, ctx('PUT', VENUE_ID, { name: '' }))).status, 400);
      assert.equal((await run(byId.PUT, ctx('PUT', 'nope', input))).status, 404);
    });

    it('saves through the lifecycle, reports the route and records the change it names', async () => {
      signInAs();
      const calls = stubLifecycle('updateVenue', async () =>
        ok(
          { venue: row, route, timelineEntry },
          { action: 'Update venue', venueId: VENUE_ID, when: 'queue' }
        )
      );
      const inserts = stubPublishing(3);
      const response = await run(byId.PUT, ctx('PUT', VENUE_ID, input));
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.venue.name, 'Chip Shop');
      assert.equal(body.routeWarning, null);
      assert.deepEqual(body.timelineEntry, timelineEntry);
      assert.equal(calls[0].arguments[1], VENUE_ID);
      assert.equal(response.headers.get('X-Unpublished-Changes'), '3');
      assert.equal(
        (inserts.find((call) => call.method === 'values')!.args[0] as any).venueId,
        VENUE_ID
      );
    });

    it('ignores distance and walking time sent by the client', async () => {
      signInAs();
      const calls = stubLifecycle('updateVenue', async () =>
        ok({ venue: row, route, timelineEntry })
      );
      stubPublishing();
      await run(byId.PUT, ctx('PUT', VENUE_ID, { ...input, distanceMiles: 3, walkingTimeMin: 4 }));
      const sent = calls[0].arguments[2] as Record<string, unknown>;
      assert.ok(!('distanceMiles' in sent) && !('walkingTimeMin' in sent));
    });

    it('warns when the route is pending', async () => {
      signInAs();
      stubLifecycle('updateVenue', async () =>
        ok({
          venue: row,
          route: {
            distanceMiles: null,
            walkingTimeMin: null,
            error: { kind: 'rate_limited' } as never,
          },
          timelineEntry,
        })
      );
      stubPublishing();
      const response = await run(byId.PUT, ctx('PUT', VENUE_ID, input));
      assert.match((await response.json()).routeWarning, /rate limited/);
    });

    it('maps 404, 409 and 500', async () => {
      signInAs();
      stubLifecycle('updateVenue', async () => fail('venue_not_found'));
      assert.equal((await run(byId.PUT, ctx('PUT', VENUE_ID, input))).status, 404);
      stubLifecycle('updateVenue', async () => fail('slug_taken'));
      assert.equal((await run(byId.PUT, ctx('PUT', VENUE_ID, input))).status, 409);
      stubLifecycle('updateVenue', async () => {
        throw new Error('db down');
      });
      assert.equal((await quietly(() => run(byId.PUT, ctx('PUT', VENUE_ID, input)))).status, 500);
    });
  });

  describe('DELETE', () => {
    it('deletes through the lifecycle and records the venue it named, even though it is gone', async () => {
      signInAs();
      const calls = stubLifecycle('deleteVenue', async () =>
        ok(null, {
          action: 'Delete venue',
          venueId: VENUE_ID,
          venueName: 'Chip Shop',
          when: 'queue',
        })
      );
      const inserts = stubPublishing();
      const response = await run(byId.DELETE, ctx('DELETE', VENUE_ID));
      assert.deepEqual(await response.json(), { ok: true });
      assert.equal(calls[0].arguments[2], VENUE_ID);
      const recorded = inserts.find((call) => call.method === 'values')!.args[0] as any;
      assert.deepEqual([recorded.venueId, recorded.venueName], [VENUE_ID, 'Chip Shop']);
    });

    it('404s, or 500s', async () => {
      signInAs();
      stubLifecycle('deleteVenue', async () => fail('venue_not_found'));
      assert.equal((await run(byId.DELETE, ctx('DELETE', VENUE_ID))).status, 404);
      stubLifecycle('deleteVenue', async () => {
        throw new Error('db down');
      });
      assert.equal((await quietly(() => run(byId.DELETE, ctx('DELETE', VENUE_ID)))).status, 500);
    });
  });
});
