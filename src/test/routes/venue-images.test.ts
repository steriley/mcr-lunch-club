import '../setup-env';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '@/pages/api/admin/venues/[id]/images';
import { DELETE, PATCH } from '@/pages/api/admin/venues/[id]/images/[imageId]';
import { blobClient } from '@/lib/venue-image-storage';
import {
  ADMIN,
  SITE,
  VENUE_ID,
  adminRequest,
  quietly,
  restoreStubs,
  run,
  signInAs,
  stubDbSequence,
  stubTransactions,
} from '../route-helpers';
import { JPEG, VP8, VP8X, webpWithSize } from '../webp-samples';

const IMAGE_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const BLOB_HOST = 'https://store123.public.blob.vercel-storage.com';
const now = new Date('2026-10-22T09:00:00.000Z');

const imageRow = (overrides: Record<string, unknown> = {}) => ({
  id: IMAGE_ID,
  venueId: VENUE_ID,
  fullUrl: `${BLOB_HOST}/dev/venues/${VENUE_ID}/${IMAGE_ID}-full.webp`,
  thumbUrl: `${BLOB_HOST}/dev/venues/${VENUE_ID}/${IMAGE_ID}-thumb.webp`,
  width: 29,
  height: 43,
  caption: null,
  isPrimary: true,
  focalX: null,
  focalY: null,
  uploadedBy: ADMIN.id,
  createdAt: now,
  ...overrides,
});

// --- Blob stubs -------------------------------------------------------------

interface PutCall {
  key: string;
  size: number;
  options: Record<string, unknown>;
}

let puts: PutCall[];
let dels: string[][];
let failPutAt: number | null;
const originalBlob = { ...blobClient };
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  puts = [];
  dels = [];
  failPutAt = null;
  (blobClient as any).put = async (
    key: string,
    body: Uint8Array,
    options: Record<string, unknown>
  ) => {
    if (failPutAt === puts.length) throw new Error('blob store down');
    puts.push({ key, size: body.byteLength, options });
    return { url: `${BLOB_HOST}/${key}` };
  };
  (blobClient as any).del = async (urls: string[]) => {
    dels.push(urls);
  };
  savedEnv = {
    token: process.env.BLOB_READ_WRITE_TOKEN,
    storeId: process.env.BLOB_STORE_ID,
    vercel: process.env.VERCEL_ENV,
  };
  process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_testStore_secret';
  // Vercel builds set this; "not configured" tests must not inherit it.
  delete process.env.BLOB_STORE_ID;
  delete process.env.VERCEL_ENV;
});

