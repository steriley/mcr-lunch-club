import '../setup-env';
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq, like } from 'drizzle-orm';
import { passkey, rateLimit, user, verification } from '@/db/auth-schema';
import { createAuth } from '@/lib/auth-config';
import {
  consumePasskeyGrant,
  grantPasskeyRegistration,
  hasPasskeyGrant,
  isPasswordCheckLimited,
  PASSWORD_CHECK_MAX_FAILURES,
  recordPasswordCheckFailure,
  removeAllPasskeys,
} from '@/lib/passkeys';
import { closeTestDb, createAdmin, resetTestDb, skipIntegration, testDb } from './db';

/** Passkeys for Chairs (#153): the password grant, its limit, removal and the auth hooks. */

async function addPasskeyRow(userId: string, name = 'Phone') {
  const db = await testDb();
  await db.insert(passkey).values({
    id: randomUUID(),
    name,
    publicKey: 'public-key',
    userId,
    credentialID: randomUUID(),
    counter: 0,
    deviceType: 'multiDevice',
    backedUp: true,
    createdAt: new Date(),
  });
}

describe('passkey grants and removal (database)', { skip: skipIntegration }, () => {
  beforeEach(async () => {
    await resetTestDb();
    const db = await testDb();
    await db.delete(verification).where(like(verification.identifier, 'passkey-grant%'));
    await createAdmin('sam', 'Sam');
    await createAdmin('alex', 'Alex');
  });

  after(closeTestDb);

  it('grants a password-checked Chair for five minutes, once', async () => {
    const db = await testDb();
    const now = new Date();
    assert.equal(await hasPasskeyGrant(db, 'sam', now), false);
    await grantPasskeyRegistration(db, 'sam', now);
    assert.equal(await hasPasskeyGrant(db, 'sam', now), true);
    assert.equal(await hasPasskeyGrant(db, 'alex', now), false);
    assert.equal(await hasPasskeyGrant(db, 'sam', new Date(now.getTime() + 4 * 60_000)), true);
    assert.equal(await hasPasskeyGrant(db, 'sam', new Date(now.getTime() + 6 * 60_000)), false);

    await consumePasskeyGrant(db, 'sam');
    assert.equal(await hasPasskeyGrant(db, 'sam', now), false);
  });

  it('a new grant replaces the old one rather than stacking', async () => {
    const db = await testDb();
    await grantPasskeyRegistration(db, 'sam');
    await grantPasskeyRegistration(db, 'sam');
    const rows = await db
      .select()
      .from(verification)
      .where(eq(verification.identifier, 'passkey-grant:sam'));
    assert.equal(rows.length, 1);
  });

  it('limits wrong passwords per Chair, for fifteen minutes, and a right one clears them', async () => {
    const db = await testDb();
    const now = new Date();
    for (let i = 0; i < PASSWORD_CHECK_MAX_FAILURES - 1; i++) {
      await recordPasswordCheckFailure(db, 'sam', now);
    }
    assert.equal(await isPasswordCheckLimited(db, 'sam', now), false);
    await recordPasswordCheckFailure(db, 'sam', now);
    assert.equal(await isPasswordCheckLimited(db, 'sam', now), true);
    assert.equal(await isPasswordCheckLimited(db, 'alex', now), false);
    assert.equal(
      await isPasswordCheckLimited(db, 'sam', new Date(now.getTime() + 16 * 60_000)),
      false
    );

    await grantPasskeyRegistration(db, 'sam', now);
    assert.equal(await isPasswordCheckLimited(db, 'sam', now), false);
  });

  it('removes every passkey on one account, and its unused grant', async () => {
    const db = await testDb();
    await addPasskeyRow('sam', 'Phone');
    await addPasskeyRow('sam', 'Laptop');
    await addPasskeyRow('alex');
    await grantPasskeyRegistration(db, 'sam');

    assert.equal(await removeAllPasskeys(db, 'sam'), 2);
    assert.equal((await db.select().from(passkey).where(eq(passkey.userId, 'sam'))).length, 0);
    assert.equal((await db.select().from(passkey).where(eq(passkey.userId, 'alex'))).length, 1);
    assert.equal(await hasPasskeyGrant(db, 'sam'), false);
    assert.equal(await removeAllPasskeys(db, 'sam'), 0);
  });

  it('cascades when the account is deleted', async () => {
    const db = await testDb();
    await addPasskeyRow('alex');
    await resetTestDb();
    assert.equal((await db.select().from(passkey)).length, 0);
  });
});

