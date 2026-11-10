import '../setup-env';
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { eq, like } from 'drizzle-orm';
import { account, rateLimit, session, user, verification } from '@/db/auth-schema';
import { memberSignInRequests } from '@/db/schema';
import { createAuth } from '@/lib/auth-config';
import { getMemberSignInDailyCap } from '@/lib/env';
import { collectSignInEmail, emailHash, reserveSignIn, senderHash } from '@/lib/members/sign-in';
import { closeTestDb, createAdmin, resetTestDb, skipIntegration, testDb } from './db';

/** Member email sign-in against real Better Auth (#136, PR b). */

const origin = process.env.BETTER_AUTH_URL!;

async function freshAuth(membersOn = true) {
  return createAuth(await testDb(), { membersEnabled: async () => membersOn });
}

/** What the request route does once its checks pass: ask Better Auth for the link and the code. */
async function requestEmail(auth: Awaited<ReturnType<typeof freshAuth>>, email: string) {
  const parts = await collectSignInEmail(async () => {
    await auth.api.signInMagicLink({
      headers: new Headers({ origin }),
      body: { email, callbackURL: '/' },
    });
    await auth.api.sendVerificationOTP({ body: { email, type: 'sign-in' } });
  });
  assert.ok(parts.url && parts.otp, 'Better Auth made a link and a code');
  return parts as { url: string; otp: string };
}

async function verifyCode(auth: Awaited<ReturnType<typeof freshAuth>>, email: string, otp: string) {
  return auth.handler(
    new Request(`${origin}/api/auth/sign-in/email-otp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ email, otp }),
    })
  );
}

const cookieHeader = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');

describe('member email sign-in (database)', { skip: skipIntegration }, () => {
  beforeEach(async () => {
    await resetTestDb();
    const db = await testDb();
    await db.delete(rateLimit);
    await db.delete(verification).where(like(verification.identifier, '%'));
    await db.delete(memberSignInRequests);
  });

  after(closeTestDb);

  it('signs a new member in with the code, as a user, and sets the signed-in hint', async () => {
    const auth = await freshAuth();
    const { otp } = await requestEmail(auth, 'new@example.com');
    const response = await verifyCode(auth, 'new@example.com', otp);
    assert.equal(response.status, 200);
    const cookies = response.headers.getSetCookie().join('\n');
    assert.match(cookies, /signed_in=1/);
    assert.doesNotMatch(
      cookies.split('\n').find((c) => c.startsWith('signed_in=')) ?? '',
      /HttpOnly/i
    );

    const [row] = await (
      await testDb()
    )
      .select()
      .from(user)
      .where(eq(user.email, 'new@example.com'));
    assert.equal(row.role, 'user');
    assert.equal(row.emailVerified, true);
  });

  it('keeps the signed-in hint to the browser session for “don’t remember me”', async () => {
    const auth = await freshAuth();
    await auth.api.createUser({
      body: {
        email: 'brief@example.com',
        password: 'a-long-enough-password',
        name: 'B',
        role: 'user',
      },
    });
    const signIn = (rememberMe: boolean) =>
      auth.handler(
        new Request(`${origin}/api/auth/sign-in/email`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin },
          body: JSON.stringify({
            email: 'brief@example.com',
            password: 'a-long-enough-password',
            rememberMe,
          }),
        })
      );
    const hint = (response: Response) =>
      response.headers.getSetCookie().find((cookie) => cookie.startsWith('signed_in=')) ?? '';
    assert.match(hint(await signIn(true)), /Max-Age=\d+/i);
    const brief = hint(await signIn(false));
    assert.match(brief, /signed_in=1/);
    assert.doesNotMatch(brief, /Max-Age/i);
  });

  it('signs a member in with the link instead', async () => {
    const auth = await freshAuth();
    const { url } = await requestEmail(auth, 'link@example.com');
    const response = await auth.handler(new Request(url, { headers: { origin } }));
    assert.equal(response.status, 302);
    assert.match(response.headers.getSetCookie().join('\n'), /signed_in=1/);
    assert.equal((await (await testDb()).select().from(session)).length, 1);
  });

  it('accepts a code once, and stops after five wrong guesses', async () => {
    const auth = await freshAuth();
    const { otp } = await requestEmail(auth, 'once@example.com');
    assert.equal((await verifyCode(auth, 'once@example.com', otp)).status, 200);
    assert.notEqual((await verifyCode(auth, 'once@example.com', otp)).status, 200);

    const second = await requestEmail(auth, 'guess@example.com');
    const wrong = second.otp === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await verifyCode(auth, 'guess@example.com', wrong);
    assert.notEqual((await verifyCode(auth, 'guess@example.com', second.otp)).status, 200);
  });

  it('never signs a Chair in by email, by code or by link, even if one were made', async () => {
    const db = await testDb();
    await createAdmin('chair', 'Chair');
    const auth = await freshAuth();
    const { otp, url } = await requestEmail(auth, 'chair@example.com');

    const byCode = await verifyCode(auth, 'chair@example.com', otp);
    assert.equal(byCode.status, 403);
    assert.equal((await byCode.json()).code, 'CHAIR_EMAIL_SIGN_IN');

    const byLink = await auth.handler(new Request(url, { headers: { origin } }));
    assert.doesNotMatch(byLink.headers.getSetCookie().join('\n'), /session_token=[^;]/);
    assert.equal((await db.select().from(session)).length, 0);
  });

  it('never strips a Chair’s password, even one whose email isn’t marked verified', async () => {
    const db = await testDb();
    const auth = await freshAuth();
    // A link made for an address before its Chair account existed.
    const { otp, url } = await requestEmail(auth, 'late@example.com');
    const created = await auth.api.createUser({
      body: {
        email: 'late@example.com',
        password: 'a-long-enough-password',
        name: 'Late',
        role: 'admin',
      },
    });
    await db.update(user).set({ emailVerified: false }).where(eq(user.id, created.user.id));

    assert.equal((await verifyCode(auth, 'late@example.com', otp)).status, 403);
    const byLink = await auth.handler(new Request(url, { headers: { origin } }));
    assert.notEqual(byLink.status, 200);
    const credentials = await db.select().from(account).where(eq(account.userId, created.user.id));
    assert.equal(credentials.length, 1, 'the Chair keeps their password');
  });

  it('refuses member sign-in while the members flag is off', async () => {
    const on = await freshAuth(true);
    const { otp } = await requestEmail(on, 'off@example.com');
    const off = await freshAuth(false);
    assert.equal((await verifyCode(off, 'off@example.com', otp)).status, 404);
    // Refused before Better Auth acts: no account was made.
    const made = await (
      await testDb()
    )
      .select()
      .from(user)
      .where(eq(user.email, 'off@example.com'));
    assert.equal(made.length, 0);
  });

  it('lets a member add a passkey just after an email sign-in, and not otherwise', async () => {
    const auth = await freshAuth();
    const { otp } = await requestEmail(auth, 'keys@example.com');
    const signedIn = await verifyCode(auth, 'keys@example.com', otp);
    const cookie = cookieHeader(signedIn);
    const registerOptions = `${origin}/api/auth/passkey/generate-register-options`;
    const allowed = await auth.handler(new Request(registerOptions, { headers: { cookie } }));
    assert.equal(allowed.status, 200);

    // A member signed in some other way (the local test member's password) has no grant.
    await auth.api.createUser({
      body: {
        email: 'pw@example.com',
        password: 'a-long-enough-password',
        name: 'Pw',
        role: 'user',
      },
    });
    const byPassword = await auth.handler(
      new Request(`${origin}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin },
        body: JSON.stringify({ email: 'pw@example.com', password: 'a-long-enough-password' }),
      })
    );
    const noGrant = await auth.handler(
      new Request(registerOptions, { headers: { cookie: cookieHeader(byPassword) } })
    );
    assert.equal(noGrant.status, 403);

    // With the flag off a member can't add one, grant or not.
    const off = await freshAuth(false);
    const refused = await off.handler(new Request(registerOptions, { headers: { cookie } }));
    assert.equal(refused.status, 403);
  });

  it('refuses the email-code endpoints the club doesn’t use, such as password reset', async () => {
    const auth = await freshAuth();
    await createAdmin('chair', 'Chair');
    await assert.rejects(
      () => auth.api.requestPasswordResetEmailOTP({ body: { email: 'chair@example.com' } }),
      (error: { statusCode?: number }) => error.statusCode === 404
    );
  });
});

