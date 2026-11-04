import '../setup-env';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '@/pages/api/admin/venues/[id]/images';
import { DELETE, PATCH } from '@/pages/api/admin/venues/[id]/images/[imageId]';
import { fail, ok } from '@/lib/outcome';
import {
  ADMIN,
  SITE,
  VENUE_ID,
  adminRequest,
  quietly,
  restoreStubs,
  run,
  signInAs,
  stubLifecycle,
  stubPublishing,
} from '../route-helpers';
import { VP8, VP8X } from '../webp-samples';

/** Route tests check request parsing and the status mapping; the behaviour is in the lifecycle's own tests. */

const IMAGE_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const now = new Date('2026-10-22T09:00:00.000Z');

const imageRow = (overrides: Record<string, unknown> = {}) =>
  ({
    id: IMAGE_ID,
    venueId: VENUE_ID,
    fullUrl: `https://store123.public.blob.vercel-storage.com/dev/venues/${VENUE_ID}/${IMAGE_ID}-full.webp`,
    thumbUrl: `https://store123.public.blob.vercel-storage.com/dev/venues/${VENUE_ID}/${IMAGE_ID}-thumb.webp`,
    width: 29,
    height: 43,
    caption: null,
    isPrimary: true,
    focalX: null,
    focalY: null,
    uploadedBy: ADMIN.id,
    createdAt: now,
    ...overrides,
  }) as never;

const queued = (action: string) => ({ action, venueId: VENUE_ID, when: 'queue' as const });

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {
    token: process.env.BLOB_READ_WRITE_TOKEN,
    storeId: process.env.BLOB_STORE_ID,
  };
  process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_testStore_secret';
  // Vercel builds set this; "not configured" tests must not inherit it.
  delete process.env.BLOB_STORE_ID;
});

