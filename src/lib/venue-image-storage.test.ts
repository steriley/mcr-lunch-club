import '../test/setup-env';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { blobClient, blobPhotoStore, isOwnedBlobUrl } from './venue-image-storage';

describe('isOwnedBlobUrl', () => {
  it('accepts our public Vercel Blob URLs', () => {
    assert.equal(
      isOwnedBlobUrl('https://abc123.public.blob.vercel-storage.com/dev/venues/v/i-full.webp'),
      true
    );
    assert.equal(
      isOwnedBlobUrl('https://ABC123.Public.Blob.Vercel-Storage.com/venues/old.jpg'),
      true
    );
  });

  it('rejects external links and look-alike hosts', () => {
    for (const url of [
      'https://example.com/photo.jpg',
      'https://images.unsplash.com/photo-1?w=800',
      'https://public.blob.vercel-storage.com/x.webp',
      'https://abc.public.blob.vercel-storage.com.evil.com/x.webp',
      'https://evil.com/abc.public.blob.vercel-storage.com/x.webp',
      'https://evil.com/?u=abc.public.blob.vercel-storage.com',
      'http://abc.public.blob.vercel-storage.com/x.webp',
    ]) {
      assert.equal(isOwnedBlobUrl(url), false, url);
    }
  });

  it('rejects empty and unparseable values', () => {
    assert.equal(isOwnedBlobUrl(null), false);
    assert.equal(isOwnedBlobUrl(undefined), false);
    assert.equal(isOwnedBlobUrl(''), false);
    assert.equal(isOwnedBlobUrl('not a url'), false);
  });
});

describe('blobPhotoStore', () => {
  const OWNED = 'https://store123.public.blob.vercel-storage.com/dev/venues/v/i-full.webp';
  const original = { ...blobClient };
  const saved = {
    token: process.env.BLOB_READ_WRITE_TOKEN,
    storeId: process.env.BLOB_STORE_ID,
    vercel: process.env.VERCEL_ENV,
  };
  let puts: { key: string; options: Record<string, unknown> }[];
  let deleted: string[][];

  beforeEach(() => {
    puts = [];
    deleted = [];
    (blobClient as any).put = async (
      key: string,
      _body: unknown,
      options: Record<string, unknown>
    ) => {
      puts.push({ key, options });
      return { url: `https://store123.public.blob.vercel-storage.com/${key}` };
    };
    (blobClient as any).del = async (urls: string[]) => {
      deleted.push(urls);
    };
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_testStore_secret';
    delete process.env.BLOB_STORE_ID;
    delete process.env.VERCEL_ENV;
  });

  afterEach(() => {
    Object.assign(blobClient, original);
    for (const [key, value] of [
      ['BLOB_READ_WRITE_TOKEN', saved.token],
      ['BLOB_STORE_ID', saved.storeId],
      ['VERCEL_ENV', saved.vercel],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('stores public, uncached-forever WebP files under the environment prefix', async () => {
    const store = blobPhotoStore('token-1');
    const url = await store.put('venues/v/i-full.webp', new Uint8Array([1]));
    assert.equal(url, 'https://store123.public.blob.vercel-storage.com/dev/venues/v/i-full.webp');
    assert.deepEqual(puts[0].options, {
      access: 'public',
      contentType: 'image/webp',
      addRandomSuffix: false,
      cacheControlMaxAge: 365 * 24 * 60 * 60,
      token: 'token-1',
    });

    for (const [vercelEnv, prefix] of [
      ['preview', 'preview'],
      ['production', 'prod'],
    ] as const) {
      process.env.VERCEL_ENV = vercelEnv;
      await blobPhotoStore(undefined).put('venues/v/i-thumb.webp', new Uint8Array([1]));
      assert.equal(puts.at(-1)!.key, `${prefix}/venues/v/i-thumb.webp`);
    }
  });

  it('never passes a migrated external link to del()', async () => {
    await blobPhotoStore(undefined).delete([OWNED, 'https://example.com/migrated.jpg']);
    assert.deepEqual(deleted, [[OWNED]]);
    await blobPhotoStore(undefined).delete(['https://example.com/migrated.jpg']);
    assert.equal(deleted.length, 1, 'nothing owned, nothing deleted');
  });

  it('succeeds even when the blob delete fails, and when uploads are not configured', async () => {
    (blobClient as any).del = async () => {
      throw new Error('blob store down');
    };
    const quiet = console.error;
    console.error = () => {};
    try {
      await blobPhotoStore(undefined).delete([OWNED]);
      delete process.env.BLOB_READ_WRITE_TOKEN;
      await blobPhotoStore(undefined).delete([OWNED]);
    } finally {
      console.error = quiet;
    }
  });
});
