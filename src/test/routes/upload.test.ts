import '../setup-env';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '@/pages/api/admin/upload';
import { adminRequest, quietly, restoreStubs, run, signInAs } from '../route-helpers';

let savedToken: string | undefined;

beforeEach(() => {
  savedToken = process.env.BLOB_READ_WRITE_TOKEN;
  process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_testStore_secret';
});

afterEach(() => {
  restoreStubs();
  if (savedToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
  else process.env.BLOB_READ_WRITE_TOKEN = savedToken;
});

const tokenRequest = (pathname: string) =>
  adminRequest('POST', {
    type: 'blob.generate-client-token',
    payload: { pathname, callbackUrl: 'https://lunch.example.com/api/admin/upload', multipart: false, clientPayload: null },
  });

describe('POST /api/admin/upload', () => {
  it('requires an admin', async () => {
    signInAs(null);
    assert.equal((await run(POST, { request: tokenRequest('venues/a.jpg') })).status, 401);
  });

  it('reports when uploads are not configured', async () => {
    signInAs();
    delete process.env.BLOB_READ_WRITE_TOKEN;
    assert.equal((await run(POST, { request: tokenRequest('venues/a.jpg') })).status, 503);
  });

  it('only supports client token generation', async () => {
    signInAs();
    assert.equal((await run(POST, { request: adminRequest('POST', { type: 'blob.upload-completed' }) })).status, 400);
    assert.equal((await run(POST, { request: adminRequest('POST', '{nope') })).status, 400);
  });

  it('rejects paths outside venues/', async () => {
    signInAs();
    for (const pathname of ['../etc/passwd', 'other/a.jpg', 'venues/A B.jpg', 'venues/nested/a.jpg']) {
      const response = await run(POST, { request: tokenRequest(pathname) });
      assert.equal(response.status, 400, pathname);
      assert.deepEqual(await response.json(), { error: 'Invalid file name.' });
    }
  });

  it('issues a client token for a valid venue image path', async () => {
    signInAs();
    const response = await quietly(() => run(POST, { request: tokenRequest('venues/chip-shop.jpg') }));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.type, 'blob.generate-client-token');
    assert.ok(body.clientToken);
  });
});
