import '../setup-env';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { POST as CREATE } from '@/pages/api/member/inspections/index';
import { DELETE, PATCH } from '@/pages/api/member/inspections/[id]';
import { GET as PUBLIC_FEED } from '@/pages/api/venues/[slug]/public-inspections';
import { POST as APPROVE } from '@/pages/api/admin/member-inspections/[id]/approve';
import { POST as REMOVE } from '@/pages/api/admin/member-inspections/[id]/remove';
import { POST as STUFFING } from '@/pages/api/admin/member-inspections/stuffing';
import type { MemberInspectionInput } from '@/lib/member-inspection-rules';
import { memberInspectionsApi } from '@/lib/member-inspections';
import {
  ADMIN,
  VENUE_ID,
  adminRequest,
  quietly,
  restoreStubs,
  run,
  signInAs,
  stubPublishing,
} from '../route-helpers';

/** People's Inspections routes (#137): the HTTP side. Behaviour is in the database tests. */

const MEMBER = { id: 'member-1', email: 'sam@example.com', role: 'user' };
const LOG_ID = '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d';
const savedFlag = process.env.MEMBERS_FLAG;

const BODY = {
  venueId: VENUE_ID,
  visitDate: '2026-11-11',
  dish: ' Steak pie ',
  pricePaidPence: 850,
  qualityScore: 4,
  valueScore: 3,
  wouldReturn: true,
  verdictVote: 'approve',
  pullQuote: '',
  position: { lat: 53.48, lng: -2.25 },
};

beforeEach(() => {
  process.env.MEMBERS_FLAG = 'on';
});

afterEach(() => {
  restoreStubs();
  if (savedFlag === undefined) delete process.env.MEMBERS_FLAG;
  else process.env.MEMBERS_FLAG = savedFlag;
});

const memberCall = (method: string, body?: unknown, params: Record<string, string> = {}) => ({
  request: adminRequest(method, body, { path: '/api/member/inspections' }),
  params,
});

const adminCall = (method: string, body?: unknown, params: Record<string, string> = {}) => ({
  request: adminRequest(method, body),
  params,
  url: new URL('https://lunch.example.com/api/admin/member-inspections'),
});

describe('POST /api/member/inspections', () => {
  it('saves the parsed log for the signed-in member', async () => {
    signInAs(MEMBER);
    const create = mock.method(memberInspectionsApi, 'create', async () => ({
      ok: true as const,
      value: { id: LOG_ID },
    }));
    const response = await run(CREATE, memberCall('POST', BODY));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const [, memberId, input] = create.mock.calls[0].arguments as unknown as [
      unknown,
      string,
      MemberInspectionInput,
    ];
    assert.equal(memberId, 'member-1');
    assert.equal(input.dish, 'Steak pie');
    assert.equal(input.pullQuote, null);
    assert.deepEqual(input.position, { lat: 53.48, lng: -2.25 });
  });

  it('maps the one-a-day rules and the filter to their fields', async () => {
    signInAs(MEMBER);
    for (const [error, status, field] of [
      ['already_logged_that_day', 409, 'visitDate'],
      ['daily_log_limit', 429, null],
      ['visit_date_out_of_range', 400, 'visitDate'],
      ['venue_not_loggable', 409, 'venueId'],
      ['quote_offensive', 400, 'pullQuote'],
      ['dish_offensive', 400, 'dish'],
    ] as const) {
      mock.method(memberInspectionsApi, 'create', async () => ({ ok: false as const, error }));
      const response = await run(CREATE, memberCall('POST', BODY));
      assert.equal(response.status, status, error);
      const json = await response.json();
      if (field) assert.ok(json.fields[field], error);
      mock.restoreAll();
    }
  });

  it('refuses a malformed log before it reaches the database', async () => {
    signInAs(MEMBER);
    const create = mock.method(memberInspectionsApi, 'create', async () => ({ ok: true }));
    const response = await run(CREATE, memberCall('POST', { ...BODY, qualityScore: 6 }));
    assert.equal(response.status, 400);
    assert.ok((await response.json()).fields.qualityScore);
    assert.equal(create.mock.callCount(), 0);
  });

  it('refuses the flag off, signed out, Chairs and foreign origins', async () => {
    const create = mock.method(memberInspectionsApi, 'create', async () => ({ ok: true }));
    signInAs(MEMBER);
    process.env.MEMBERS_FLAG = 'off';
    assert.equal((await run(CREATE, memberCall('POST', BODY))).status, 404);
    process.env.MEMBERS_FLAG = 'on';
    signInAs(null);
    assert.equal((await run(CREATE, memberCall('POST', BODY))).status, 401);
    signInAs(ADMIN);
    assert.equal((await run(CREATE, memberCall('POST', BODY))).status, 403);
    signInAs(MEMBER);
    const foreign = {
      request: adminRequest('POST', BODY, { origin: 'https://evil.example' }),
      params: {},
    };
    assert.equal((await run(CREATE, foreign)).status, 403);
    assert.equal(create.mock.callCount(), 0);
  });
});

