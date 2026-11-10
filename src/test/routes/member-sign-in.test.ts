import '../setup-env';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { GET, POST, signInDelivery } from '@/pages/api/member/sign-in';
import { mailTransport, type MailMessage } from '@/lib/mail/send';
import { issueFormToken, recordSignInEmailPart } from '@/lib/members/sign-in';
import { adminRequest, restoreStubs, run, stubAuthApi, stubDb } from '../route-helpers';

/** /api/member/sign-in (#136, PR b): one email with a magic link and a code. */

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

const NO_COUNTS = { site: 1, emailShort: 1, emailDay: 1, senderHour: 1 };

/** The reservation: insert, one count query, then a delete (prune, or take the row back). */
function stubReserve(counts = NO_COUNTS) {
  const inserts = stubDb('insert', [{ id: 'r1' }]);
  stubDb('select', [counts]);
  const deletes = stubDb('delete', []);
  return { inserts, deletes };
}

/** Records what the route hands to the background delivery, without running it. */
function stubDelivery() {
  return mock.method(signInDelivery, 'deliver', async () => undefined);
}

describe('POST /api/member/sign-in', () => {
  it('reserves the request by hash only, then hands the email to the background delivery', async () => {
    const { inserts } = stubReserve();
    const deliver = stubDelivery();
    const response = await run(POST, valid());
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
    assert.equal(deliver.mock.calls[0].arguments[0], 'sam@example.com');
    const values = inserts.find((call) => call.method === 'values')!.args[0];
    assert.ok(!JSON.stringify(values).includes('sam@example.com'));
    assert.ok(!JSON.stringify(values).includes('203.0.113.9'));
  });

  it('answers a filled honeypot or an instant submit as usual and sends nothing', async () => {
    const deliver = stubDelivery();
    const inserts = stubDb('insert', []);
    assert.equal((await run(POST, valid({ website: 'https://spam.example' }))).status, 200);
    assert.equal((await run(POST, valid({ formToken: issueFormToken() }))).status, 200);
    assert.equal(deliver.mock.callCount(), 0);
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
    const foreign = request(
      { email: 'sam@example.com', formToken: settledToken() },
      'https://evil.example'
    );
    assert.equal((await run(POST, foreign)).status, 403);
  });

  it('answers 429 over a limit, takes the request back out, and sends nothing', async () => {
    const deliver = stubDelivery();
    const { deletes } = stubReserve({ ...NO_COUNTS, site: 81 });
    const site = await run(POST, valid());
    assert.equal(site.status, 429);
    assert.match((await site.json()).error, /tomorrow/);
    assert.ok(deletes.some((call) => call.method === 'where'));

    stubReserve({ ...NO_COUNTS, emailShort: 4 });
    const email = await run(POST, valid());
    assert.equal(email.status, 429);
    assert.match((await email.json()).error, /few minutes/);
    assert.equal(deliver.mock.callCount(), 0);
  });

  it('is off (404) with the members flag off, and paused (503) with the kill switch', async () => {
    process.env.MEMBERS_FLAG = 'off';
    assert.equal((await run(POST, valid())).status, 404);
    assert.equal((await run(GET, {})).status, 404);

    process.env.MEMBERS_FLAG = 'on';
    process.env.MEMBER_SIGNUP_ENABLED = 'false';
    assert.equal((await run(POST, valid())).status, 503);
  });
});

describe('the sign-in email delivery', () => {
  /** Better Auth hands over the link and the code, as its callbacks do. */
  function stubBetterAuth({ makesParts = true } = {}) {
    const link = stubAuthApi('signInMagicLink', () => {
      if (makesParts) recordSignInEmailPart({ url: 'https://lunch.example.com/verify?token=t' });
      return { status: true };
    });
    const code = stubAuthApi('sendVerificationOTP', () => {
      if (makesParts) recordSignInEmailPart({ otp: '482913' });
      return { success: true };
    });
    return { link, code };
  }

  it('sends a member one email with the link and the code', async () => {
    stubDb('select', []);
    const { link, code } = stubBetterAuth();
    await signInDelivery.deliver('sam@example.com', new Headers());
    assert.equal(link[0].body.email, 'sam@example.com');
    assert.deepEqual(code[0].body, { email: 'sam@example.com', type: 'sign-in' });
    assert.equal(mailed.length, 1);
    assert.equal(mailed[0].to, 'sam@example.com');
    assert.match(mailed[0].text, /482913/);
    assert.match(mailed[0].text, /verify\?token=t/);
  });

  it('makes no link or code for a Chair', async () => {
    stubDb('select', [{ role: 'admin' }]);
    const { link, code } = stubBetterAuth();
    await signInDelivery.deliver('chair@example.com', new Headers());
    assert.equal(link.length + code.length, 0);
    assert.equal(mailed.length, 0);
  });

  it('logs, and sends nothing, if Better Auth makes no link or code', async () => {
    stubDb('select', []);
    stubBetterAuth({ makesParts: false });
    const error = mock.method(console, 'error', () => undefined);
    await signInDelivery.deliver('sam@example.com', new Headers());
    assert.equal(mailed.length, 0);
    assert.equal(error.mock.callCount(), 1);
    assert.ok(!String(error.mock.calls[0].arguments).includes('sam@example.com'));
  });
});

describe('GET /api/member/sign-in', () => {
  it('hands the form a fresh, uncached time-trap token', async () => {
    const response = await run(GET, {});
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.match((await response.json()).formToken, /^\d+\.[0-9a-f]{64}$/);
  });
});
