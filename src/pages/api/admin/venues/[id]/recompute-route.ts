import { adminRoute } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { mapOutcome } from '@/lib/outcome';
import { venueLifecycle } from '@/lib/venue-lifecycle';
import { serializeVenue } from '@/lib/venues';

export const prerender = false;

/** POST /api/admin/venues/[id]/recompute-route: retry the ORS walking route from HQ. */
export const POST = adminRoute(
  { action: 'Recompute venue route', params: { id: 'venue_not_found' } },
  async ({ params, actor }) =>
    mapOutcome(await venueLifecycle.rerouteVenue(db, params.id, actor), (venue) => ({
      venue: serializeVenue(venue),
    }))
);
