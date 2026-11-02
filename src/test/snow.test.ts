import './setup-env';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isSnowEnabled } from '@/lib/snow';
import { GET } from '@/pages/api/flags/snow';

const original = process.env.EDGE_CONFIG;

afterEach(() => {
  if (original === undefined) delete process.env.EDGE_CONFIG;
  else process.env.EDGE_CONFIG = original;
});

describe('snow flag', () => {
  it('is off when no Edge Config store is linked', async () => {
    delete process.env.EDGE_CONFIG;
    assert.equal(await isSnowEnabled(), false);
  });

  it('is off when the store cannot be read', async () => {
    process.env.EDGE_CONFIG = 'not-a-connection-string';
    assert.equal(await isSnowEnabled(), false);
  });

  it('is served as JSON that the CDN may cache briefly', async () => {
    delete process.env.EDGE_CONFIG;
    const response = (await GET({} as any)) as Response;
    assert.deepEqual(await response.json(), { enabled: false });
    assert.match(response.headers.get('Cache-Control') ?? '', /s-maxage=60/);
  });
});
