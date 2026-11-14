import '../setup-env';
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rateLimit } from '@/db/auth-schema';
import { createAuth } from '@/lib/auth-config';
import { closeTestDb, resetTestDb, skipIntegration, testDb } from './db';

/**
 * Better Auth's per-client limit on password sign-in (src/lib/auth-config.ts, `customRules`): five
 * attempts a minute, kept in the database. The browser tests used to run into this by accident and sleep
 * it out, so it is checked here instead, against the real handler. Only requests through the handler
 * are limited, and only when the client has an address, hence the x-forwarded-for header.
 */

const origin = process.env.BETTER_AUTH_URL!;
const PASSWORD = 'a-long-enough-password';
const LIMIT = 5;

async function setup() {
  const db = await testDb();
  const auth = createAuth(db);
  const email = 'limited@example.com';
  await auth.api.createUser({
    body: { email, password: PASSWORD, name: 'Limited', role: 'admin' },
  });
  const signIn = (client: string, password = PASSWORD) =>
    auth.handler(
      new Request(`${origin}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin, 'x-forwarded-for': client },
        body: JSON.stringify({ email, password }),
      })
    );
  return { signIn };
}

describe('sign-in rate limit (database)', { skip: skipIntegration }, () => {
  beforeEach(async () => {
    await resetTestDb();
    await (await testDb()).delete(rateLimit);
  });

  after(closeTestDb);

  it('answers the sixth password sign-in in a minute with 429 and a retry time', async () => {
    const { signIn } = await setup();
    for (let attempt = 1; attempt <= LIMIT; attempt += 1) {
      assert.equal((await signIn('203.0.113.7')).status, 200, `attempt ${attempt} is allowed`);
    }
    const refused = await signIn('203.0.113.7');
    assert.equal(refused.status, 429);
    // The browser tests wait this long before trying again.
    const retryAfter = Number(refused.headers.get('x-retry-after'));
    assert.ok(retryAfter > 0 && retryAfter <= 60, `retry in ${retryAfter}s`);
  });

  it('counts wrong passwords too, so guessing is capped', async () => {
    const { signIn } = await setup();
    for (let attempt = 1; attempt <= LIMIT; attempt += 1) {
      assert.equal((await signIn('203.0.113.8', 'not-the-password')).status, 401);
    }
    assert.equal((await signIn('203.0.113.8')).status, 429, 'the right password is refused too');
  });

  it('limits each client on its own, and forgets them once the counts are cleared', async () => {
    const { signIn } = await setup();
    for (let attempt = 1; attempt <= LIMIT; attempt += 1) await signIn('203.0.113.9');
    assert.equal((await signIn('203.0.113.9')).status, 429);
    assert.equal((await signIn('203.0.113.10')).status, 200, 'another client is not affected');

    // What the browser tests rely on to start from a clean slate.
    await (await testDb()).delete(rateLimit);
    assert.equal((await signIn('203.0.113.9')).status, 200);
  });
});
