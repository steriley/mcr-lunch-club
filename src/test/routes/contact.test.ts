import '../setup-env';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formTokens } from '@/lib/form-token';
import { pushDelivery } from '@/lib/push/dispatch';
import type { PushEvent } from '@/lib/push/messages';
import { GET, POST } from '@/pages/api/contact';
import * as byId from '@/pages/api/admin/contact/[id]';
import { GET as RETENTION } from '@/pages/api/cron/contact-retention';
import {
  SITE,
  VENUE_ID,
  adminRequest,
  quietly,
  renderSql,
  restoreStubs,
  run,
  signInAs,
  stubDb,
} from '../route-helpers';

const contactForm = formTokens('contact-timetrap');
const settledToken = () => contactForm.issue(new Date(Date.now() - 5000));

const input = () => ({
  name: 'Delegate Reynolds',
  email: 'reynolds@example.com',
  topic: 'press',
  message: 'Could the Chairs comment on the pasty verdict for our column?',
  formToken: settledToken(),
  website: '',
});

const originalDeliver = pushDelivery.deliver;
const originalInfo = console.info;
let pushes: PushEvent[];
let logged: string[];

beforeEach(() => {
  process.env.CONTACT_FORM = 'on';
  pushes = [];
  pushDelivery.deliver = async (event) => {
    pushes.push(event);
  };
  logged = [];
  console.info = (line: string) => logged.push(line);
});

afterEach(() => {
  restoreStubs();
  pushDelivery.deliver = originalDeliver;
  console.info = originalInfo;
  delete process.env.CONTACT_FORM;
  process.env.CRON_SECRET = '';
});

/** The public form posts from the site itself; `clientAddress` mimics Astro's getter. */
function publicContext(
  body: unknown,
  options: { origin?: string | null; contentType?: string | null; ip?: string | null } = {}
) {
  const request = adminRequest('POST', body, { origin: options.origin, path: '/api/contact' });
  if (options.contentType === null) request.headers.delete('content-type');
  else if (options.contentType) request.headers.set('content-type', options.contentType);
  return {
    request,
    get clientAddress(): string {
      if (options.ip === null) throw new Error('clientAddress is not available');
      return options.ip ?? '203.0.113.7';
    },
  };
}

/** Stubs submitContactMessage's insert, its one count query and the take-back delete. */
function stubSubmit(
  counts: { site?: number; senderDay?: number; senderHour?: number; repeats?: number } = {}
) {
  const inserts = stubDb('insert', [{ id: VENUE_ID }]);
  const selects = stubDb('select', [
    { site: 1, senderDay: 1, senderHour: 1, repeats: 0, ...counts },
  ]);
  const deletes = stubDb('delete', []);
  return { inserts, selects, deletes };
}

const stored = (inserts: { method: string; args: unknown[] }[]) =>
  inserts.find((call) => call.method === 'values')?.args[0] as Record<string, unknown> | undefined;

describe('GET /api/contact', () => {
  it('gives a fresh time-trap token while the form is on, and is never cached', async () => {
    const response = await GET({} as never);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const body = await response.json();
    assert.equal(body.enabled, true);
    assert.equal(contactForm.check(body.formToken), 'too_fast');
  });

  it('says the form is off, with no token, when switched off', async () => {
    process.env.CONTACT_FORM = 'off';
    const body = await (await GET({} as never)).json();
    assert.deepEqual(body, { enabled: false });
  });
});

