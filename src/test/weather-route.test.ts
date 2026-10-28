import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { WeatherSummary } from '@/lib/weather';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../lib/fixtures/${name}`, import.meta.url), 'utf8'));
const hourlyForecast = fixture('metoffice-hourly.json');
const dailyForecast = fixture('metoffice-daily.json');

const originalFetch = globalThis.fetch;
const originalWarn = console.warn;
const originalNow = Date.now;
const ENV_KEYS = ['METOFFICE_API_KEY', 'WEATHER_API_KEY'];
const START = Date.parse('2026-10-28T16:30:00Z');

let fetchCalls: { url: string; init: RequestInit }[];
// What the fake Met Office returns for each step; replace to simulate failures.
let upstream: Record<'hourly' | 'daily', () => Promise<Response>>;
let savedEnv: Record<string, string | undefined>;
let clock: number;

// Each test imports its own copy of the route, so the module-level forecast cache never carries over.
let copies = 0;
const call = async () => {
  const { GET } = (await import(
    `@/pages/api/weather?copy=${copies}`
  )) as typeof import('@/pages/api/weather');
  return GET({} as any) as Promise<Response>;
};
const ok = (body: unknown) => () => Promise.resolve(Response.json(body));
const failing = (status: number) => () => Promise.resolve(new Response('no', { status }));
const freshRoute = () => {
  copies += 1;
};
const healthy = () => ({ hourly: ok(hourlyForecast), daily: ok(dailyForecast) });

beforeEach(() => {
  copies += 1;
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  process.env.METOFFICE_API_KEY = 'key';
  fetchCalls = [];
  upstream = healthy();
  clock = START;
  Date.now = () => clock;
  globalThis.fetch = (async (url: URL, init: RequestInit) => {
    fetchCalls.push({ url: String(url), init });
    return upstream[new URL(String(url)).pathname.endsWith('/hourly') ? 'hourly' : 'daily']();
  }) as typeof fetch;
  console.warn = () => {};
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
  Date.now = originalNow;
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe('GET /api/weather', () => {
  it('returns 503 when no API key is configured and nothing is cached', async () => {
    delete process.env.METOFFICE_API_KEY;
    delete process.env.WEATHER_API_KEY;
    const response = await call();
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await response.json(), { error: 'Weather is currently unavailable.' });
    assert.equal(fetchCalls.length, 0);
  });

  it('returns 502 when the upstream is unavailable and nothing is cached', async () => {
    const scenarios: Partial<typeof upstream>[] = [
      { hourly: failing(500) },
      { daily: failing(500) },
      { hourly: ok({ unexpected: true }) },
      { daily: () => Promise.reject(new Error('network down')) },
      { daily: () => Promise.reject('string failure') },
    ];
    for (const scenario of scenarios) {
      freshRoute(); // a step that did succeed would otherwise be cached for the next scenario
      upstream = { ...healthy(), ...scenario };
      const response = await call();
      assert.equal(response.status, 502, String(scenario.hourly ?? scenario.daily));
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
    }
  });

  it('rejects malformed upstream shapes', async () => {
    const malformed = [
      null,
      'text',
      { features: [] },
      { features: [null] },
      { features: [{}] },
      { features: [{ properties: null }] },
      { features: [{ properties: {} }] },
      { features: [{ properties: { timeSeries: [] } }] },
      { features: [{ properties: { timeSeries: ['x'] } }] },
    ];
    for (const body of malformed) {
      freshRoute();
      upstream = { ...healthy(), daily: ok(body) };
      assert.equal((await call()).status, 502, JSON.stringify(body));
    }
  });

  it('fetches both steps with the API key and returns one compact summary', async () => {
    const first = await call();
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('X-Weather-Cache'), 'miss');
    assert.match(first.headers.get('Cache-Control')!, /^public, .*s-maxage=3600/);
    assert.equal(first.headers.get('Warning'), null);

    const text = await first.text();
    assert.ok(Buffer.byteLength(text) < 3 * 1024, `${Buffer.byteLength(text)} bytes`);
    const summary: WeatherSummary = JSON.parse(text);
    assert.equal(summary.stale, false);
    assert.equal(summary.now.time, '2026-10-28T16:00Z');
    assert.equal(summary.hours.length, 6);
    assert.ok(summary.days.length > 0);
    assert.deepEqual(Object.keys(summary).sort(), ['days', 'hours', 'now', 'stale']);

    assert.deepEqual(fetchCalls.map((c) => new URL(c.url).pathname).sort(), [
      '/sitespecific/v0/point/daily',
      '/sitespecific/v0/point/hourly',
    ]);
    for (const { url, init } of fetchCalls) {
      assert.equal(new URL(url).searchParams.get('latitude'), '53.4808');
      assert.deepEqual(init.headers, { apikey: 'key', Accept: 'application/json' });
    }
  });

  it('serves the cache without calling the Met Office again, and keeps "now" following the clock', async () => {
    await call();
    fetchCalls.length = 0;

    clock = START + 30 * 60 * 1000; // 17:00Z, inside the one-hour cache
    const response = await call();
    assert.equal(response.headers.get('X-Weather-Cache'), 'hit');
    assert.match(response.headers.get('Cache-Control')!, /s-maxage=3600/);
    assert.equal(fetchCalls.length, 0);
    const summary: WeatherSummary = await response.json();
    assert.equal(summary.now.time, '2026-10-28T17:00Z');
  });

  it('refreshes from the Met Office once the cache has expired', async () => {
    await call();
    fetchCalls.length = 0;

    clock = START + 61 * 60 * 1000;
    const response = await call();
    assert.equal(response.headers.get('X-Weather-Cache'), 'miss');
    assert.equal(fetchCalls.length, 2);
  });

  it('serves stale data when the cache has expired and the upstream fails', async () => {
    await call();

    clock = START + 61 * 60 * 1000;
    upstream = { hourly: failing(500), daily: failing(500) };
    const response = await call();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('X-Weather-Cache'), 'stale');
    // Stale data must not be cached at the CDN, or it would outlive the outage.
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.match(response.headers.get('Warning')!, /upstream status 500/);
    const summary: WeatherSummary = await response.json();
    assert.equal(summary.stale, true);
    assert.ok(summary.hours.length > 0);

    delete process.env.METOFFICE_API_KEY;
    const withoutKey = await call();
    assert.equal(withoutKey.headers.get('X-Weather-Cache'), 'stale');
    assert.match(withoutKey.headers.get('Warning')!, /upstream status 503/);
  });

  it('is stale when only one step could be refreshed', async () => {
    await call();

    clock = START + 61 * 60 * 1000;
    upstream = { hourly: ok(hourlyForecast), daily: failing(502) };
    const response = await call();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('X-Weather-Cache'), 'stale');
    assert.match(response.headers.get('Warning')!, /upstream status 502/);
    assert.equal(((await response.json()) as WeatherSummary).stale, true);
  });

  it('does not let a bad refresh replace the last good forecast', async () => {
    await call();

    clock = START + 61 * 60 * 1000;
    upstream = {
      hourly: ok({ features: [{ properties: { timeSeries: [] } }] }),
      daily: ok(dailyForecast),
    };
    assert.equal((await call()).headers.get('X-Weather-Cache'), 'stale');

    // The Met Office recovers: the next request refreshes both steps.
    upstream = healthy();
    const recovered = await call();
    assert.equal(recovered.headers.get('X-Weather-Cache'), 'miss');
    assert.equal(((await recovered.json()) as WeatherSummary).stale, false);
  });
});
