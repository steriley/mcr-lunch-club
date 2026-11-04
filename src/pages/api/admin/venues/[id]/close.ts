import { adminRoute } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { mapOutcome } from '@/lib/outcome';
import { venueLifecycle } from '@/lib/venue-lifecycle';
import { serializeVenue } from '@/lib/venues';

export const prerender = false;

export const POST = adminRoute(
  { action: 'Close venue', params: { id: 'venue_not_found' } },
  async ({ params, actor }) =>
    mapOutcome(await venueLifecycle.closeVenue(db, params.id, actor), (venue) => ({
      venue: serializeVenue(venue),
    }))
);
