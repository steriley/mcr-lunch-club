import '../test/setup-env';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formTokens, MAX_FORM_MS, MIN_FORM_MS } from './form-token';

const issued = new Date('2026-11-12T12:00:00Z');
const later = (ms: number) => new Date(issued.getTime() + ms);

describe('formTokens', () => {
  it('accepts a token between the minimum and maximum age', () => {
    const form = formTokens('contact-timetrap');
    const token = form.issue(issued);
    assert.equal(form.check(token, later(MIN_FORM_MS)), 'ok');
    assert.equal(form.check(token, later(MAX_FORM_MS)), 'ok');
    assert.equal(form.check(token, later(MIN_FORM_MS - 1)), 'too_fast');
    assert.equal(form.check(token, later(MAX_FORM_MS + 1)), 'expired');
  });

  it('keeps each form’s tokens its own', () => {
    const contact = formTokens('contact-timetrap');
    const signIn = formTokens('member-sign-in-form');
    assert.equal(signIn.check(contact.issue(issued), later(MIN_FORM_MS)), 'invalid');
    assert.equal(contact.check(signIn.issue(issued), later(MIN_FORM_MS)), 'invalid');
  });

  it('refuses a changed timestamp, a forged signature and junk', () => {
    const form = formTokens('contact-timetrap');
    const [stamp, signature] = form.issue(issued).split('.');
    assert.equal(
      form.check(`${Number(stamp) - 60_000}.${signature}`, later(MIN_FORM_MS)),
      'invalid'
    );
    assert.equal(form.check(`${stamp}.${'0'.repeat(64)}`, later(MIN_FORM_MS)), 'invalid');
    assert.equal(form.check('nonsense', later(MIN_FORM_MS)), 'invalid');
    assert.equal(form.check(42, later(MIN_FORM_MS)), 'invalid');
    assert.equal(form.check(form.issue(issued), later(-1)), 'invalid');
  });

  it('never puts the secret in the token', () => {
    const token = formTokens('contact-timetrap').issue(issued);
    assert.ok(!token.includes(process.env.BETTER_AUTH_SECRET!));
  });
});
