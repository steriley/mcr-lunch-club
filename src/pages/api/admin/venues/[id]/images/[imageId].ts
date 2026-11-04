import { z } from 'zod';
import { adminRoute } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { isBlobConfigured } from '@/lib/env';
import { fail, mapOutcome } from '@/lib/outcome';
import { venueLifecycle } from '@/lib/venue-lifecycle';
import { photoStore } from '@/lib/venue-image-storage';
import { serializeVenueImage } from '@/lib/venue-images';

export const prerender = false;

/**
 * Caption, focal point and `isPrimary: true`. Only the shape is checked here;
 * the caption length and the focal rules (both or neither, whole numbers from
 * 0 to 100, both null resets to centre) are the lifecycle's. There must always
 * be a primary, so it cannot be unset directly: make another photo primary.
 */
const imagePatchSchema = z
  .object({
    caption: z.string().nullable().optional(),
    focalX: z.number().nullable().optional(),
    focalY: z.number().nullable().optional(),
    isPrimary: z.literal(true, 'Make another photo primary instead.').optional(),
  })
  .strict()
  .refine(
    (body) =>
      body.caption !== undefined ||
      body.focalX !== undefined ||
      body.focalY !== undefined ||
      body.isPrimary !== undefined,
    { message: 'Nothing to change.', path: ['form'] }
  );

const imageParams = { id: 'venue_not_found', imageId: 'image_not_found' } as const;

export const PATCH = adminRoute(
  { action: 'Update venue image', params: imageParams, body: imagePatchSchema },
  async ({ params, body, actor }) => {
    if (!isBlobConfigured()) return fail('uploads_not_configured');
    const updated = await venueLifecycle.updatePhoto(db, params.id, params.imageId, body, actor);
    return mapOutcome(updated, (image) => ({ image: serializeVenueImage(image) }));
  }
);

/** Row first (promoting a new primary if needed), then the files, best-effort. */
export const DELETE = adminRoute(
  { action: 'Delete venue image', params: imageParams },
  async ({ params, actor }) => {
    if (!isBlobConfigured()) return fail('uploads_not_configured');
    const removed = await venueLifecycle.removePhoto(
      db,
      photoStore(),
      params.id,
      params.imageId,
      actor
    );
    return mapOutcome(removed, ({ promoted }) => ({
      ok: true,
      promoted: promoted ? serializeVenueImage(promoted) : null,
    }));
  }
);
