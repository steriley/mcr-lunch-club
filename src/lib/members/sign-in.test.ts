import '../../test/setup-env';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkFormToken,
  collectSignInEmail,
  emailHash,
  issueFormToken,
  MAX_FORM_MS,
  MIN_FORM_MS,
  recordSignInEmailPart,
  senderHash,
  signInEmail,
} from './sign-in';

describe('the sign-in form’s time trap', () => {
  const issued = new Date('2026-11-10T12:00:00Z');
  const later = (ms: number) => new Date(issued.getTime() + ms);

  it('accepts a submit between three seconds and two hours', () => {
    const token = issueFormToken(issued);
    assert.equal(checkFormToken(token, later(MIN_FORM_MS)), 'ok');
    assert.equal(checkFormToken(token, later(MAX_FORM_MS)), 'ok');
  });

  it('treats an instant submit as a bot and an old form as expired', () => {
    const token = issueFormToken(issued);
    assert.equal(checkFormToken(token, later(500)), 'too_fast');
    assert.equal(checkFormToken(token, later(MAX_FORM_MS + 1)), 'expired');
  });

  it('rejects forged, altered and missing tokens', () => {
    const token = issueFormToken(issued);
    const [stamp, signature] = token.split('.');
    assert.equal(
      checkFormToken(`${Number(stamp) - 60_000}.${signature}`, later(MIN_FORM_MS)),
      'invalid'
    );
    assert.equal(
      checkFormToken(`${stamp}.${'0'.repeat(signature.length)}`, later(MIN_FORM_MS)),
      'invalid'
    );
    assert.equal(checkFormToken('nonsense', later(MIN_FORM_MS)), 'invalid');
    assert.equal(checkFormToken(undefined, later(MIN_FORM_MS)), 'invalid');
    assert.equal(checkFormToken(token, later(-1000)), 'invalid');
  });
});

describe('sign-in hashes', () => {
  it('normalise the email and never contain it', () => {
    assert.equal(emailHash(' Sam@Example.com '), emailHash('sam@example.com'));
    assert.notEqual(emailHash('sam@example.com'), emailHash('jo@example.com'));
    assert.ok(!emailHash('sam@example.com').includes('sam'));
  });

  it('keep the IP hash apart from the email hash and from the suggestion form', () => {
    assert.equal(senderHash(null), null);
    assert.notEqual(senderHash('1.2.3.4'), emailHash('1.2.3.4'));
  });
});

describe('collecting the link and the code', () => {
  it('gathers both parts for one email while a request runs', async () => {
    const parts = await collectSignInEmail(async () => {
      assert.equal(recordSignInEmailPart({ url: 'https://lunch.example.com/verify' }), true);
      await Promise.resolve();
      assert.equal(recordSignInEmailPart({ otp: '123456' }), true);
    });
    assert.deepEqual(parts, { url: 'https://lunch.example.com/verify', otp: '123456' });
  });

  it('drops a part when no request is collecting, so nothing is sent', () => {
    assert.equal(recordSignInEmailPart({ otp: '123456' }), false);
  });
});

describe('the sign-in email', () => {
  it('carries the link and the code, says how long they last, and escapes the link', () => {
    const message = signInEmail('sam@example.com', {
      url: 'https://lunch.example.com/api/auth/magic-link/verify?token=a&b="x"',
      otp: '482913',
    });
    assert.equal(message.to, 'sam@example.com');
    assert.ok(!message.subject.includes('482913'), 'no code on lock screens');
    assert.match(message.text, /482913/);
    assert.match(message.text, /10 minutes/);
    assert.match(message.html, /&#38;b=&#34;x&#34;/);
  });
});
