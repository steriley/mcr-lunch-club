import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resetDefaultFlagsClient } from '@vercel/flags-core';
import { isContactEnabled } from './contact-flag';

const saved = {
  FLAGS: process.env.FLAGS,
  CONTACT_FORM: process.env.CONTACT_FORM,
  VERCEL: process.env.VERCEL,
};

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetDefaultFlagsClient();
});

describe('contact flag', () => {
  it('fails open: on without Vercel Flags credentials or with an unusable key', async () => {
    delete process.env.VERCEL;
    delete process.env.CONTACT_FORM;
    delete process.env.FLAGS;
    assert.equal(await isContactEnabled(), true);
    process.env.FLAGS = 'not-an-sdk-key';
    assert.equal(await isContactEnabled(), true);
  });

  it('can be forced on or off with CONTACT_FORM off Vercel', async () => {
    delete process.env.VERCEL;
    process.env.CONTACT_FORM = 'off';
    assert.equal(await isContactEnabled(), false);
    process.env.CONTACT_FORM = ' ON ';
    assert.equal(await isContactEnabled(), true);
  });

  it('ignores CONTACT_FORM on Vercel', async () => {
    process.env.VERCEL = '1';
    process.env.CONTACT_FORM = 'off';
    delete process.env.FLAGS;
    assert.equal(await isContactEnabled(), true);
  });
});
