import { adminRoute } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { mapOutcome } from '@/lib/outcome';
import { venueLifecycle } from '@/lib/venue-lifecycle';
import { photoStore } from '@/lib/venue-image-storage';
import { venueInputSchema } from '@/lib/venue-schema';
import { routeWarning } from '@/lib/walking-route';
import { serializeVenue } from '@/lib/venues';

export const prerender = false;

export const PUT = adminRoute(
  {
    action: 'Update venue',
    params: { id: 'venue_not_found' },
    body: venueInputSchema,
  },
  async ({ params, body, actor }) =>
    mapOutcome(
      await venueLifecycle.updateVenue(db, params.id, body, actor),
      ({ venue, route }) => ({ venue: serializeVenue(venue), routeWarning: routeWarning(route) })
    )
);

export const DELETE = adminRoute(
  { action: 'Delete venue', params: { id: 'venue_not_found' } },
  async ({ params }) =>
    mapOutcome(await venueLifecycle.deleteVenue(db, photoStore(), params.id), () => ({ ok: true }))
);
