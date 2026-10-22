import { eq } from 'drizzle-orm';
import { venues } from '@/db/schema';
import { adminRoute, jsonError, jsonResponse } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { computeRoute, routeWarning } from '@/lib/venue-route';
import { recordVenueRevision, serializeVenue } from '@/lib/venues';

export const prerender = false;

/** POST /api/admin/venues/[id]/recompute-route: retry the ORS walking route from HQ. */
export const POST = adminRoute({ action: 'Recompute venue route', params: { id: 'Venue not found.' } }, async ({ params, actor }) => {
  const [venue] = await db
    .select({ latitude: venues.latitude, longitude: venues.longitude })
    .from(venues)
    .where(eq(venues.id, params.id))
    .limit(1);
  if (!venue) return jsonError(404, 'Venue not found.');
  if (venue.latitude === null || venue.longitude === null) {
    return jsonError(409, 'This venue needs a location before its walking route can be worked out.');
  }

  const route = await computeRoute({ lat: Number(venue.latitude), lng: Number(venue.longitude) });
  if (route.error) {
    return jsonError(route.error.kind === 'rate_limited' ? 429 : 503, routeWarning(route)!.replace('Saved, but the', 'The'));
  }

  const [row] = await db
    .update(venues)
    .set({
      distanceMiles: route.distanceMiles!.toFixed(2),
      walkingTimeMin: route.walkingTimeMin,
      routeUpdatedAt: route.routeUpdatedAt,
      updatedBy: actor.id,
      updatedAt: new Date(),
    })
    .where(eq(venues.id, params.id))
    .returning();
  if (!row) return jsonError(404, 'Venue not found.');

  await recordVenueRevision(db, row, actor.id);
  return jsonResponse({ venue: serializeVenue(row) });
});
