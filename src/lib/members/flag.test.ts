import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resetDefaultFlagsClient } from '@vercel/flags-core';
import { isMembersEnabled } from './flag';

const saved = {
  FLAGS: process.env.FLAGS,
  MEMBERS_FLAG: process.env.MEMBERS_FLAG,
  NODE_ENV: process.env.NODE_ENV,
};

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetDefaultFlagsClient();
});

describe('members flag', () => {
  it('is off without Vercel Flags credentials or with an unusable key', async () => {
    delete process.env.FLAGS;
    delete process.env.MEMBERS_FLAG;
    assert.equal(await isMembersEnabled(), false);
    process.env.FLAGS = 'not-an-sdk-key';
    assert.equal(await isMembersEnabled(), false);
  });

  it('can be forced on or off outside production with MEMBERS_FLAG', async () => {
    delete process.env.NODE_ENV;
    process.env.MEMBERS_FLAG = 'on';
    assert.equal(await isMembersEnabled(), true);
    process.env.MEMBERS_FLAG = 'off';
    assert.equal(await isMembersEnabled(), false);
  });

  it('ignores MEMBERS_FLAG on deployments', async () => {
    process.env.NODE_ENV = 'production';
    process.env.MEMBERS_FLAG = 'on';
    delete process.env.FLAGS;
    assert.equal(await isMembersEnabled(), false);
  });
});
