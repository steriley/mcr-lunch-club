import type { APIRoute } from 'astro';
import { z } from 'zod';
import { jsonError, jsonResponse, readJson, requireAdmin, serverError, uuidParam, validationError } from '@/lib/admin-api';
import type { VenueImageRow } from '@/db/schema';
import { db } from '@/lib/db';
import { getBlobToken, isBlobConfigured } from '@/lib/env';
import { CAPTION_MAX } from '@/lib/image-upload';
import { deleteOwnedBlobs } from '@/lib/venue-image-storage';
import {
  VENUE_IMAGE_ERROR_MESSAGES,
  VENUE_IMAGE_ERROR_STATUS,
  deleteVenueImage,
  serializeVenueImage,
  setPrimary,
  updateImageMeta,
  type ImageMetaChanges,
  type VenueImageError,
} from '@/lib/venue-images';

export const prerender = false;

const focalValue = z.number().int().min(0).max(100).nullable();

/**
 * Caption, focal point (both or neither; both null resets to centre) and
 * `isPrimary: true`. There must always be a primary, so it cannot be unset
 * directly: make another photo primary instead.
 */
const imagePatchSchema = z
  .object({
    caption: z.string().max(CAPTION_MAX, `Keep the caption to ${CAPTION_MAX} characters or fewer.`).nullable().optional(),
    focalX: focalValue.optional(),
    focalY: focalValue.optional(),
    isPrimary: z.literal(true, 'Make another photo primary instead.').optional(),
  })
  .strict()
  .refine((body) => (body.focalX === undefined) === (body.focalY === undefined), { message: 'Send focalX and focalY together.', path: ['focalX'] })
  .refine((body) => (body.focalX === null) === (body.focalY === null), { message: 'Set both focal coordinates or reset both.', path: ['focalX'] })
  .refine((body) => body.caption !== undefined || body.focalX !== undefined || body.isPrimary !== undefined, {
    message: 'Nothing to change.',
    path: ['form'],
  });

const failure = (error: VenueImageError) => jsonError(VENUE_IMAGE_ERROR_STATUS[error], VENUE_IMAGE_ERROR_MESSAGES[error]);

async function context(request: Request, params: Record<string, string | undefined>) {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  if (!isBlobConfigured()) return jsonError(503, 'Image uploads are not configured.');
  const token = getBlobToken();

  const venueId = uuidParam.safeParse(params.id);
  if (!venueId.success) return jsonError(404, VENUE_IMAGE_ERROR_MESSAGES.venue_not_found);
  const imageId = uuidParam.safeParse(params.imageId);
  if (!imageId.success) return jsonError(404, VENUE_IMAGE_ERROR_MESSAGES.image_not_found);

  const actor = { id: session.user.id, name: session.user.name, email: session.user.email };
  return { token, venueId: venueId.data, imageId: imageId.data, actor };
}

export const PATCH: APIRoute = async ({ request, params }) => {
  const ctx = await context(request, params);
  if (ctx instanceof Response) return ctx;

  const parsed = imagePatchSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);
  const body = parsed.data;

  try {
    // Primary first: it is the one change that can fail on a stale image, so nothing is half-written.
    let primaryImage: VenueImageRow | null = null;
    if (body.isPrimary) {
      const primary = await setPrimary(db, ctx.venueId, ctx.imageId, ctx.actor);
      if (!primary.ok) return failure(primary.error);
      primaryImage = primary.value.image;
    }

    const changes: ImageMetaChanges = {};
    if (body.caption !== undefined) changes.caption = body.caption;
    if (body.focalX !== undefined && body.focalY !== undefined) changes.focal = { focalX: body.focalX, focalY: body.focalY };

    if (primaryImage && Object.keys(changes).length === 0) return jsonResponse({ image: serializeVenueImage(primaryImage) });

    const meta = await updateImageMeta(db, ctx.venueId, ctx.imageId, changes);
    if (!meta.ok) return failure(meta.error);
    return jsonResponse({ image: serializeVenueImage(meta.value) });
  } catch (error) {
    return serverError('Update venue image', error);
  }
};

/** Row first (promoting a new primary if needed), then the blobs, best-effort. */
export const DELETE: APIRoute = async ({ request, params }) => {
  const ctx = await context(request, params);
  if (ctx instanceof Response) return ctx;

  try {
    const result = await deleteVenueImage(db, ctx.venueId, ctx.imageId, ctx.actor);
    if (!result.ok) return failure(result.error);

    const { deleted, promoted } = result.value;
    await deleteOwnedBlobs(ctx.token, [deleted.fullUrl, deleted.thumbUrl], 'Delete venue image');
    return jsonResponse({ ok: true, promoted: promoted ? serializeVenueImage(promoted) : null });
  } catch (error) {
    return serverError('Delete venue image', error);
  }
};
