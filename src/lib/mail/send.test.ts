import { afterEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mailTransport, sendMail } from './send';

const KEYS = ['VERCEL_ENV', 'RESEND_API_KEY', 'RESEND_EMAIL_DOMAIN', 'MAIL_FROM'];
const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
const message = { to: 'sam@example.com', subject: 'Hi', text: 'code 123456', html: '<p>Hi</p>' };

afterEach(() => {
  mock.restoreAll();
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

function setEnv(values: Record<string, string | undefined>) {
  for (const key of KEYS) delete process.env[key];
  Object.assign(process.env, values);
}

describe('sendMail', () => {
  it('only logs outside the Production deployment, even with an API key (Previews included)', async () => {
    setEnv({
      VERCEL_ENV: 'preview',
      RESEND_API_KEY: 're_test',
      RESEND_EMAIL_DOMAIN: 'mail.example.com',
    });
    const post = mock.method(mailTransport, 'post', async () => new Response(null));
    const log = mock.method(mailTransport, 'log', () => undefined);
    assert.equal(await sendMail(message), 'logged');
    assert.equal(post.mock.callCount(), 0);
    assert.equal(log.mock.callCount(), 1);
  });

  it('sends through Resend in Production, from noreply@ the integration’s domain', async () => {
    setEnv({
      VERCEL_ENV: 'production',
      RESEND_API_KEY: 're_live',
      RESEND_EMAIL_DOMAIN: 'mail.example.com',
    });
    const post = mock.method(
      mailTransport,
      'post',
      async () => new Response('{}', { status: 200 })
    );
    assert.equal(await sendMail(message), 'sent');
    const [apiKey, body] = post.mock.calls[0].arguments as [string, Record<string, unknown>];
    assert.equal(apiKey, 're_live');
    assert.equal(body.from, 'MCR Lunch Club <noreply@mail.example.com>');
    assert.deepEqual(body.to, ['sam@example.com']);
  });

  it('prefers MAIL_FROM', async () => {
    setEnv({
      VERCEL_ENV: 'production',
      RESEND_API_KEY: 're_live',
      MAIL_FROM: 'Club <hi@example.com>',
    });
    const post = mock.method(mailTransport, 'post', async () => new Response('{}'));
    await sendMail(message);
    assert.equal(
      (post.mock.calls[0].arguments[1] as { from: string }).from,
      'Club <hi@example.com>'
    );
  });

  it('in Production, fails without logging the message when the key or sender is missing', async () => {
    setEnv({ VERCEL_ENV: 'production', RESEND_EMAIL_DOMAIN: 'mail.example.com' });
    const log = mock.method(mailTransport, 'log', () => undefined);
    const error = mock.method(console, 'error', () => undefined);
    assert.equal(await sendMail(message), 'failed');
    assert.equal(log.mock.callCount(), 0);
    assert.ok(!String(error.mock.calls[0].arguments).includes('123456'));
  });

  it('reports a refused or failed send without throwing', async () => {
    setEnv({
      VERCEL_ENV: 'production',
      RESEND_API_KEY: 're_live',
      RESEND_EMAIL_DOMAIN: 'mail.example.com',
    });
    mock.method(console, 'error', () => undefined);
    mock.method(mailTransport, 'post', async () => new Response('{}', { status: 422 }));
    assert.equal(await sendMail(message), 'failed');
    mock.method(mailTransport, 'post', async () => {
      throw new Error('network');
    });
    assert.equal(await sendMail(message), 'failed');
  });
});