afterEach(() => {
  restoreStubs();
  for (const [key, value] of [
    ['BLOB_READ_WRITE_TOKEN', savedEnv.token],
    ['BLOB_STORE_ID', savedEnv.storeId],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

interface UploadParts {
  full?: Uint8Array | null;
  thumb?: Uint8Array | null;
  width?: string;
  height?: string;
  caption?: string;
}

function uploadRequest(parts: UploadParts = {}) {
  const form = new FormData();
  const full = parts.full === undefined ? VP8X : parts.full;
  const thumb = parts.thumb === undefined ? VP8 : parts.thumb;
  if (full) form.set('full', new Blob([full.slice()], { type: 'image/webp' }), 'full.webp');
  if (thumb) form.set('thumb', new Blob([thumb.slice()], { type: 'image/webp' }), 'thumb.webp');
  form.set('width', parts.width ?? '29');
  form.set('height', parts.height ?? '43');
  if (parts.caption !== undefined) form.set('caption', parts.caption);
  return new Request(`${SITE}/api/admin/venues/${VENUE_ID}/images`, {
    method: 'POST',
    headers: { origin: SITE },
    body: form,
  });
}

const upload = (parts?: UploadParts, id = VENUE_ID) =>
  run(POST, { request: uploadRequest(parts), params: { id } });
const patch = (body: unknown, imageId = IMAGE_ID) =>
  run(PATCH, { request: adminRequest('PATCH', body), params: { id: VENUE_ID, imageId } });
const remove = (imageId = IMAGE_ID) =>
  run(DELETE, { request: adminRequest('DELETE'), params: { id: VENUE_ID, imageId } });
const errorOf = async (response: Response) => ((await response.json()) as { error: string }).error;

describe('POST /api/admin/venues/[id]/images', () => {
  it('returns 503 when uploads are not configured, and 404 for a bad venue id', async () => {
    signInAs();
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const calls = stubLifecycle('addPhoto', async () => ok(imageRow()));
    const response = await upload();
    assert.deepEqual(
      [response.status, await errorOf(response)],
      [503, 'Image uploads are not configured.']
    );
    assert.equal(calls.length, 0);

    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_testStore_secret';
    assert.equal((await upload({}, 'nope')).status, 404);
    assert.equal(calls.length, 0);
  });

  it('reads the form and hands the files, size and caption to the lifecycle', async () => {
    signInAs();
    const calls = stubLifecycle('addPhoto', async () =>
      ok(imageRow({ caption: 'Top-down pizza' }), queued('Add venue image'))
    );
    const inserts = stubPublishing();
    const response = await upload({ caption: 'Top-down pizza' });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).image.caption, 'Top-down pizza');

    const [, , venueId, photo, actor] = calls[0].arguments;
    assert.equal(venueId, VENUE_ID);
    assert.deepEqual(photo.full, VP8X);
    assert.deepEqual(photo.thumb, VP8);
    assert.deepEqual([photo.width, photo.height, photo.caption], [29, 43, 'Top-down pizza']);
    assert.equal(actor.id, ADMIN.id);
    assert.equal(
      (inserts.find((call) => call.method === 'values')!.args[0] as any).venueId,
      VENUE_ID
    );
  });

  it('sends missing parts and bad numbers as nulls, for the lifecycle to refuse', async () => {
    signInAs();
    const calls = stubLifecycle('addPhoto', async () =>
      fail('invalid_photo', 'The thumbnail image is missing.')
    );
    const response = await upload({ thumb: null, width: 'abc', height: '' });
    assert.deepEqual(
      [response.status, await errorOf(response)],
      [400, 'The thumbnail image is missing.']
    );
    const photo = calls[0].arguments[3];
    assert.deepEqual(
      [photo.thumb, photo.width, photo.height, photo.caption],
      [null, null, null, null]
    );
  });

  it('rejects a request that is not a multipart form', async () => {
    signInAs();
    const calls = stubLifecycle('addPhoto', async () => ok(imageRow()));
    const response = await run(POST, {
      request: adminRequest('POST', { not: 'a form' }),
      params: { id: VENUE_ID },
    });
    assert.deepEqual(
      [response.status, await errorOf(response)],
      [400, 'Send the photo as a multipart form.']
    );
    assert.equal(calls.length, 0);
  });

  it('maps the lifecycle’s refusals', async () => {
    signInAs();
    const answer = async (error: Parameters<typeof fail>[0]) => {
      stubLifecycle('addPhoto', async () => fail(error as never));
      const response = await upload();
      return [response.status, response] as const;
    };
    assert.equal((await answer('venue_not_found'))[0], 404);
    assert.equal((await answer('too_many_images'))[0], 409);
    const [status, caption] = await answer('caption_too_long');
    assert.equal(status, 400);
    assert.ok((await caption.json()).fields.caption);
  });

  it('returns 500, and records nothing, when the lifecycle throws', async () => {
    signInAs();
    stubLifecycle('addPhoto', async () => {
      throw new Error('blob store down');
    });
    const inserts = stubPublishing();
    assert.equal((await quietly(() => upload())).status, 500);
    assert.equal(inserts.length, 0);
  });
});

describe('PATCH /api/admin/venues/[id]/images/[imageId]', () => {
  it('requires Blob configuration', async () => {
    signInAs();
    delete process.env.BLOB_READ_WRITE_TOKEN;
    assert.equal((await patch({ caption: 'x' })).status, 503);
  });

  it('checks the shape of the body, and nothing more', async () => {
    signInAs();
    const calls = stubLifecycle('updatePhoto', async () => fail('invalid_focal'));
    assert.equal((await patch({})).status, 400, 'nothing to change');
    assert.equal((await patch({ isPrimary: false })).status, 400);
    assert.equal((await patch({ caption: 5 })).status, 400);
    assert.equal((await patch({ focalX: 'left', focalY: 1 })).status, 400);
    assert.equal((await patch({ caption: 'x', unknown: 1 })).status, 400, 'strict');
    assert.equal(calls.length, 0);
    // Ranges and "both or neither" are the lifecycle's rules, so these reach it.
    for (const body of [{ focalX: 101, focalY: 5 }, { focalX: 5 }, { caption: 'x'.repeat(201) }]) {
      await patch(body);
    }
    assert.equal(calls.length, 3);
  });

  it('passes the changes through and returns the photo', async () => {
    signInAs();
    const calls = stubLifecycle('updatePhoto', async () =>
      ok(imageRow({ caption: 'Pizza', focalX: 30, focalY: 70 }), queued('Update venue image'))
    );
    stubPublishing();
    const response = await patch({ caption: 'Pizza', focalX: 30, focalY: 70, isPrimary: true });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).image.focalX, 30);
    const [, venueId, imageId, changes] = calls[0].arguments;
    assert.deepEqual([venueId, imageId], [VENUE_ID, IMAGE_ID]);
    assert.deepEqual(changes, { caption: 'Pizza', focalX: 30, focalY: 70, isPrimary: true });
  });

  it('maps the lifecycle’s refusals', async () => {
    signInAs();
    stubLifecycle('updatePhoto', async () => fail('invalid_focal'));
    assert.equal((await patch({ focalX: 101, focalY: 5 })).status, 400);
    stubLifecycle('updatePhoto', async () => fail('caption_too_long'));
    assert.equal((await patch({ caption: 'x' })).status, 400);
    stubLifecycle('updatePhoto', async () => fail('image_not_found'));
    const missing = await patch({ caption: 'x' });
    assert.deepEqual([missing.status, await errorOf(missing)], [404, 'Photo not found.']);
    assert.equal((await patch({ caption: 'x' }, 'nope')).status, 404);
  });
});

describe('DELETE /api/admin/venues/[id]/images/[imageId]', () => {
  it('requires Blob configuration', async () => {
    signInAs();
    delete process.env.BLOB_READ_WRITE_TOKEN;
    assert.equal((await remove()).status, 503);
  });

  it('removes through the lifecycle and reports the photo promoted to primary', async () => {
    signInAs();
    const promoted = imageRow({ id: 'next', isPrimary: true });
    const calls = stubLifecycle('removePhoto', async () =>
      ok({ deleted: imageRow(), promoted }, queued('Delete venue image'))
    );
    stubPublishing();
    const response = await remove();
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.promoted.id, 'next');
    assert.deepEqual([calls[0].arguments[2], calls[0].arguments[3]], [VENUE_ID, IMAGE_ID]);

    stubLifecycle('removePhoto', async () => ok({ deleted: imageRow(), promoted: null }));
    assert.equal((await (await remove()).json()).promoted, null);
  });

  it('404s for a missing photo', async () => {
    signInAs();
    stubLifecycle('removePhoto', async () => fail('image_not_found'));
    assert.equal((await remove()).status, 404);
    assert.equal((await remove('nope')).status, 404);
  });
});
