import '../setup-env';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GET as geocode } from '@/pages/api/admin/geocode';
import { POST as recompute } from '@/pages/api/admin/venues/[id]/recompute-route';
import { VENUE_ID, adminRequest, quietly, restoreStubs, run, signInAs, stubDb, stubTransactions } from '../route-helpers';

const originalFetch = globalThis.fetch;
const fetchCalls: string[] = [];

function stubOrs(handler: (url: string) => Response) {
  process.env.ORS_API_KEY = 'test-ors-key';
  globalThis.fetch = (async (url: string | URL) => {
    fetchCalls.push(String(url));
    return handler(String(url));
  }) as typeof fetch;
}

afterEach(() => {
  restoreStubs();
  globalThis.fetch = originalFetch;
  delete process.env.ORS_API_KEY;
  fetchCalls.length = 0;
});

const now = new Date('2026-01-01T00:00:00.000Z');
const row = { id: VENUE_ID, slug: 'chip-shop', name: 'Chip Shop', tier: 'approved', latitude: '53.481000', longitude: '-2.249000', distanceMiles: '0.25', walkingTimeMin: 5, createdAt: now, updatedAt: now };

describe('GET /api/admin/geocode', () => {
  const get = (q: string | null) => {
    const url = new URL('https://lunch.example.com/api/admin/geocode');
    if (q !== null) url.searchParams.set('q', q);
    return run(geocode, { request: adminRequest('GET'), url });
  };

  it('needs at least three characters and does not call ORS otherwise', async () => {
    signInAs();
    stubOrs(() => Response.json({ features: [] }));
    assert.equal((await get('pi')).status, 400);
    assert.equal((await get('  ab  ')).status, 400);
    assert.equal((await get(null)).status, 400);
    assert.equal((await get('x'.repeat(201))).status, 400);
    assert.equal(fetchCalls.length, 0);
  });

  it('returns the candidates', async () => {
    signInAs();
    stubOrs(() => Response.json({ features: [{ geometry: { coordinates: [-2.25, 53.48] }, properties: { label: 'Deansgate, Manchester' } }] }));
    const response = await get('deansgate');
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).results, [{ label: 'Deansgate, Manchester', address: 'Deansgate, Manchester', lat: 53.48, lng: -2.25 }]);
  });

  it('maps ORS rate limits to 429 and outages to 503, without leaking the key', async () => {
    signInAs();
    stubOrs(() => new Response('', { status: 429 }));
    const limited = await get('pizza');
    assert.equal(limited.status, 429);
    assert.ok(!JSON.stringify(await limited.json()).includes('test-ors-key'));

    stubOrs(() => new Response('', { status: 502 }));
    const down = await get('pizza');
    assert.equal(down.status, 503);
    assert.match((await down.json()).error, /manually/);
  });

  it('reports a missing key as unavailable', async () => {
    signInAs();
    assert.equal((await get('pizza')).status, 503);
  });
});

describe('POST /api/admin/venues/[id]/recompute-route', () => {
  const post = (id = VENUE_ID) => run(recompute, { request: adminRequest('POST'), params: { id } });
  beforeEach(() => stubTransactions());

  it('404s for a missing venue and 409s for a venue without a location', async () => {
    signInAs();
    stubDb('select', []);
    assert.equal((await post()).status, 404);
    stubDb('select', [{ latitude: null, longitude: null }]);
    assert.equal((await post()).status, 409);
  });

  it('stores the new route and records a revision', async () => {
    signInAs();
    stubOrs(() => Response.json({ routes: [{ summary: { distance: 402.336, duration: 300 } }] }));
    stubDb('select', [{ latitude: '53.481000', longitude: '-2.249000' }]);
    const updates = stubDb('update', [row]);
    const inserts = stubDb('insert', []);
    const response = await post();
    assert.equal(response.status, 200);
    const set = updates.find((call) => call.method === 'set')!.args[0] as any;
    assert.equal(set.distanceMiles, '0.25');
    assert.equal(set.walkingTimeMin, 5);
    assert.ok(set.routeUpdatedAt instanceof Date);
    assert.ok(inserts.some((call) => call.method === 'values'));
  });

  it('leaves the venue alone when ORS fails', async () => {
    signInAs();
    stubOrs(() => new Response('', { status: 429 }));
    stubDb('select', [{ latitude: '53.481000', longitude: '-2.249000' }]);
    const updates = stubDb('update', [row]);
    const limited = await post();
    assert.equal(limited.status, 429);
    assert.match((await limited.json()).error, /^The walking route is pending/);
    assert.equal(updates.length, 0);

    stubOrs(() => new Response('', { status: 500 }));
    assert.equal((await post()).status, 503);
  });

  it('returns 500 on database errors', async () => {
    signInAs();
    stubDb('select', new Error('db down'));
    assert.equal((await quietly(() => post())).status, 500);
  });
});
