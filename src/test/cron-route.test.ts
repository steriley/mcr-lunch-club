import './setup-env';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GET } from '@/pages/api/cron/weekly-bulletin';

const HOOK = 'https://api.vercel.com/v1/integrations/deploy/prj_x/secret';
const originalFetch = globalThis.fetch;
const originalError = console.error;

let hookCalls: number;
let hookStatus: number;

const call = (authorization?: string) =>
  GET({
    request: new Request('https://lunch.example.com/api/cron/weekly-bulletin', {
      headers: authorization ? { authorization } : {},
    }),
  } as any) as Promise<Response>;

beforeEach(() => {
  hookCalls = 0;
  hookStatus = 201;
  globalThis.fetch = (async () => {
    hookCalls += 1;
    return new Response('{}', { status: hookStatus });
  }) as typeof fetch;
  console.error = () => {};
  process.env.CRON_SECRET = 'cron-secret';
  process.env.DEPLOY_HOOK_URL = HOOK;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  console.error = originalError;
  process.env.CRON_SECRET = '';
  process.env.DEPLOY_HOOK_URL = '';
});

describe('GET /api/cron/weekly-bulletin', () => {
  it('refuses requests without the cron secret, and everything when none is configured', async () => {
    assert.equal((await call()).status, 401);
    assert.equal((await call('Bearer wrong')).status, 401);
    process.env.CRON_SECRET = '';
    assert.equal((await call('Bearer ')).status, 401);
    assert.equal(hookCalls, 0);
  });

  it('requests a rebuild for the new bulletin issue', async () => {
    const response = await call('Bearer cron-secret');
    assert.equal(response.status, 202);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(hookCalls, 1);
  });

  it('reports a 502 when the rebuild cannot be requested', async () => {
    hookStatus = 500;
    assert.equal((await call('Bearer cron-secret')).status, 502);
    process.env.DEPLOY_HOOK_URL = '';
    assert.equal((await call('Bearer cron-secret')).status, 502);
  });
});
