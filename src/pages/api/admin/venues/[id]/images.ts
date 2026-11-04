import { adminRoute } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { isBlobConfigured } from '@/lib/env';
import { fail, mapOutcome } from '@/lib/outcome';
import { venueLifecycle } from '@/lib/venue-lifecycle';
import { photoStore } from '@/lib/venue-image-storage';
import { serializeVenueImage } from '@/lib/venue-images';

export const prerender = false;

const positiveInt = (value: FormDataEntryValue | null) =>
  typeof value === 'string' && /^\d{1,5}$/.test(value) ? Number(value) : null;

/** The uploaded file, unread: the lifecycle checks its size before buffering it. */
const fileOf = (part: FormDataEntryValue | null) => (part instanceof Blob ? part : null);

/**
 * POST /api/admin/venues/[id]/images: one photo as two WebP variants
 * (`full` and `thumb`) plus `width`, `height` and an optional `caption`. The
 * route only reads the multipart form; the lifecycle checks the files and
 * writes them.
 */
export const POST = adminRoute(
  { action: 'Add venue image', status: 201, params: { id: 'venue_not_found' } },
  async ({ request, params, actor }) => {
    if (!isBlobConfigured()) return fail('uploads_not_configured');

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return fail('invalid_photo', 'Send the photo as a multipart form.');
    }

    const caption = form.get('caption');
    const added = await venueLifecycle.addPhoto(
      db,
      photoStore(),
      params.id,
      {
        full: fileOf(form.get('full')),
        thumb: fileOf(form.get('thumb')),
        width: positiveInt(form.get('width')),
        height: positiveInt(form.get('height')),
        caption: typeof caption === 'string' ? caption : null,
      },
      actor
    );
    return mapOutcome(added, (image) => ({ image: serializeVenueImage(image) }));
  }
);
