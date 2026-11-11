import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resetDefaultFlagsClient } from '@vercel/flags-core';
import { isMembersEnabled } from './flag';

const saved = {
  FLAGS: process.env.FLAGS,
  MEMBERS_FLAG: process.env.MEMBERS_FLAG,
  NODE_ENV: process.env.NODE_ENV,
  VERCEL: process.env.VERCEL,
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

  it('can be forced on or off with MEMBERS_FLAG off Vercel, local builds included', async () => {
    delete process.env.VERCEL;
    for (const nodeEnv of [undefined, 'production']) {
      if (nodeEnv) process.env.NODE_ENV = nodeEnv;
      else delete process.env.NODE_ENV;
      process.env.MEMBERS_FLAG = 'on';
      assert.equal(await isMembersEnabled(), true, `NODE_ENV=${nodeEnv}`);
      process.env.MEMBERS_FLAG = 'off';
      assert.equal(await isMembersEnabled(), false, `NODE_ENV=${nodeEnv}`);
    }
  });

  it('ignores MEMBERS_FLAG on Vercel deployments, builds and functions alike', async () => {
    process.env.VERCEL = '1';
    process.env.MEMBERS_FLAG = 'on';
    delete process.env.FLAGS;
    assert.equal(await isMembersEnabled(), false);
  });
});
