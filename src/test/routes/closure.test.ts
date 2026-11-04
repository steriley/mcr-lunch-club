import '../setup-env';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { POST as close } from '@/pages/api/admin/venues/[id]/close';
import { POST as reopen } from '@/pages/api/admin/venues/[id]/reopen';
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
} as never;
const ctx = (id: string = VENUE_ID, origin?: string) => ({
  request: adminRequest('POST', undefined, { origin }),
  params: { id },
});

describe('POST /api/admin/venues/[id]/close and /reopen', () => {
  it('closes through the lifecycle, and publishes now', async () => {
    signInAs();
    const calls = stubLifecycle('closeVenue', async () =>
      ok(row, { action: 'Close venue', venueId: VENUE_ID, when: 'now' })
    );
    const inserts = stubPublishing();
    const response = await run(close, ctx());
    assert.equal(response.status, 200);
    assert.ok((await response.json()).venue.closedAt);
    assert.equal(calls[0].arguments[1], VENUE_ID);
    assert.equal(calls[0].arguments[2].id, ADMIN.id);
    const recorded = inserts
      .filter((call) => call.method === 'values')
      .map((c) => c.args[0] as any);
    assert.equal(recorded[0].action, 'Close venue');
    assert.equal(recorded[0].venueId, VENUE_ID);
  });

  it('reopens through the lifecycle', async () => {
    signInAs();
    const calls = stubLifecycle('reopenVenue', async () =>
      ok({ ...(row as object), closedAt: null } as never, {
        action: 'Reopen venue',
        venueId: VENUE_ID,
        when: 'now',
      })
    );
    stubPublishing();
    const response = await run(reopen, ctx());
    assert.equal(response.status, 200);
    assert.equal((await response.json()).venue.closedAt, null);
    assert.equal(calls.length, 1);
  });

  it('409s when the venue is already in that state, and 404s when it is missing', async () => {
    signInAs();
    stubLifecycle('closeVenue', async () => fail('already_closed'));
    stubLifecycle('reopenVenue', async () => fail('not_closed'));
    const closed = await run(close, ctx());
    assert.deepEqual(
      [closed.status, (await closed.json()).error],
      [409, 'This venue is already marked closed.']
    );
    const open = await run(reopen, ctx());
    assert.deepEqual([open.status, (await open.json()).error], [409, 'This venue is not closed.']);

    stubLifecycle('closeVenue', async () => fail('venue_not_found'));
    assert.equal((await run(close, ctx())).status, 404);
    assert.equal((await run(close, ctx('nope'))).status, 404, 'before the lifecycle is asked');
  });

  it('records nothing for a refusal', async () => {
    signInAs();
    stubLifecycle('closeVenue', async () => fail('already_closed'));
    const inserts = stubPublishing();
    await run(close, ctx());
    assert.equal(inserts.length, 0);
  });

  it('returns 500 on errors', async () => {
    signInAs();
    stubLifecycle('closeVenue', async () => {
      throw new Error('db down');
    });
    assert.equal((await quietly(() => run(close, ctx()))).status, 500);
  });
});
