import '../../test/setup-env';
import { afterEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { getTurnstileEnvironment, TURNSTILE_TEST_SITE_KEY } from '@/lib/env';
import { turnstileTransport, verifyTurnstile } from './turnstile';

const saved = {
  VERCEL_ENV: process.env.VERCEL_ENV,
  TURNSTILE_SITE_KEY: process.env.TURNSTILE_SITE_KEY,
  TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
};

afterEach(() => {
  mock.restoreAll();
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('getTurnstileEnvironment', () => {
  it('uses Cloudflare’s test keys everywhere but Production, whatever is configured', () => {
    process.env.TURNSTILE_SITE_KEY = 'real-site';
    process.env.TURNSTILE_SECRET_KEY = 'real-secret';
    for (const vercelEnv of [undefined, 'preview', 'development']) {
      if (vercelEnv) process.env.VERCEL_ENV = vercelEnv;
      else delete process.env.VERCEL_ENV;
      const config = getTurnstileEnvironment();
      assert.equal(config.mode, 'test');
      assert.equal(config.siteKey, TURNSTILE_TEST_SITE_KEY);
      assert.notEqual(config.secretKey, 'real-secret');
    }
  });

  it('uses the configured keys in Production, and has none (fails closed) without them', () => {
    process.env.VERCEL_ENV = 'production';
    process.env.TURNSTILE_SITE_KEY = 'real-site';
    process.env.TURNSTILE_SECRET_KEY = 'real-secret';
    assert.deepEqual(getTurnstileEnvironment(), {
      mode: 'live',
      siteKey: 'real-site',
      secretKey: 'real-secret',
    });
    delete process.env.TURNSTILE_SITE_KEY;
    delete process.env.TURNSTILE_SECRET_KEY;
    assert.deepEqual(getTurnstileEnvironment(), { mode: 'live', siteKey: null, secretKey: null });
  });
});

describe('verifyTurnstile', () => {
  const answer = (body: unknown, status = 200) =>
    mock.method(turnstileTransport, 'post', async () => Response.json(body, { status }));

  it('accepts a token Cloudflare accepts, and sends the secret, token and address', async () => {
    const post = answer({ success: true });
    assert.equal(await verifyTurnstile('tok', '198.51.100.4'), 'ok');
    const body = post.mock.calls[0]!.arguments[0]!;
    assert.equal(body.get('response'), 'tok');
    assert.equal(body.get('remoteip'), '198.51.100.4');
    assert.ok(body.get('secret'));
  });

  it('omits the address when there is none', async () => {
    const post = answer({ success: true });
    await verifyTurnstile('tok', null);
    assert.equal(post.mock.calls[0]!.arguments[0]!.has('remoteip'), false);
  });

  it('rejects a token Cloudflare rejects', async () => {
    answer({ success: false, 'error-codes': ['invalid-input-response'] });
    assert.equal(await verifyTurnstile('tok', null), 'failed');
  });

  it('rejects a missing, empty or oversized token without asking Cloudflare', async () => {
    const post = answer({ success: true });
    for (const token of [undefined, '', 42, 'x'.repeat(2049)]) {
      assert.equal(await verifyTurnstile(token, null), 'failed');
    }
    assert.equal(post.mock.callCount(), 0);
  });

  it('fails closed when Cloudflare errors, times out or answers nonsense', async () => {
    answer({}, 500);
    assert.equal(await verifyTurnstile('tok', null), 'unavailable');
    mock.restoreAll();
    mock.method(turnstileTransport, 'post', async () => {
      throw new Error('timeout');
    });
    assert.equal(await verifyTurnstile('tok', null), 'unavailable');
    mock.restoreAll();
    mock.method(turnstileTransport, 'post', async () => new Response('not json'));
    assert.equal(await verifyTurnstile('tok', null), 'unavailable');
  });

  it('is unavailable in Production with no secret key', async () => {
    process.env.VERCEL_ENV = 'production';
    delete process.env.TURNSTILE_SECRET_KEY;
    const post = answer({ success: true });
    assert.equal(await verifyTurnstile('tok', null), 'unavailable');
    assert.equal(post.mock.callCount(), 0);
  });
});