describe('POST /api/contact', () => {
  it('stores a valid message, hashed sender only, and then notifies the Chairs', async () => {
    const { inserts, deletes } = stubSubmit();
    const response = await run(POST, publicContext(input()));
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { ok: true });

    const values = stored(inserts)!;
    assert.equal(values.name, 'Delegate Reynolds');
    assert.equal(values.topic, 'press');
    assert.match(values.senderHash as string, /^[0-9a-f]{32}$/);
    assert.match(values.bodyHash as string, /^[0-9a-f]{32}$/);
    assert.equal('website' in values, false);
    assert.equal('formToken' in values, false);
    assert.ok(!JSON.stringify(values).includes('203.0.113.7'));
    assert.equal(deletes.length, 0);

    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(pushes, [{ type: 'contact' }]);
    assert.deepEqual(logged, ['[contact] accepted']);
  });

  it('answers 503 when switched off, before anything else', async () => {
    process.env.CONTACT_FORM = 'off';
    const inserts = stubDb('insert', []);
    const response = await run(
      POST,
      publicContext(input(), { origin: 'https://attacker.example' })
    );
    assert.equal(response.status, 503);
    assert.equal(inserts.length, 0);
  });

  it('refuses other origins and requests without one', async () => {
    const inserts = stubDb('insert', []);
    assert.equal(
      (await run(POST, publicContext(input(), { origin: 'https://attacker.example' }))).status,
      403
    );
    assert.equal((await run(POST, publicContext(input(), { origin: null }))).status, 403);
    assert.equal(inserts.length, 0);
  });

  it('takes JSON only', async () => {
    const inserts = stubDb('insert', []);
    for (const contentType of ['text/plain', 'application/x-www-form-urlencoded', null]) {
      const response = await run(POST, publicContext(input(), { contentType }));
      assert.equal(response.status, 415, String(contentType));
    }
    assert.equal(inserts.length, 0);
    stubSubmit();
    const withCharset = publicContext(input(), { contentType: 'application/json; charset=utf-8' });
    assert.equal((await run(POST, withCharset)).status, 201);
  });

  it('refuses an oversized body with 413, by header or by size', async () => {
    const inserts = stubDb('insert', []);
    const huge = { ...input(), message: 'x'.repeat(20_000) };
    assert.equal((await run(POST, publicContext(huge))).status, 413);

    const declared = publicContext(input());
    const lying = new Request(declared.request, {
      headers: { ...Object.fromEntries(declared.request.headers), 'content-length': '999999' },
    });
    assert.equal((await run(POST, { ...declared, request: lying })).status, 413);
    assert.equal(inserts.length, 0);
  });

  it('refuses a body that is not JSON', async () => {
    const response = await run(POST, publicContext('{not json'));
    assert.equal(response.status, 400);
  });

  it('validates the fields in the usual shape', async () => {
    const inserts = stubDb('insert', []);
    const response = await run(
      POST,
      publicContext({ ...input(), name: 'Al\r\nBcc: x@example.com', message: 'short' })
    );
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.ok(body.fields.name);
    assert.ok(body.fields.message);
    assert.equal(inserts.length, 0);
  });

  it('pretends to accept a filled honeypot, storing and notifying nothing', async () => {
    const inserts = stubDb('insert', []);
    const response = await run(POST, publicContext({ ...input(), website: 'http://spam.example' }));
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(inserts.length, 0);
    assert.deepEqual(pushes, []);
    assert.deepEqual(logged, ['[contact] honeypot']);
  });

  it('pretends to accept a submit faster than the time trap', async () => {
    const inserts = stubDb('insert', []);
    const response = await run(POST, publicContext({ ...input(), formToken: contactForm.issue() }));
    assert.equal(response.status, 201);
    assert.equal(inserts.length, 0);
    assert.deepEqual(logged, ['[contact] too_fast']);
  });

  it('asks for a reload when the form is too old or the token is forged', async () => {
    const inserts = stubDb('insert', []);
    const stale = contactForm.issue(new Date(Date.now() - 3 * 60 * 60 * 1000));
    for (const formToken of [
      stale,
      'nonsense',
      formTokens('member-sign-in-form').issue(new Date(Date.now() - 5000)),
    ]) {
      const response = await run(POST, publicContext({ ...input(), formToken }));
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, /reload/);
    }
    assert.equal(inserts.length, 0);
  });

  it('silently drops a repeat of the same message from the same sender', async () => {
    const { deletes } = stubSubmit({ repeats: 1 });
    const response = await run(POST, publicContext(input()));
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(deletes.length > 0, true, 'the repeat is taken back out');
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(pushes, []);
    assert.deepEqual(logged, ['[contact] duplicate']);
  });

  it('answers 429 with friendly copy over the per-sender limits, taking the row back out', async () => {
    for (const counts of [{ senderHour: 4 }, { senderDay: 11 }]) {
      const { deletes } = stubSubmit(counts);
      const response = await run(POST, publicContext(input()));
      assert.equal(response.status, 429, JSON.stringify(counts));
      assert.match((await response.json()).error, /Chairs/);
      assert.ok(deletes.length > 0);
    }
    assert.deepEqual(pushes, []);
  });

  it('answers 429 over the site-wide daily limit', async () => {
    stubSubmit({ site: 51 });
    const response = await run(POST, publicContext(input()));
    assert.equal(response.status, 429);
    assert.match((await response.json()).error, /tomorrow/);
    assert.deepEqual(logged, ['[contact] rate_limited_site']);
  });

  it('counts the last day, up to now, in one query', async () => {
    const { selects } = stubSubmit();
    await run(POST, publicContext(input()));
    const { sql } = renderSql(selects.find((call) => call.method === 'where')!.args[0]);
    assert.match(
      sql,
      /"contact_messages"\."created_at" >= \$1 and "contact_messages"\."created_at" <= \$2/
    );
  });

  it('never logs who wrote or what', async () => {
    stubSubmit();
    await run(POST, publicContext(input()));
    const text = logged.join('\n');
    for (const secret of ['Reynolds', 'reynolds@example.com', 'pasty', '203.0.113.7']) {
      assert.ok(!text.includes(secret), secret);
    }
  });

  it('returns 500 on database errors, and notifies nobody', async () => {
    stubDb('insert', new Error('db down'));
    assert.equal((await quietly(() => run(POST, publicContext(input())))).status, 500);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(pushes, []);
  });
});