describe('PATCH and DELETE /api/member/inspections/[id]', () => {
  it('passes the id and the member, and never the venue or the day', async () => {
    signInAs(MEMBER);
    const update = mock.method(memberInspectionsApi, 'update', async () => ({
      ok: true as const,
      value: { id: LOG_ID },
    }));
    const response = await run(PATCH, memberCall('PATCH', BODY, { id: LOG_ID }));
    assert.equal(response.status, 200);
    const [, memberId, id, input] = update.mock.calls[0].arguments as unknown as [
      unknown,
      string,
      string,
      object,
    ];
    assert.deepEqual([memberId, id], ['member-1', LOG_ID]);
    assert.equal('venueId' in input, false);
    assert.equal('visitDate' in input, false);
  });

  it('answers 404 for a malformed id and 409 once the window closes', async () => {
    signInAs(MEMBER);
    const remove = mock.method(memberInspectionsApi, 'delete', async () => ({
      ok: false as const,
      error: 'edit_window_closed',
    }));
    assert.equal((await run(DELETE, memberCall('DELETE', undefined, { id: 'x' }))).status, 404);
    assert.equal(remove.mock.callCount(), 0);
    assert.equal((await run(DELETE, memberCall('DELETE', undefined, { id: LOG_ID }))).status, 409);
  });
});

describe('GET /api/venues/[slug]/public-inspections', () => {
  const call = (slug: string) => ({
    request: new Request(`https://lunch.example.com/api/venues/${slug}/public-inspections`),
    params: { slug },
  });

  it('exists only while the members flag is on', async () => {
    const feed = mock.method(memberInspectionsApi, 'recentPublic', async () => ({
      recent: [],
      score: null,
      eligibleLogs: 0,
    }));
    process.env.MEMBERS_FLAG = 'off';
    assert.equal((await run(PUBLIC_FEED, call('chip-shop'))).status, 404);
    assert.equal(feed.mock.callCount(), 0);
    process.env.MEMBERS_FLAG = 'on';
    const response = await run(PUBLIC_FEED, call('chip-shop'));
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control')!, /s-maxage=60/);
  });

  it('answers 404 for an unknown or malformed slug', async () => {
    mock.method(memberInspectionsApi, 'recentPublic', async () => null);
    assert.equal((await run(PUBLIC_FEED, call('nowhere'))).status, 404);
    assert.equal((await run(PUBLIC_FEED, call('../admin'))).status, 404);
  });

  it('hides a failure behind a generic 500', async () => {
    mock.method(memberInspectionsApi, 'recentPublic', async () => {
      throw new Error('connection refused');
    });
    const response = await quietly(() => run(PUBLIC_FEED, call('chip-shop')));
    assert.equal(response.status, 500);
    assert.doesNotMatch(await response.text(), /connection/);
  });
});

describe('the Chairs’ review routes', () => {
  it('approve and remove act as the signed-in Chair and publish nothing', async () => {
    signInAs(ADMIN);
    const approve = mock.method(memberInspectionsApi, 'approve', async () => ({
      ok: true as const,
      value: { id: LOG_ID, status: 'visible' },
    }));
    const response = await run(APPROVE, adminCall('POST', undefined, { id: LOG_ID }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-unpublished-changes'), null);
    assert.deepEqual(approve.mock.calls[0].arguments[1], { id: LOG_ID, actorId: 'admin-1' });

    const remove = mock.method(memberInspectionsApi, 'remove', async () => ({
      ok: false as const,
      error: 'removal_reason_required',
    }));
    const refused = await run(REMOVE, adminCall('POST', {}, { id: LOG_ID }));
    assert.equal(refused.status, 400);
    assert.ok((await refused.json()).fields.reason);
    assert.deepEqual(remove.mock.calls[0].arguments[1], {
      id: LOG_ID,
      actorId: 'admin-1',
      reason: '',
    });
  });

  it('are for Chairs only', async () => {
    const approve = mock.method(memberInspectionsApi, 'approve', async () => ({ ok: true }));
    signInAs(MEMBER);
    assert.equal((await run(APPROVE, adminCall('POST', undefined, { id: LOG_ID }))).status, 403);
    signInAs(ADMIN);
    assert.equal((await run(APPROVE, adminCall('POST', undefined, { id: 'x' }))).status, 404);
    assert.equal(approve.mock.callCount(), 0);
  });

  it('a stuffing attempt records the published Hall of Shame change', async () => {
    signInAs(ADMIN);
    const inserts = stubPublishing(1);
    const record = mock.method(memberInspectionsApi, 'recordStuffing', async () => ({
      ok: true as const,
      value: { briberyRecordId: 'b-1', removed: 2 },
      published: { action: 'Create bribery record', venueId: null, when: 'queue' as const },
    }));
    const response = await run(
      STUFFING,
      adminCall('POST', {
        venueId: VENUE_ID,
        inspectionIds: [LOG_ID],
        title: 'Ledger stuffing',
        description: 'Six accounts in an afternoon.',
        published: true,
      })
    );
    assert.equal(response.status, 201);
    assert.equal(response.headers.get('x-unpublished-changes'), '1');
    assert.equal(inserts.length > 0, true);
    const [, stuffing] = record.mock.calls[0].arguments as unknown as [
      unknown,
      { actorId: string },
    ];
    assert.equal(stuffing.actorId, 'admin-1');

    const invalid = await run(
      STUFFING,
      adminCall('POST', { venueId: VENUE_ID, inspectionIds: [], title: 'x', description: '' })
    );
    assert.equal(invalid.status, 400);
  });
});
