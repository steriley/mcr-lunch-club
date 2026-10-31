import './setup-env';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GET } from '@/pages/api/cron/weekly-bulletin';
import { GET as nightly } from '@/pages/api/cron/publish-pending';
import { restoreStubs, stubDb } from './route-helpers';

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
  restoreStubs();
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
    const inserts = stubDb('insert');
    const response = await call('Bearer cron-secret');
    assert.equal(response.status, 202);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(hookCalls, 1);
    assert.deepEqual(inserts.find((c) => c.method === 'values')?.args[0], {
      source: 'bulletin',
      requestedBy: null,
      accepted: true,
    });
  });

  it('reports a 502 when the rebuild cannot be requested', async () => {
    stubDb('insert');
    hookStatus = 500;
    assert.equal((await call('Bearer cron-secret')).status, 502);
    process.env.DEPLOY_HOOK_URL = '';
    assert.equal((await call('Bearer cron-secret')).status, 502);
  });
});

describe('GET /api/cron/publish-pending', () => {
  const callNightly = (authorization?: string) =>
    nightly({
      request: new Request('https://lunch.example.com/api/cron/publish-pending', {
        headers: authorization ? { authorization } : {},
      }),
    } as any) as Promise<Response>;

  it('refuses requests without the cron secret, and everything when none is configured', async () => {
    assert.equal((await callNightly()).status, 401);
    assert.equal((await callNightly('Bearer wrong')).status, 401);
    process.env.CRON_SECRET = '';
    assert.equal((await callNightly('Bearer ')).status, 401);
    assert.equal(hookCalls, 0);
  });

  it('makes no hook call and answers 204 when nothing is pending', async () => {
    stubDb('select', [{ total: 0 }]);
    const inserts = stubDb('insert');
    const response = await callNightly('Bearer cron-secret');
    assert.equal(response.status, 204);
    assert.equal(hookCalls, 0);
    assert.equal(inserts.length, 0);
  });

  it('publishes pending changes and records a nightly request', async () => {
    stubDb('select', [{ total: 3 }]);
    const inserts = stubDb('insert');
    const response = await callNightly('Bearer cron-secret');
    assert.equal(response.status, 202);
    assert.equal(hookCalls, 1);
    assert.deepEqual(inserts.find((c) => c.method === 'values')?.args[0], {
      source: 'nightly',
      requestedBy: null,
      accepted: true,
    });
  });

  it('answers 502, and records the failed request, when the hook does not accept', async () => {
    stubDb('select', [{ total: 3 }]);
    const inserts = stubDb('insert');
    hookStatus = 500;
    assert.equal((await callNightly('Bearer cron-secret')).status, 502);
    assert.equal(
      (inserts.find((c) => c.method === 'values')?.args[0] as { accepted: boolean }).accepted,
      false
    );
  });
});