describe('passkey registration hooks (database)', { skip: skipIntegration }, () => {
  const PASSWORD = 'a-long-enough-password';
  const origin = process.env.BETTER_AUTH_URL!;

  beforeEach(async () => {
    await resetTestDb();
    const db = await testDb();
    await db.delete(verification).where(like(verification.identifier, 'passkey-grant%'));
    // Better Auth keeps its rate limits in the database; start each test with none used.
    await db.delete(rateLimit);
  });

  after(closeTestDb);

  async function signedIn(role: 'admin' | 'user', options: { banned?: boolean } = {}) {
    const db = await testDb();
    const auth = createAuth(db);
    const email = `${role}-${randomUUID().slice(0, 8)}@example.com`;
    const created = await auth.api.createUser({
      body: { email, password: PASSWORD, name: role, role },
    });
    const response = await auth.api.signInEmail({
      body: { email, password: PASSWORD },
      asResponse: true,
    });
    assert.equal(response.status, 200);
    const cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    if (options.banned) {
      await db.update(user).set({ banned: true }).where(eq(user.id, created.user.id));
    }
    const call = (path: string, init: RequestInit = {}) =>
      auth.handler(
        new Request(`${origin}/api/auth${path}`, {
          ...init,
          headers: { cookie, origin, 'content-type': 'application/json', ...init.headers },
        })
      );
    return { auth, db, userId: created.user.id, call };
  }

  it('refuses registration options until the Chair confirms their password', async () => {
    const { db, userId, call } = await signedIn('admin');
    const refused = await call('/passkey/generate-register-options');
    assert.equal(refused.status, 403);
    assert.equal((await refused.json()).code, 'PASSKEY_PASSWORD_REQUIRED');

    await grantPasskeyRegistration(db, userId);
    const allowed = await call('/passkey/generate-register-options');
    assert.equal(allowed.status, 200);
    const options = await allowed.json();
    assert.equal(options.rp.id, new URL(origin).hostname);
    assert.equal(options.rp.name, 'MCR Lunch Club');
  });

  it('uses up the grant when registration finishes, even if the response is bad', async () => {
    const { db, userId, call } = await signedIn('admin');
    await grantPasskeyRegistration(db, userId);
    await call('/passkey/generate-register-options');
    const finished = await call('/passkey/verify-registration', {
      method: 'POST',
      body: JSON.stringify({ response: { id: 'x', rawId: 'x', type: 'public-key', response: {} } }),
    });
    assert.notEqual(finished.status, 200);
    assert.equal(await hasPasskeyGrant(db, userId), false);
    assert.equal((await db.select().from(passkey)).length, 0);
  });

  it('refuses accounts that are not Chairs, even with a grant', async () => {
    const { db, userId, call } = await signedIn('user');
    await grantPasskeyRegistration(db, userId);
    assert.equal((await call('/passkey/generate-register-options')).status, 403);
    assert.equal(
      (await call('/passkey/verify-registration', { method: 'POST', body: '{}' })).status,
      403
    );
  });

  it('refuses without a session', async () => {
    const db = await testDb();
    const auth = createAuth(db);
    const response = await auth.handler(
      new Request(`${origin}/api/auth/passkey/generate-register-options`)
    );
    assert.equal(response.status, 401);
  });

  it('never creates a session for a deactivated Chair, whatever the sign-in method', async () => {
    const { auth, userId } = await signedIn('admin', { banned: true });
    // Passkey sign-in ends in the same createSession as every other method; the admin plugin's
    // hook on it refuses banned accounts.
    const context = await auth.$context;
    await assert.rejects(
      () => context.internalAdapter.createSession(userId),
      (error: { body?: { code?: string } }) => error.body?.code === 'BANNED_USER'
    );
  });
});
