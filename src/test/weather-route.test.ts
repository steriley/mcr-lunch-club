import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GET } from '@/pages/api/weather/[step]';

const forecast = { features: [{ properties: { timeSeries: [{ time: '2026-10-17T18:00Z' }] } }] };
const originalFetch = globalThis.fetch;
const originalWarn = console.warn;
const ENV_KEYS = ['METOFFICE_API_KEY', 'WEATHER_API_KEY'];

let fetchCalls: { url: string; init: RequestInit }[];
let nextFetch: () => Promise<Response>;
let savedEnv: Record<string, string | undefined>;

const call = (step: string | undefined) => GET({ params: { step } } as any) as Promise<Response>;
const ok = (body: unknown = forecast) => () => Promise.resolve(Response.json(body));

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  process.env.METOFFICE_API_KEY = 'key';
  fetchCalls = [];
  nextFetch = ok();
  globalThis.fetch = (async (url: URL, init: RequestInit) => {
    fetchCalls.push({ url: String(url), init });
    return nextFetch();
  }) as typeof fetch;
  console.warn = () => {};
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

// The route keeps a module-level cache per step, so tests run in a deliberate order:
// the "daily" cache is left empty until its stale-fallback scenarios, and "hourly" is used for caching.
describe('GET /api/weather/[step]', () => {
  it('rejects unknown steps', async () => {
    for (const step of ['weekly', undefined]) {
      const response = await call(step);
      assert.equal(response.status, 400);
    }
  });

  it('returns 503 when no API key is configured and nothing is cached', async () => {
    delete process.env.METOFFICE_API_KEY;
    delete process.env.WEATHER_API_KEY;
    const response = await call('daily');
    assert.equal(response.status, 503);
    assert.equal(fetchCalls.length, 0);
  });

  it('returns 502 when the upstream is unavailable and nothing is cached', async () => {
    nextFetch = () => Promise.resolve(new Response('no', { status: 500 }));
    assert.equal((await call('daily')).status, 502);

    nextFetch = ok({ unexpected: true });
    assert.equal((await call('daily')).status, 502);

    nextFetch = () => Promise.reject(new Error('network down'));
    assert.equal((await call('daily')).status, 502);

    nextFetch = () => Promise.reject('string failure');
    assert.equal((await call('daily')).status, 502);
  });

  it('rejects malformed upstream shapes', async () => {
    for (const body of [null, 'text', { features: [] }, { features: [null] }, { features: [{}] }, { features: [{ properties: null }] }, { features: [{ properties: {} }] }]) {
      nextFetch = ok(body);
      assert.equal((await call('daily')).status, 502, JSON.stringify(body));
    }
  });

  it('fetches from the Met Office with the API key, then serves the cache', async () => {
    const first = await call('hourly');
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('X-Weather-Cache'), 'miss');
    assert.deepEqual(await first.json(), forecast);

    assert.equal(fetchCalls.length, 1);
    const url = new URL(fetchCalls[0].url);
    assert.equal(url.pathname, '/sitespecific/v0/point/hourly');
    assert.equal(url.searchParams.get('latitude'), '53.4808');
    assert.deepEqual(fetchCalls[0].init.headers, { apikey: 'key', Accept: 'application/json' });

    const second = await call('hourly');
    assert.equal(second.headers.get('X-Weather-Cache'), 'hit');
    assert.equal(fetchCalls.length, 1);
  });

  it('caches each step separately', async () => {
    const response = await call('daily');
    assert.equal(response.headers.get('X-Weather-Cache'), 'miss');
  });

  it('serves stale data when the cache has expired and the upstream fails', async () => {
    const realNow = Date.now;
    Date.now = () => realNow() + 31 * 60 * 1000;
    try {
      nextFetch = () => Promise.resolve(new Response('no', { status: 500 }));
      const response = await call('hourly');
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('X-Weather-Cache'), 'stale');
      assert.match(response.headers.get('Warning')!, /upstream status 500/);
      assert.deepEqual(await response.json(), forecast);

      delete process.env.METOFFICE_API_KEY;
      assert.equal((await call('hourly')).headers.get('X-Weather-Cache'), 'stale');
    } finally {
      Date.now = realNow;
    }
  });
});