const ctx = (method: string, id: string | undefined, body?: unknown) => ({
  request: adminRequest(method, body),
  params: { id },
});

const messageRow = {
  id: VENUE_ID,
  name: 'Delegate Reynolds',
  email: 'reynolds@example.com',
  topic: 'press',
  message: 'Hello',
  status: 'read',
  senderHash: 'secret-sender',
  bodyHash: 'secret-body',
  createdAt: new Date('2026-11-01T12:00:00Z'),
};

describe('/api/admin/contact/[id]', () => {
  it('needs a signed-in Chair, from this site', async () => {
    signInAs(null);
    assert.equal((await run(byId.PATCH, ctx('PATCH', VENUE_ID, { status: 'read' }))).status, 401);
    assert.equal((await run(byId.DELETE, ctx('DELETE', VENUE_ID))).status, 401);
    signInAs({ id: 'member-1', email: 'm@example.com', role: 'user' });
    assert.equal((await run(byId.PATCH, ctx('PATCH', VENUE_ID, { status: 'read' }))).status, 403);
    assert.equal((await run(byId.DELETE, ctx('DELETE', VENUE_ID))).status, 403);
    signInAs();
    const foreign = {
      request: adminRequest('DELETE', undefined, { origin: 'https://attacker.example' }),
      params: { id: VENUE_ID },
    };
    assert.equal((await run(byId.DELETE, foreign)).status, 403);
  });

  it('marks a message read or handled, without the hashes in the answer', async () => {
    signInAs();
    for (const status of ['read', 'handled', 'new'] as const) {
      const updates = stubDb('update', [{ ...messageRow, status }]);
      const response = await run(byId.PATCH, ctx('PATCH', VENUE_ID, { status }));
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.message.status, status);
      assert.ok(!JSON.stringify(body).includes('secret-'));
      assert.deepEqual(updates.find((call) => call.method === 'set')!.args[0], { status });
    }
  });

  it('refuses other statuses, bad ids and missing messages', async () => {
    signInAs();
    assert.equal((await run(byId.PATCH, ctx('PATCH', VENUE_ID, { status: 'spam' }))).status, 400);
    assert.equal(
      (await run(byId.PATCH, ctx('PATCH', 'not-a-uuid', { status: 'read' }))).status,
      404
    );
    stubDb('update', []);
    const missing = await run(byId.PATCH, ctx('PATCH', VENUE_ID, { status: 'read' }));
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).error, 'Message not found.');
  });

  it('deletes, 404s when missing and 500s on errors', async () => {
    signInAs();
    stubDb('delete', [{ id: VENUE_ID }]);
    assert.equal((await run(byId.DELETE, ctx('DELETE', VENUE_ID))).status, 200);
    stubDb('delete', []);
    assert.equal((await run(byId.DELETE, ctx('DELETE', VENUE_ID))).status, 404);
    stubDb('delete', new Error('db down'));
    assert.equal((await quietly(() => run(byId.DELETE, ctx('DELETE', VENUE_ID)))).status, 500);
  });
});

describe('GET /api/cron/contact-retention', () => {
  const call = (authorization?: string) =>
    RETENTION({
      request: new Request(`${SITE}/api/cron/contact-retention`, {
        headers: authorization ? { authorization } : {},
      }),
    } as never) as Promise<Response>;

  it('refuses requests without the cron secret, and everything when none is set', async () => {
    const deletes = stubDb('delete', []);
    assert.equal((await call()).status, 401);
    process.env.CRON_SECRET = 'cron-secret';
    assert.equal((await call('Bearer wrong')).status, 401);
    assert.equal(deletes.length, 0);
  });

  it('deletes messages older than 90 days, whatever their status', async () => {
    process.env.CRON_SECRET = 'cron-secret';
    const deletes = stubDb('delete', [{ id: 'a' }, { id: 'b' }]);
    const before = Date.now();
    const response = await call('Bearer cron-secret');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { deleted: 2 });
    const { sql, params } = renderSql(deletes.find((call) => call.method === 'where')!.args[0]);
    assert.match(sql, /^"contact_messages"\."created_at" < \$1$/);
    const cutoff = new Date(params[0] as string).getTime();
    const ninetyDays = 90 * 24 * 60 * 60 * 1000;
    assert.ok(Math.abs(before - ninetyDays - cutoff) < 5000);
  });
});
