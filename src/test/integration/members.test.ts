import '../setup-env';
import { after, afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { eq } from 'drizzle-orm';
import { account, rateLimit, user } from '@/db/auth-schema';
import { createAuth } from '@/lib/auth-config';
import { isChairAccount } from '@/lib/chair-accounts';
import { loadChairs } from '@/lib/push/store';
import { countActiveAdmins } from '@/lib/tier-proposals';
import { closeTestDb, createAdmin, resetTestDb, skipIntegration, testDb } from './db';

/** Members and Chairs kept apart (#136, PR a): sign-in, role queries and the seed script. */

const PASSWORD = 'a-long-enough-password';

async function createAccount(email: string, role: 'admin' | 'user') {
  const auth = createAuth(await testDb());
  const created = await auth.api.createUser({
    body: { email, password: PASSWORD, name: role, role },
  });
  return created.user.id;
}

async function signIn(email: string, password = PASSWORD) {
  const auth = createAuth(await testDb());
  const response = await auth.handler(
    new Request(`${process.env.BETTER_AUTH_URL}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: process.env.BETTER_AUTH_URL! },
      body: JSON.stringify({ email, password }),
    })
  );
  return { status: response.status, body: await response.json().catch(() => null) };
}

describe('members and Chairs (database)', { skip: skipIntegration }, () => {
  const savedNodeEnv = process.env.NODE_ENV;

  beforeEach(async () => {
    await resetTestDb();
    // Better Auth keeps its rate limits in the database; start each test with none used.
    await (await testDb()).delete(rateLimit);
  });

  afterEach(() => {
    if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = savedNodeEnv;
  });

  after(closeTestDb);

  it('refuses a member’s password in production exactly like a wrong password', async () => {
    await createAccount('member@example.com', 'user');
    await createAccount('chair@example.com', 'admin');

    process.env.NODE_ENV = 'production';
    const member = await signIn('member@example.com');
    const wrongPassword = await signIn('chair@example.com', 'not-the-password');
    assert.equal(member.status, 401);
    assert.deepEqual(member.body, wrongPassword.body);
    assert.equal(member.body.code, 'INVALID_EMAIL_OR_PASSWORD');

    // A Chair's password still works in production.
    assert.equal((await signIn('chair@example.com')).status, 200);
  });

  it('lets the test member sign in with a password outside production', async () => {
    await createAccount('member@example.com', 'user');
    delete process.env.NODE_ENV;
    assert.equal((await signIn('member@example.com')).status, 200);
  });

  it('leaves members out of the Chairs’ counts and push recipients', async () => {
    const db = await testDb();
    await createAdmin('sam', 'Sam');
    await createAdmin('jo', 'Jo', { banned: true });
    await createAdmin('member', 'Member', { role: 'user' });
    await createAdmin('multi', 'Multi', { role: 'user,admin' });

    assert.equal(await countActiveAdmins(db), 2);
    const chairs = await loadChairs(db);
    assert.deepEqual(chairs.map((chair) => chair.id).sort(), ['jo', 'multi', 'sam']);

    assert.equal(await isChairAccount(db, 'sam'), true);
    assert.equal(await isChairAccount(db, 'jo'), true, 'a deactivated Chair is still a Chair');
    assert.equal(await isChairAccount(db, 'member'), false);
    assert.equal(await isChairAccount(db, 'nobody'), false);
  });
});

describe('the seeded test member (database)', { skip: skipIntegration }, () => {
  const seed = (env: Record<string, string | undefined> = {}, args: string[] = []) =>
    spawnSync('pnpm', ['exec', 'tsx', 'scripts/seed-member.ts', ...args], {
      encoding: 'utf8',
      env: {
        ...process.env,
        DATABASE_URL: process.env.TEST_DATABASE_URL,
        DATABASE_URL_UNPOOLED: process.env.TEST_DATABASE_URL,
        DATABASE_DRIVER: 'pg',
        SEED_MEMBER_EMAIL: 'Member@Lunch.test',
        SEED_MEMBER_PASSWORD: 'local-member-password',
        NODE_ENV: undefined,
        ...env,
      },
    });

  beforeEach(resetTestDb);
  after(closeTestDb);

  it('creates one verified user-role member with a password, and changes nothing when re-run', async () => {
    const db = await testDb();
    const first = seed();
    assert.equal(first.status, 0, first.stderr);
    const second = seed();
    assert.equal(second.status, 0, second.stderr);

    const rows = await db.select().from(user).where(eq(user.email, 'member@lunch.test'));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].role, 'user');
    assert.equal(rows[0].emailVerified, true);
    const credentials = await db.select().from(account).where(eq(account.userId, rows[0].id));
    assert.equal(credentials.length, 1);
  });

  it('never demotes a Chair who has that email', async () => {
    const db = await testDb();
    await db
      .insert(user)
      .values({ id: 'real-chair', name: 'X', email: 'member@lunch.test', role: 'admin' });
    const refused = seed();
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /belongs to a Chair/);
    const [row] = await db.select().from(user).where(eq(user.id, 'real-chair'));
    assert.equal(row.role, 'admin');
  });

  it('gives an existing member without a password the seeded one, so sign-in works', async () => {
    const db = await testDb();
    await db
      .insert(user)
      .values({ id: 'magic-link-member', name: 'X', email: 'member@lunch.test', role: 'user' });
    assert.equal(seed().status, 0);
    const credentials = await db
      .select()
      .from(account)
      .where(eq(account.userId, 'magic-link-member'));
    assert.equal(credentials.length, 1);
    assert.equal(credentials[0].providerId, 'credential');
  });

  it('refuses to run in production without --force', async () => {
    const db = await testDb();
    const refused = seed({ NODE_ENV: 'production' });
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /Refusing/);
    assert.equal((await db.select().from(user)).length, 0);
  });

  it('refuses to reuse the Chair’s email', () => {
    const clash = seed({ SEED_CHAIR_EMAIL: 'member@lunch.test' });
    assert.notEqual(clash.status, 0);
  });
});
