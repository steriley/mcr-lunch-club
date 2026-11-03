import './setup-env';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resetDefaultFlagsClient } from '@vercel/flags-core';
import { isSnowEnabled } from '@/lib/snow';
import { GET } from '@/pages/api/flags/snow';

const original = process.env.FLAGS;

afterEach(() => {
  if (original === undefined) delete process.env.FLAGS;
  else process.env.FLAGS = original;
  resetDefaultFlagsClient();
});

describe('snow flag', () => {
  it('is off without Vercel Flags credentials', async () => {
    delete process.env.FLAGS;
    assert.equal(await isSnowEnabled(), false);
  });

  it('is off when the SDK key is unusable', async () => {
    process.env.FLAGS = 'not-an-sdk-key';
    assert.equal(await isSnowEnabled(), false);
  });

  it('is served as JSON that the CDN may cache briefly', async () => {
    delete process.env.FLAGS;
    const response = (await GET({} as any)) as Response;
    assert.deepEqual(await response.json(), { enabled: false });
    assert.match(response.headers.get('Cache-Control') ?? '', /s-maxage=60/);
  });
});
