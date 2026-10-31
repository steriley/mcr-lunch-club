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
    assert.equal(await requestRebuild('Update venue', { timeoutMs: 1000 }), 'unreachable');
    assert.equal(fetchCalls.length, 0);
  });

  it('POSTs to the Deploy Hook', async () => {
    process.env.DEPLOY_HOOK_URL = HOOK;
    assert.equal(await requestRebuild('Update venue', { timeoutMs: 1000 }), 'accepted');
    assert.deepEqual(
      fetchCalls.map(({ url, init }) => [url, init.method]),
      [[HOOK, 'POST']]
    );
  });

  it('gives up after the timeout it was given', async () => {
    process.env.DEPLOY_HOOK_URL = HOOK;
    globalThis.fetch = ((_url: URL, init: RequestInit) =>
      new Promise((_resolve, reject) =>
        init.signal?.addEventListener('abort', () => reject(new Error('aborted due to timeout')))
      )) as typeof fetch;
    // AbortSignal.timeout does not keep the process alive, so hold it open until the timeout fires.
    const keepAlive = setTimeout(() => {}, 1000);
    try {
      assert.equal(await requestRebuild('Publish', { timeoutMs: 20 }), 'unreachable');
    } finally {
      clearTimeout(keepAlive);
    }
    assert.match(logged[0], /aborted due to timeout/);
  });

  it('logs a refused or failed request without the hook URL, and never throws', async () => {
    process.env.DEPLOY_HOOK_URL = HOOK;
    nextFetch = () => Promise.resolve(new Response('', { status: 404 }));
    assert.equal(await requestRebuild('Update venue', { timeoutMs: 1000 }), 'refused');
    nextFetch = () => Promise.reject(new Error('network down'));
    assert.equal(await requestRebuild('Close venue', { timeoutMs: 1000 }), 'unreachable');

    assert.equal(logged.length, 2);
    assert.match(logged[0], /"Update venue".*404/);
    assert.match(logged[1], /"Close venue".*network down/);
    assert.ok(logged.every((line) => !line.includes('secret')));
  });
});
