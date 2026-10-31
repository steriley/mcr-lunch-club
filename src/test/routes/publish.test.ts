import '../setup-env';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GET, POST } from '@/pages/api/admin/publish';
import {
  ADMIN,
  adminRequest,
  quietly,
  restoreStubs,
  run,
  signInAs,
  stubDb,
  stubDbSequence,
} from '../route-helpers';

const HOOK = 'https://api.vercel.com/v1/integrations/deploy/prj_x/secret';
const originalFetch = globalThis.fetch;
let hookCalls: number;
let hookStatus: number;

beforeEach(() => {
  hookCalls = 0;
  hookStatus = 201;
  globalThis.fetch = (async () => {
    hookCalls += 1;
    return new Response('{}', { status: hookStatus });
  }) as typeof fetch;
  process.env.DEPLOY_HOOK_URL = HOOK;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.DEPLOY_HOOK_URL = '';
  restoreStubs();
});

const post = (origin?: string) =>
  run(POST, { request: adminRequest('POST', undefined, { origin }) });
const get = () => run(GET, { request: adminRequest('GET') });

const secondsAgo = (seconds: number) => new Date(Date.now() - seconds * 1000);

describe('/api/admin/publish', () => {
  it('refuses signed-out and non-admin requests', async () => {
    signInAs(null);
    assert.equal((await post()).status, 401);
    assert.equal((await get()).status, 401);
    signInAs({ ...ADMIN, role: 'user' });
    assert.equal((await post()).status, 403);
    assert.equal((await get()).status, 403);
    assert.equal(hookCalls, 0);
  });

  it('refuses a POST from another origin or with none, without calling the hook', async () => {
    signInAs();
    assert.equal((await post('https://evil.example.com')).status, 403);
    assert.equal((await post(null as unknown as string)).status, 403);
    assert.equal(hookCalls, 0);
  });

  it('calls the hook and records a Chair request', async () => {
    signInAs();
    // No request in the last minute.
    stubDbSequence('select', [[]]);
    const inserts = stubDb('insert');
    const response = await post();
    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { status: 'publishing' });
    assert.equal(hookCalls, 1);
    assert.deepEqual(inserts.find((c) => c.method === 'values')?.args[0], {
      source: 'chair',
      requestedBy: 'admin-1',
      accepted: true,
    });
  });

  it('does not call the hook again within a minute when nothing new was recorded', async () => {
    signInAs();
    stubDbSequence('select', [[{ requestedAt: secondsAgo(20), accepted: true }], [{ total: 0 }]]);
    const inserts = stubDb('insert');
    const response = await post();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'already-publishing' });
    assert.equal(hookCalls, 0);
    assert.equal(inserts.length, 0);
  });

  it('publishes again within a minute when a change was recorded since', async () => {
    signInAs();
    stubDbSequence('select', [[{ requestedAt: secondsAgo(20), accepted: true }], [{ total: 1 }]]);
    stubDb('insert');
    assert.equal((await post()).status, 202);
    assert.equal(hookCalls, 1);
  });

  it('publishes again when the last request was refused, or is over a minute old', async () => {
    signInAs();
    stubDb('insert');
    stubDbSequence('select', [[{ requestedAt: secondsAgo(5), accepted: false }]]);
    assert.equal((await post()).status, 202);
    stubDbSequence('select', [[{ requestedAt: secondsAgo(90), accepted: true }]]);
    assert.equal((await post()).status, 202);
    assert.equal(hookCalls, 2);
  });

  it('answers 502 and records the failed request when the hook does not accept', async () => {
    signInAs();
    stubDbSequence('select', [[]]);
    const inserts = stubDb('insert');
    hookStatus = 500;
    const response = await quietly(() => post());
    assert.equal(response.status, 502);
    assert.equal((inserts.find((c) => c.method === 'values')?.args[0] as any).accepted, false);
  });

  it('GET reports the bar state without a count header', async () => {
    signInAs();
    stubDbSequence('select', [[], [], []]);
    const response = await get();
    assert.equal(response.status, 200);
    assert.equal((await response.json()).state, 'idle');
    assert.equal(response.headers.get('X-Unpublished-Changes'), null);
  });
});
