import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { venueImages, venues } from '@/db/schema';
import { isUniqueViolation, jsonError, jsonResponse, readJson, requireAdmin, serverError, uuidParam, validationError } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { getBlobToken } from '@/lib/env';
import { deleteOwnedBlobs } from '@/lib/venue-image-storage';
import { venueInputSchema } from '@/lib/venue-schema';
import { resolveRoute, routeWarning } from '@/lib/venue-route';
import { isSlugTaken, recordVenueRevision, serializeVenue, venueValues } from '@/lib/venues';

export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  const id = uuidParam.safeParse(params.id);
  if (!id.success) return jsonError(404, 'Venue not found.');

  try {
    const [row] = await db.select().from(venues).where(eq(venues.id, id.data)).limit(1);
    if (!row) return jsonError(404, 'Venue not found.');
    return jsonResponse({ venue: serializeVenue(row) });
  } catch (error) {
    return serverError('Load venue', error);
  }
};

export const PUT: APIRoute = async ({ request, params }) => {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  const id = uuidParam.safeParse(params.id);
  if (!id.success) return jsonError(404, 'Venue not found.');

  const parsed = venueInputSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);

  try {
    if (await isSlugTaken(db, parsed.data.slug, id.data)) {
      return jsonError(409, 'That slug is already in use.', { slug: 'That slug is already in use. Choose another.' });
    }

    const [existing] = await db
      .select({
        latitude: venues.latitude,
        longitude: venues.longitude,
        distanceMiles: venues.distanceMiles,
        walkingTimeMin: venues.walkingTimeMin,
        routeUpdatedAt: venues.routeUpdatedAt,
      })
      .from(venues)
      .where(eq(venues.id, id.data))
      .limit(1);
    if (!existing) return jsonError(404, 'Venue not found.');

    // Only calls ORS when the coordinates changed or the route is missing; failures leave it pending.
    const route = await resolveRoute(parsed.data, existing);
    const [row] = await db
      .update(venues)
      .set(venueValues(parsed.data, session.user.id, route))
      .where(eq(venues.id, id.data))
      .returning();
    if (!row) return jsonError(404, 'Venue not found.');

    await recordVenueRevision(db, row, session.user.id);
    return jsonResponse({ venue: serializeVenue(row), routeWarning: routeWarning(route) });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return jsonError(409, 'That slug is already in use.', { slug: 'That slug is already in use. Choose another.' });
    }
    return serverError('Update venue', error);
  }
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  const id = uuidParam.safeParse(params.id);
  if (!id.success) return jsonError(404, 'Venue not found.');

  try {
    // Collect the photos first: deleting the venue cascades to their rows.
    const images = await db.select({ fullUrl: venueImages.fullUrl, thumbUrl: venueImages.thumbUrl }).from(venueImages).where(eq(venueImages.venueId, id.data));
    const [row] = await db.delete(venues).where(eq(venues.id, id.data)).returning({ id: venues.id });
    if (!row) return jsonError(404, 'Venue not found.');
    await deleteOwnedBlobs(getBlobToken(), images.flatMap((image) => [image.fullUrl, image.thumbUrl]), 'Delete venue');
    return jsonResponse({ ok: true });
  } catch (error) {
    return serverError('Delete venue', error);
  }
};
