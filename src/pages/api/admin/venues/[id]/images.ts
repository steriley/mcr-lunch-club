import type { APIRoute } from 'astro';
import { randomUUID } from 'node:crypto';
import { jsonError, jsonResponse, requireAdmin, serverError, uuidParam } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { getBlobToken } from '@/lib/env';
import { FULL_MAX_EDGE, MAX_FULL_BYTES, MAX_IMAGES_PER_VENUE, MAX_THUMB_BYTES, THUMB_MAX_EDGE } from '@/lib/image-upload';
import { deleteOwnedBlobs, imageBlobKey, putImageBlob } from '@/lib/venue-image-storage';
import {
  VENUE_IMAGE_ERROR_MESSAGES,
  VENUE_IMAGE_ERROR_STATUS,
  addVenueImage,
  countVenueImages,
  normaliseCaption,
  readWebpInfo,
  serializeVenueImage,
  type WebpInfo,
} from '@/lib/venue-images';

export const prerender = false;

const KB = (bytes: number) => `${Math.round(bytes / 1024)} KB`;

type Checked = { ok: true; bytes: Uint8Array; info: WebpInfo } | { ok: false; message: string };

/** Must really be WebP (by its bytes, not its declared type) and within the size and dimension limits. */
async function checkVariant(part: FormDataEntryValue | null, label: string, maxBytes: number, maxEdge: number): Promise<Checked> {
  if (!(part instanceof Blob)) return { ok: false, message: `The ${label} image is missing.` };
  if (part.size > maxBytes) return { ok: false, message: `The ${label} image is ${KB(part.size)}; the limit is ${KB(maxBytes)}.` };
  const bytes = new Uint8Array(await part.arrayBuffer());
  const info = readWebpInfo(bytes);
  if (!info) return { ok: false, message: `The ${label} image is not a valid WebP file.` };
  if (Math.max(info.width, info.height) > maxEdge) {
    return { ok: false, message: `The ${label} image is ${info.width}×${info.height}; its longest edge must be ${maxEdge}px or less.` };
  }
  return { ok: true, bytes, info };
}

const positiveInt = (value: FormDataEntryValue | null) => (typeof value === 'string' && /^\d{1,5}$/.test(value) ? Number(value) : null);

/**
 * POST /api/admin/venues/[id]/images: one photo as two WebP variants
 * (`full` and `thumb`) plus `width`, `height` and an optional `caption`.
 * Validates, writes both blobs, then inserts the row (the venue's first
 * photo becomes primary). If anything fails after a blob was written, the
 * blobs written so far are deleted.
 */
export const POST: APIRoute = async ({ request, params }) => {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  const token = getBlobToken();
  if (!token) return jsonError(503, 'Image uploads are not configured.');

  const id = uuidParam.safeParse(params.id);
  if (!id.success) return jsonError(404, 'Venue not found.');
  const venueId = id.data;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError(400, 'Send the photo as a multipart form.');
  }

  const caption = normaliseCaption(typeof form.get('caption') === 'string' ? (form.get('caption') as string) : null);
  if (!caption.ok) return jsonError(400, VENUE_IMAGE_ERROR_MESSAGES.caption_too_long, { caption: VENUE_IMAGE_ERROR_MESSAGES.caption_too_long });

  const full = await checkVariant(form.get('full'), 'full-size', MAX_FULL_BYTES, FULL_MAX_EDGE);
  if (!full.ok) return jsonError(400, full.message);
  const thumb = await checkVariant(form.get('thumb'), 'thumbnail', MAX_THUMB_BYTES, THUMB_MAX_EDGE);
  if (!thumb.ok) return jsonError(400, thumb.message);

  const width = positiveInt(form.get('width'));
  const height = positiveInt(form.get('height'));
  if (width !== full.info.width || height !== full.info.height) {
    return jsonError(400, 'The width and height do not match the full-size image.');
  }

  const actor = { id: session.user.id, name: session.user.name, email: session.user.email };
  const written: string[] = [];
  try {
    // Pre-check before writing anything; addVenueImage re-checks under a lock.
    const existing = await countVenueImages(db, venueId);
    if (existing === null) return jsonError(404, VENUE_IMAGE_ERROR_MESSAGES.venue_not_found);
    if (existing >= MAX_IMAGES_PER_VENUE) return jsonError(409, VENUE_IMAGE_ERROR_MESSAGES.too_many_images);

    const imageId = randomUUID();
    const fullUrl = await putImageBlob(token, imageBlobKey(venueId, imageId, 'full'), full.bytes);
    written.push(fullUrl);
    const thumbUrl = await putImageBlob(token, imageBlobKey(venueId, imageId, 'thumb'), thumb.bytes);
    written.push(thumbUrl);

    const result = await addVenueImage(
      db,
      { id: imageId, venueId, fullUrl, thumbUrl, width: full.info.width, height: full.info.height, caption: caption.value, uploadedBy: actor.id },
      new Date(),
      actor
    );
    if (!result.ok) {
      await deleteOwnedBlobs(token, written, 'Add venue image');
      return jsonError(VENUE_IMAGE_ERROR_STATUS[result.error], VENUE_IMAGE_ERROR_MESSAGES[result.error]);
    }
    return jsonResponse({ image: serializeVenueImage(result.value) }, 201);
  } catch (error) {
    await deleteOwnedBlobs(token, written, 'Add venue image');
    return serverError('Add venue image', error);
  }
};
