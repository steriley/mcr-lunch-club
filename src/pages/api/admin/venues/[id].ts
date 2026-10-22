import { eq } from 'drizzle-orm';
import { venueImages, venues } from '@/db/schema';
import { adminRoute, isUniqueViolation, jsonError, jsonResponse, slugTaken } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { getBlobToken } from '@/lib/env';
import { deleteOwnedBlobs } from '@/lib/venue-image-storage';
import { venueInputSchema } from '@/lib/venue-schema';
import { resolveRoute, routeWarning } from '@/lib/walking-route';
import { isSlugTaken, recordVenueRevision, serializeVenue, venueValues } from '@/lib/venues';

export const prerender = false;

const NOT_FOUND = 'Venue not found.';
const notFound = () => jsonError(404, NOT_FOUND);

export const GET = adminRoute({ action: 'Load venue', params: { id: NOT_FOUND } }, async ({ params }) => {
  const [row] = await db.select().from(venues).where(eq(venues.id, params.id)).limit(1);
  return row ? jsonResponse({ venue: serializeVenue(row) }) : notFound();
});

export const PUT = adminRoute(
  {
    action: 'Update venue',
    params: { id: NOT_FOUND },
    body: venueInputSchema,
    onError: (error) => (isUniqueViolation(error) ? slugTaken() : undefined),
  },
  async ({ params, body, actor }) => {
    if (await isSlugTaken(db, body.slug, params.id)) return slugTaken();

    const [existing] = await db
      .select({
        latitude: venues.latitude,
        longitude: venues.longitude,
        distanceMiles: venues.distanceMiles,
        walkingTimeMin: venues.walkingTimeMin,
        routeUpdatedAt: venues.routeUpdatedAt,
      })
      .from(venues)
      .where(eq(venues.id, params.id))
      .limit(1);
    if (!existing) return notFound();

    // Only calls ORS when the coordinates changed or the route is missing; failures leave it pending.
    const route = await resolveRoute(body, existing);
    const [row] = await db
      .update(venues)
      .set(venueValues(body, actor.id, route))
      .where(eq(venues.id, params.id))
      .returning();
    if (!row) return notFound();

    await recordVenueRevision(db, row, actor.id);
    return jsonResponse({ venue: serializeVenue(row), routeWarning: routeWarning(route) });
  }
);

export const DELETE = adminRoute({ action: 'Delete venue', params: { id: NOT_FOUND } }, async ({ params }) => {
  // Collect the photos first: deleting the venue cascades to their rows.
  const images = await db.select({ fullUrl: venueImages.fullUrl, thumbUrl: venueImages.thumbUrl }).from(venueImages).where(eq(venueImages.venueId, params.id));
  const [row] = await db.delete(venues).where(eq(venues.id, params.id)).returning({ id: venues.id });
  if (!row) return notFound();
  await deleteOwnedBlobs(getBlobToken(), images.flatMap((image) => [image.fullUrl, image.thumbUrl]), 'Delete venue');
  return jsonResponse({ ok: true });
});
