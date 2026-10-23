import '../test/setup-env';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { requestRebuild } from './rebuild';

const HOOK = 'https://api.vercel.com/v1/integrations/deploy/prj_x/secret';
const originalFetch = globalThis.fetch;
const originalError = console.error;

let fetchCalls: { url: string; init: RequestInit }[];
let nextFetch: () => Promise<Response>;
let logged: string[];

beforeEach(() => {
  fetchCalls = [];
  nextFetch = () => Promise.resolve(new Response('{}', { status: 201 }));
  globalThis.fetch = (async (url: URL, init: RequestInit) => {
    fetchCalls.push({ url: String(url), init });
    return nextFetch();
  }) as typeof fetch;
  logged = [];
  console.error = (...args: unknown[]) => void logged.push(args.join(' '));
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  console.error = originalError;
  process.env.DEPLOY_HOOK_URL = '';
});

describe('requestRebuild', () => {
  it('does nothing without a Deploy Hook', async () => {
    assert.equal(await requestRebuild('Update venue'), false);
    assert.equal(fetchCalls.length, 0);
  });

  it('POSTs to the Deploy Hook', async () => {
    process.env.DEPLOY_HOOK_URL = HOOK;
    assert.equal(await requestRebuild('Update venue'), true);
    assert.deepEqual(
      fetchCalls.map(({ url, init }) => [url, init.method]),
      [[HOOK, 'POST']]
    );
  });

  it('logs a refused or failed request without the hook URL, and never throws', async () => {
    process.env.DEPLOY_HOOK_URL = HOOK;
    nextFetch = () => Promise.resolve(new Response('', { status: 404 }));
    assert.equal(await requestRebuild('Update venue'), false);
    nextFetch = () => Promise.reject(new Error('network down'));
    assert.equal(await requestRebuild('Close venue'), false);

    assert.equal(logged.length, 2);
    assert.match(logged[0], /"Update venue".*404/);
    assert.match(logged[1], /"Close venue".*network down/);
    assert.ok(logged.every((line) => !line.includes('secret')));
  });
});
