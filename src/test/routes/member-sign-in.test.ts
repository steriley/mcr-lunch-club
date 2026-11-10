import '../setup-env';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { GET, POST } from '@/pages/api/member/sign-in';
import { mailTransport, type MailMessage } from '@/lib/mail/send';
import { issueFormToken, recordSignInEmailPart } from '@/lib/members/sign-in';
import {
  adminRequest,
  quietly,
  restoreStubs,
  run,
  stubAuthApi,
  stubDb,
  stubDbSequence,
} from '../route-helpers';

/** POST /api/member/sign-in (#136, PR b): one email with a magic link and a code. */

const saved = {
  MEMBERS_FLAG: process.env.MEMBERS_FLAG,
  MEMBER_SIGNUP_ENABLED: process.env.MEMBER_SIGNUP_ENABLED,
};
let mailed: MailMessage[];

beforeEach(() => {
  process.env.MEMBERS_FLAG = 'on';
  delete process.env.MEMBER_SIGNUP_ENABLED;
  mailed = [];
  mock.method(mailTransport, 'log', (message: MailMessage) => mailed.push(message));
});

afterEach(() => {
  restoreStubs();
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const settledToken = () => issueFormToken(new Date(Date.now() - 5000));
const request = (body: unknown, origin?: string | null) => ({
  request: adminRequest('POST', body, { origin, path: '/api/member/sign-in' }),
  clientAddress: '203.0.113.9',
});
const valid = (overrides: Record<string, unknown> = {}) =>
  request({ email: 'Sam@Example.com', formToken: settledToken(), ...overrides });

/** No limit reached, then the account lookup answers `account`. */
function stubChecks(account: { role: string } | null) {
  const selects = stubDbSequence('select', [
    [{ total: 0 }],
    [{ total: 0 }],
    [{ total: 0 }],
    [{ total: 0 }],
    account ? [account] : [],
  ]);
  const inserts = stubDb('insert', []);
  stubDb('delete', []);
  return { selects, inserts };
}

/** Better Auth hands over the link and the code, as its callbacks do. */
function stubBetterAuth() {
  const link = stubAuthApi('signInMagicLink', () => {
    recordSignInEmailPart({ url: 'https://lunch.example.com/api/auth/magic-link/verify?token=t' });
    return { status: true };
  });
  const code = stubAuthApi('sendVerificationOTP', () => {
    recordSignInEmailPart({ otp: '482913' });
    return { success: true };
  });
  return { link, code };
}

describe('POST /api/member/sign-in', () => {
  it('sends a member one email with the link and the code, and answers without saying who exists', async () => {
    const { inserts } = stubChecks(null);
    const { link, code } = stubBetterAuth();
    const response = await run(POST, valid());
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
    assert.equal(link[0].body.email, 'sam@example.com');
    assert.deepEqual(code[0].body, { email: 'sam@example.com', type: 'sign-in' });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(mailed.length, 1);
    assert.equal(mailed[0].to, 'sam@example.com');
    assert.match(mailed[0].text, /482913/);
    assert.match(mailed[0].text, /magic-link\/verify/);
    // The request is recorded for the rate limits, by hash only.
    const values = inserts.find((call) => call.method === 'values')!.args[0] as Record<
      string,
      unknown
    >;
    assert.ok(!JSON.stringify(values).includes('sam@example.com'));
    assert.ok(!JSON.stringify(values).includes('203.0.113.9'));
  });

  it('never makes a link or code for a Chair, and answers exactly as for anyone else', async () => {
    stubChecks({ role: 'admin' });
    const { link, code } = stubBetterAuth();
    const member = await (await run(POST, valid())).json();
    assert.equal(link.length + code.length, 0);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(mailed.length, 0);

    restoreStubs();
    stubChecks(null);
    stubBetterAuth();
    assert.deepEqual(await (await run(POST, valid())).json(), member);
  });

  it('answers a filled honeypot or an instant submit as usual and sends nothing', async () => {
    const { link } = stubBetterAuth();
    const inserts = stubDb('insert', []);
    assert.equal((await run(POST, valid({ website: 'https://spam.example' }))).status, 200);
    assert.equal((await run(POST, valid({ formToken: issueFormToken() }))).status, 200);
    assert.equal(link.length, 0);
    assert.equal(inserts.length, 0);
  });

  it('asks for a reload when the form token is missing, forged or expired', async () => {
    const expired = issueFormToken(new Date(Date.now() - 3 * 60 * 60 * 1000));
    for (const formToken of ['forged.token', expired]) {
      assert.equal((await run(POST, valid({ formToken }))).status, 400);
    }
    assert.equal((await run(POST, request({ email: 'sam@example.com' }))).status, 400);
  });

  it('rejects bad emails and foreign origins', async () => {
    assert.equal((await run(POST, valid({ email: 'not-an-email' }))).status, 400);
    assert.equal(
      (
        await run(
          POST,
          request({ email: 'sam@example.com', formToken: settledToken() }, 'https://evil.example')
        )
      ).status,
      403
    );
  });

  it('answers 429 when a limit is reached, with site-wide copy for the daily cap', async () => {
    const { link } = stubBetterAuth();
    stubDbSequence('select', [[{ total: 80 }]]);
    const site = await run(POST, valid());
    assert.equal(site.status, 429);
    assert.match((await site.json()).error, /tomorrow/);

    stubDbSequence('select', [[{ total: 0 }], [{ total: 3 }]]);
    const email = await run(POST, valid());
    assert.equal(email.status, 429);
    assert.match((await email.json()).error, /few minutes/);
    assert.equal(link.length, 0);
  });

  it('is off (404) with the members flag off, and paused (503) with the kill switch', async () => {
    process.env.MEMBERS_FLAG = 'off';
    assert.equal((await run(POST, valid())).status, 404);
    assert.equal((await run(GET, {})).status, 404);

    process.env.MEMBERS_FLAG = 'on';
    process.env.MEMBER_SIGNUP_ENABLED = 'false';
    assert.equal((await run(POST, valid())).status, 503);
  });

  it('logs and answers 500 if Better Auth makes no link or code', async () => {
    stubChecks(null);
    stubAuthApi('signInMagicLink', () => ({ status: true }));
    stubAuthApi('sendVerificationOTP', () => ({ success: true }));
    assert.equal((await quietly(() => run(POST, valid()))).status, 500);
  });
});

describe('GET /api/member/sign-in', () => {
  it('hands the form a fresh, uncached time-trap token', async () => {
    const response = await run(GET, {});
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.match((await response.json()).formToken, /^\d+\.[0-9a-f]{64}$/);
  });
});