describe('sign-in rate limits (database)', { skip: skipIntegration }, () => {
  beforeEach(async () => {
    await (await testDb()).delete(memberSignInRequests);
  });

  after(closeTestDb);

  const sam = () => ({ email: emailHash('sam@example.com'), sender: senderHash('203.0.113.1') });

  it('allows three per email in fifteen minutes, and a refused request uses up nothing', async () => {
    const db = await testDb();
    const now = new Date();
    for (let i = 0; i < 3; i++) assert.equal(await reserveSignIn(db, sam(), now), 'ok');
    assert.equal(await reserveSignIn(db, sam(), now), 'email');
    assert.equal((await db.select().from(memberSignInRequests)).length, 3);
    // Fifteen minutes later the short limit has passed.
    assert.equal(await reserveSignIn(db, sam(), new Date(now.getTime() + 16 * 60_000)), 'ok');
  });

  it('allows ten per IP an hour, whatever the emails', async () => {
    const db = await testDb();
    const now = new Date();
    const sender = senderHash('203.0.113.1');
    for (let i = 0; i < 10; i++) {
      assert.equal(
        await reserveSignIn(db, { email: emailHash(`p${i}@example.com`), sender }, now),
        'ok'
      );
    }
    assert.equal(
      await reserveSignIn(db, { email: emailHash('new@example.com'), sender }, now),
      'sender'
    );
  });

  it('can’t be beaten by sending many requests at once', async () => {
    const db = await testDb();
    const now = new Date();
    const results = await Promise.all(
      Array.from({ length: 12 }, () => reserveSignIn(db, sam(), now))
    );
    assert.ok(results.filter((result) => result === 'ok').length <= 3, results.join(','));
  });

  it('stops everyone once the site-wide daily cap is reached', async () => {
    const db = await testDb();
    const now = new Date();
    const rows = Array.from({ length: getMemberSignInDailyCap() }, (_, i) => ({
      emailHash: `e${i}`,
      senderHash: `s${i}`,
      createdAt: now,
    }));
    await db.insert(memberSignInRequests).values(rows);
    assert.equal(
      await reserveSignIn(db, { email: emailHash('anyone@example.com'), sender: null }, now),
      'site'
    );
  });

  it('forgets requests after two days', async () => {
    const db = await testDb();
    const now = new Date();
    const old = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    await db
      .insert(memberSignInRequests)
      .values({ emailHash: 'old', senderHash: null, createdAt: old });
    await reserveSignIn(db, { email: emailHash('x@example.com'), sender: null }, now);
    const left = await db
      .select()
      .from(memberSignInRequests)
      .where(eq(memberSignInRequests.emailHash, 'old'));
    assert.equal(left.length, 0);
  });
});
