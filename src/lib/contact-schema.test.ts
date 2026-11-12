import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTACT_LIMITS,
  contactInputSchema,
  countUrls,
  hasControlCharacters,
  normaliseContactMessage,
  normaliseContactText,
} from './contact-schema';

const valid = {
  name: 'Delegate Reynolds',
  email: 'reynolds@example.com',
  topic: 'general',
  message: 'Is the pasty verdict final? Asking for a friend.',
  formToken: 'token',
};

const fieldErrors = (input: Record<string, unknown>) => {
  const result = contactInputSchema.safeParse({ ...valid, ...input });
  return result.success
    ? {}
    : Object.fromEntries(result.error.issues.map((i) => [i.path[0], i.message]));
};

describe('contactInputSchema', () => {
  it('accepts a valid message and trims it', () => {
    const result = contactInputSchema.parse({ ...valid, name: '  Delegate Reynolds  ' });
    assert.equal(result.name, 'Delegate Reynolds');
    assert.equal(result.topic, 'general');
  });

  it('enforces the length limits', () => {
    assert.ok(fieldErrors({ name: 'A' }).name);
    assert.ok(fieldErrors({ name: 'A'.repeat(CONTACT_LIMITS.name.max + 1) }).name);
    assert.ok(fieldErrors({ message: 'Too short' }).message);
    assert.ok(fieldErrors({ message: 'x'.repeat(CONTACT_LIMITS.message.max + 1) }).message);
    assert.ok(fieldErrors({ email: `${'a'.repeat(250)}@example.com` }).email);
    assert.deepEqual(fieldErrors({ name: 'Al' }), {});
  });

  it('counts the limits after trimming and dropping invisible characters', () => {
    // Ten zero-width spaces and a single letter are not a two-character name.
    assert.ok(fieldErrors({ name: `A${'\u200B'.repeat(10)}` }).name);
    assert.ok(fieldErrors({ message: `   short   ${'\u200B'.repeat(20)}` }).message);
  });

  it('rejects control characters and line breaks in the name and the email', () => {
    for (const bad of [
      'Al\nBcc: x@example.com',
      'Al\rice',
      'Al\u0000ice',
      'Al\u007Fice',
      'Al\tice',
    ]) {
      assert.ok(fieldErrors({ name: bad }).name, JSON.stringify(bad));
    }
    assert.ok(fieldErrors({ email: 'a@example.com\r\nBcc: b@example.com' }).email);
    assert.ok(fieldErrors({ email: 'a@exa\u0085mple.com' }).email);
  });

  it('keeps line breaks in the message and drops other control characters', () => {
    const result = contactInputSchema.parse({
      ...valid,
      message: 'First line\r\nSecond line\rThird\u0007 line',
    });
    assert.equal(result.message, 'First line\nSecond line\nThird line');
  });

  it('refuses more than two links', () => {
    assert.deepEqual(
      fieldErrors({ message: 'See https://a.example and www.b.example please' }),
      {}
    );
    assert.ok(
      fieldErrors({ message: 'http://a.example https://b.example www.c.example buy now' }).message
    );
  });

  it('refuses an unknown topic and a bad email', () => {
    assert.ok(fieldErrors({ topic: 'complaints' }).topic);
    assert.ok(fieldErrors({ email: 'not-an-email' }).email);
  });

  it('normalises Unicode to NFC', () => {
    const decomposed = 'Jose\u0301 Mourinho';
    const result = contactInputSchema.parse({ ...valid, name: decomposed });
    assert.equal(result.name, 'José Mourinho');
  });
});

describe('contact text helpers', () => {
  it('strips zero-width and bidirectional control characters', () => {
    assert.equal(normaliseContactText('\uFEFFHe\u200Bllo\u202E\u2066 '), 'Hello');
    assert.equal(normaliseContactMessage('a\u200D\r\nb'), 'a\nb');
  });

  it('spots control characters', () => {
    assert.equal(hasControlCharacters('plain'), false);
    assert.equal(hasControlCharacters('line\nbreak'), true);
    assert.equal(hasControlCharacters('c1\u0090'), true);
  });

  it('counts links by scheme or www', () => {
    assert.equal(countUrls('no links here'), 0);
    assert.equal(countUrls('HTTPS://A.EXAMPLE and ftp://b and www.c.example'), 3);
    assert.equal(countUrls('email me at a@www.example.com'), 1);
  });
});