afterEach(() => {
  restoreStubs();
  Object.assign(blobClient, originalBlob);
  for (const [key, value] of [
    ['BLOB_READ_WRITE_TOKEN', savedEnv.token],
    ['BLOB_STORE_ID', savedEnv.storeId],
    ['VERCEL_ENV', savedEnv.vercel],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

// --- Request builders -------------------------------------------------------

interface UploadParts {
  full?: Uint8Array | null;
  thumb?: Uint8Array | null;
  width?: string;
  height?: string;
  caption?: string;
}

function uploadRequest(parts: UploadParts = {}, origin: string | null = SITE) {
  const form = new FormData();
  const full = parts.full === undefined ? VP8X : parts.full;
  const thumb = parts.thumb === undefined ? VP8 : parts.thumb;
  // Declared as WebP whatever the bytes are: the server must not trust it.
  if (full) form.set('full', new Blob([full.slice()], { type: 'image/webp' }), 'full.webp');
  if (thumb) form.set('thumb', new Blob([thumb.slice()], { type: 'image/webp' }), 'thumb.webp');
  form.set('width', parts.width ?? '29');
  form.set('height', parts.height ?? '43');
  if (parts.caption !== undefined) form.set('caption', parts.caption);
  const headers: Record<string, string> = {};
  if (origin) headers.origin = origin;
  return new Request(`${SITE}/api/admin/venues/${VENUE_ID}/images`, {
    method: 'POST',
    headers,
    body: form,
  });
}

const upload = (parts?: UploadParts, id = VENUE_ID, origin?: string | null) =>
  run(POST, { request: uploadRequest(parts, origin), params: { id } });
const patch = (body: unknown, imageId = IMAGE_ID) =>
  run(PATCH, { request: adminRequest('PATCH', body), params: { id: VENUE_ID, imageId } });
const remove = (imageId = IMAGE_ID) =>
  run(DELETE, { request: adminRequest('DELETE'), params: { id: VENUE_ID, imageId } });

/** The selects a successful upload makes: the unlocked pre-check, then addVenueImage under its lock. */
function stubUploadSelects(existing = 0) {
  return stubDbSequence('select', [
    [{ id: VENUE_ID }],
    [{ total: existing }],
    [{ id: VENUE_ID }],
    [{ total: existing }],
    existing ? [{ id: 'other' }] : [],
  ]);
}

const values = (calls: { method: string; args: unknown[] }[]) =>
  calls.filter((call) => call.method === 'values').map((call) => call.args[0] as any);
const errorOf = async (response: Response) => ((await response.json()) as { error: string }).error;

describe('POST /api/admin/venues/[id]/images', () => {
  it('returns 503 when uploads are not configured, and 404 for a bad venue id', async () => {
    signInAs();
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const response = await upload();
    assert.equal(response.status, 503);
    assert.match(await errorOf(response), /not configured/);
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_testStore_secret';
    assert.equal((await upload({}, 'nope')).status, 404);
  });

  it('stores both variants under the dev prefix, inserts the row and logs it', async () => {
    signInAs({ ...ADMIN, name: 'Sam' });
    stubTransactions();
    stubUploadSelects(0);
    const inserts = stubDbSequence('insert', [[imageRow({ caption: 'Top-down pizza' })], []]);

    const response = await upload({ caption: '  Top-down pizza ' });
    assert.equal(response.status, 201);
    const { image } = await response.json();
    assert.equal(image.isPrimary, true);
    assert.equal(image.caption, 'Top-down pizza');

    assert.equal(puts.length, 2);
    const [full, thumb] = puts;
    const id = full.key.match(/\/([0-9a-f-]{36})-full\.webp$/)?.[1];
    assert.ok(id, full.key);
    assert.equal(full.key, `dev/venues/${VENUE_ID}/${id}-full.webp`);
    assert.equal(thumb.key, `dev/venues/${VENUE_ID}/${id}-thumb.webp`);
    assert.deepEqual([full.size, thumb.size], [VP8X.length, VP8.length]);
    for (const call of puts) {
      assert.deepEqual(
        {
          access: call.options.access,
          contentType: call.options.contentType,
          addRandomSuffix: call.options.addRandomSuffix,
        },
        { access: 'public', contentType: 'image/webp', addRandomSuffix: false }
      );
      assert.ok((call.options.cacheControlMaxAge as number) >= 30 * 24 * 60 * 60);
    }

    const [row, event] = values(inserts);
    assert.deepEqual(
      {
        id: row.id,
        fullUrl: row.fullUrl,
        thumbUrl: row.thumbUrl,
        width: row.width,
        height: row.height,
        caption: row.caption,
        uploadedBy: row.uploadedBy,
        isPrimary: row.isPrimary,
      },
      {
        id,
        fullUrl: `${BLOB_HOST}/${full.key}`,
        thumbUrl: `${BLOB_HOST}/${thumb.key}`,
        width: 29,
        height: 43,
        caption: 'Top-down pizza',
        uploadedBy: ADMIN.id,
        isPrimary: true,
      }
    );
    assert.deepEqual(
      { kind: event.kind, actorName: event.actorName, detail: event.detail },
      {
        kind: 'image_added',
        actorName: 'Sam',
        detail: { imageId: IMAGE_ID, thumbUrl: imageRow().thumbUrl },
      }
    );
    assert.equal(dels.length, 0);
  });

  it('uses the preview and prod prefixes on Vercel', async () => {
    signInAs();
    stubTransactions();
    for (const [env, prefix] of [
      ['preview', 'preview'],
      ['production', 'prod'],
    ]) {
      process.env.VERCEL_ENV = env;
      puts = [];
      stubUploadSelects(0);
      stubDbSequence('insert', [[imageRow()], []]);
      assert.equal((await upload()).status, 201);
      assert.ok(
        puts.every((call) => call.key.startsWith(`${prefix}/venues/`)),
        puts.map((call) => call.key).join()
      );
    }
  });

  it('rejects files that are not really WebP, whatever their declared type', async () => {
    signInAs();
    for (const parts of [
      { full: JPEG },
      { thumb: JPEG },
      { full: VP8X.subarray(0, 30) },
      { full: null },
      { thumb: null },
    ]) {
      const response = await upload(parts);
      assert.equal(response.status, 400, JSON.stringify(Object.keys(parts)));
    }
    assert.match(await errorOf(await upload({ full: JPEG })), /not a valid WebP/);
    assert.match(await errorOf(await upload({ thumb: null })), /thumbnail image is missing/);
    assert.equal(puts.length, 0);
  });

  it('rejects oversize files', async () => {
    signInAs();
    const big = (bytes: number) => {
      const padded = new Uint8Array(bytes);
      padded.set(VP8X);
      return padded;
    };
    assert.match(
      await errorOf(await upload({ full: big(800 * 1024 + 1) })),
      /full-size image is 800 KB; the limit is 800 KB/
    );
    assert.match(
      await errorOf(await upload({ thumb: big(150 * 1024 + 1) })),
      /thumbnail image .* the limit is 150 KB/
    );
    assert.equal(puts.length, 0);
  });

  it('rejects images larger than 1600px / 640px on their longest edge', async () => {
    signInAs();
    const tooWide = await upload({ full: webpWithSize(1601, 900), width: '1601', height: '900' });
    assert.equal(tooWide.status, 400);
    assert.match(await errorOf(tooWide), /1601×900; its longest edge must be 1600px/);
    const tooTall = await upload({ thumb: webpWithSize(300, 641) });
    assert.match(await errorOf(tooTall), /641; its longest edge must be 640px/);
    assert.equal(puts.length, 0);
  });

  it('accepts images exactly at the limits', async () => {
    signInAs();
    stubTransactions();
    stubUploadSelects(0);
    stubDbSequence('insert', [[imageRow({ width: 1600, height: 1200 })], []]);
    const response = await upload({
      full: webpWithSize(1600, 1200),
      thumb: webpWithSize(640, 480),
      width: '1600',
      height: '1200',
    });
    assert.equal(response.status, 201);
  });

  it('rejects width and height that do not match the full image', async () => {
    signInAs();
    for (const [width, height] of [
      ['30', '43'],
      ['29', ''],
      ['abc', '43'],
    ]) {
      assert.equal((await upload({ width, height })).status, 400, `${width}x${height}`);
    }
    assert.equal(puts.length, 0);
  });

  it('rejects a caption over 200 characters', async () => {
    signInAs();
    const response = await upload({ caption: 'x'.repeat(201) });
    assert.equal(response.status, 400);
    assert.ok((await response.json()).fields.caption);
    assert.equal(puts.length, 0);
  });

  it('refuses a sixth image without writing any blobs', async () => {
    signInAs();
    stubDbSequence('select', [[{ id: VENUE_ID }], [{ total: 5 }]]);
    const response = await upload();
    assert.equal(response.status, 409);
    assert.match(await errorOf(response), /at most 5 photos/);
    assert.equal(puts.length, 0);
  });

  it('404s for an unknown venue without writing any blobs', async () => {
    signInAs();
    stubDbSequence('select', [[]]);
    assert.equal((await upload()).status, 404);
    assert.equal(puts.length, 0);
  });

  it('deletes both blobs when another upload took the last slot first', async () => {
    signInAs();
    stubTransactions();
    // Pre-check sees 4; under the lock there are already 5.
    stubDbSequence('select', [
      [{ id: VENUE_ID }],
      [{ total: 4 }],
      [{ id: VENUE_ID }],
      [{ total: 5 }],
    ]);
    const inserts = stubDbSequence('insert', [[imageRow()]]);
    const response = await upload();
    assert.equal(response.status, 409);
    assert.equal(values(inserts).length, 0);
    assert.deepEqual(dels, [puts.map((call) => `${BLOB_HOST}/${call.key}`)]);
  });

  it('deletes both blobs when the row insert fails', async () => {
    signInAs();
    stubTransactions();
    stubUploadSelects(0);
    stubDbSequence('insert', [new Error('insert failed')]);
    const response = await quietly(() => upload());
    assert.equal(response.status, 500);
    assert.equal(puts.length, 2);
    assert.deepEqual(dels, [puts.map((call) => `${BLOB_HOST}/${call.key}`)]);
  });

  it('deletes the full blob when the thumbnail write fails', async () => {
    signInAs();
    stubUploadSelects(0);
    failPutAt = 1;
    const response = await quietly(() => upload());
    assert.equal(response.status, 500);
    assert.equal(puts.length, 1);
    assert.deepEqual(dels, [[`${BLOB_HOST}/${puts[0].key}`]]);
  });

  it('still reports the original error when the cleanup itself fails', async () => {
    signInAs();
    stubTransactions();
    stubUploadSelects(0);
    stubDbSequence('insert', [new Error('insert failed')]);
    (blobClient as any).del = async () => {
      throw new Error('blob store down');
    };
    const response = await quietly(() => upload());
    assert.equal(response.status, 500);
  });
});

describe('PATCH /api/admin/venues/[id]/images/[imageId]', () => {
  it('requires Blob configuration', async () => {
    signInAs();
    delete process.env.BLOB_READ_WRITE_TOKEN;
    assert.equal((await patch({ caption: 'x' })).status, 503);
  });

  it('validates the body', async () => {
    signInAs();
    for (const body of [
      {},
      null,
      { isPrimary: false },
      { focalX: 50 },
      { focalX: 50, focalY: null },
      { focalX: 101, focalY: 5 },
      { focalX: 1.5, focalY: 5 },
      { caption: 'x'.repeat(201) },
      { caption: 'ok', extra: true },
    ]) {
      assert.equal((await patch(body)).status, 400, JSON.stringify(body));
    }
  });

  it('updates the caption and focal point without logging', async () => {
    signInAs();
    const updates = stubDbSequence('update', [
      [imageRow({ caption: 'Counter', focalX: 30, focalY: 70 })],
    ]);
    const inserts = stubDbSequence('insert', [[]]);
    const response = await patch({ caption: 'Counter', focalX: 30, focalY: 70 });
    assert.equal(response.status, 200);
    assert.deepEqual(updates.find((call) => call.method === 'set')!.args[0], {
      caption: 'Counter',
      focalX: 30,
      focalY: 70,
    });
    const { image } = await response.json();
    assert.deepEqual([image.caption, image.focalX, image.focalY], ['Counter', 30, 70]);
    assert.equal(values(inserts).length, 0, 'caption and focal edits are not logged');
  });

  it('resets the focal point to centre', async () => {
    signInAs();
    const updates = stubDbSequence('update', [[imageRow()]]);
    assert.equal((await patch({ focalX: null, focalY: null })).status, 200);
    assert.deepEqual(updates.find((call) => call.method === 'set')!.args[0], {
      focalX: null,
      focalY: null,
    });
  });

  it('makes a photo primary, clearing the old one first, and logs it', async () => {
    signInAs({ ...ADMIN, name: 'Sam' });
    stubTransactions();
    stubDbSequence('select', [
      [imageRow({ isPrimary: false })],
      [{ id: VENUE_ID }],
      [imageRow({ isPrimary: false })],
    ]);
    const updates = stubDbSequence('update', [
      [{ id: 'old-primary' }],
      [imageRow({ isPrimary: true })],
    ]);
    const inserts = stubDbSequence('insert', [[]]);
    const response = await patch({ isPrimary: true });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).image.isPrimary, true);
    assert.deepEqual(
      updates.filter((call) => call.method === 'set').map((call) => call.args[0]),
      [{ isPrimary: false }, { isPrimary: true }]
    );
    const [event] = values(inserts);
    assert.equal(event.kind, 'image_primary_changed');
    assert.equal(event.detail.imageId, IMAGE_ID);
  });

  it('404s for a photo that is not on this venue', async () => {
    signInAs();
    stubDbSequence('update', [[]]);
    assert.equal((await patch({ caption: 'x' })).status, 404);
  });
});

describe('DELETE /api/admin/venues/[id]/images/[imageId]', () => {
  it('requires Blob configuration', async () => {
    signInAs();
    delete process.env.BLOB_READ_WRITE_TOKEN;
    assert.equal((await remove()).status, 503);
  });

  it('deletes the row, promotes the oldest remaining photo, logs both, then deletes the blobs', async () => {
    signInAs({ ...ADMIN, name: 'Sam' });
    stubTransactions();
    const order: string[] = [];
    const promoted = imageRow({ id: 'promoted-id', isPrimary: true });
    stubDbSequence('select', [[{ id: VENUE_ID }], [{ id: 'promoted-id' }]]);
    stubDbSequence('delete', [[imageRow()]]);
    stubDbSequence('update', [[promoted]]);
    const inserts = stubDbSequence('insert', [[], []]);
    (blobClient as any).del = async (urls: string[]) => {
      order.push(`del:${values(inserts).length}`);
      dels.push(urls);
    };

    const response = await remove();
    assert.equal(response.status, 200);
    assert.equal((await response.json()).promoted.id, 'promoted-id');
    assert.deepEqual(dels, [[imageRow().fullUrl, imageRow().thumbUrl]]);
    assert.deepEqual(order, ['del:2'], 'blobs go after the row change is logged');
    assert.deepEqual(
      values(inserts).map((event) => [event.kind, event.detail.imageId, event.detail.reason]),
      [
        ['image_removed', IMAGE_ID, undefined],
        ['image_primary_changed', 'promoted-id', 'promoted_after_delete'],
      ]
    );
  });

  it('never passes a migrated external link to del()', async () => {
    signInAs();
    stubTransactions();
    stubDbSequence('select', [[{ id: VENUE_ID }]]);
    stubDbSequence('delete', [
      [
        imageRow({
          isPrimary: false,
          fullUrl: 'https://example.com/old-photo.jpg',
          thumbUrl: null,
        }),
      ],
    ]);
    stubDbSequence('insert', [[]]);
    assert.equal((await remove()).status, 200);
    assert.deepEqual(dels, []);
  });

  it('succeeds even when the blob delete fails', async () => {
    signInAs();
    stubTransactions();
    stubDbSequence('select', [[{ id: VENUE_ID }]]);
    stubDbSequence('delete', [[imageRow({ isPrimary: false })]]);
    stubDbSequence('insert', [[]]);
    (blobClient as any).del = async () => {
      throw new Error('blob store down');
    };
    assert.equal((await quietly(() => remove())).status, 200);
  });

  it('404s for a missing photo without deleting any blobs', async () => {
    signInAs();
    stubTransactions();
    stubDbSequence('select', [[{ id: VENUE_ID }]]);
    stubDbSequence('delete', [[]]);
    assert.equal((await remove()).status, 404);
    assert.deepEqual(dels, []);
  });
});
