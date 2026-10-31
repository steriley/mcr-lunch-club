import { adminRoute, jsonError, jsonResponse } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { rerouteVenue, serializeVenue } from '@/lib/venues';
import { routeWarning } from '@/lib/walking-route';

export const prerender = false;

/** POST /api/admin/venues/[id]/recompute-route: retry the ORS walking route from HQ. */
export const POST = adminRoute(
  {
    action: 'Recompute venue route',
    publish: 'queue',
    venueParam: 'id',
    params: { id: 'Venue not found.' },
  },
  async ({ params, actor }) => {
    const result = await rerouteVenue(db, params.id, actor);
    if (result.ok) return jsonResponse({ venue: serializeVenue(result.venue) });
    if (result.error === 'not_found') return jsonError(404, 'Venue not found.');
    if (result.error === 'needs_location')
      return jsonError(
        409,
        'This venue needs a location before its walking route can be worked out.'
      );
    return jsonError(
      result.route.error!.kind === 'rate_limited' ? 429 : 503,
      routeWarning(result.route, 'reroute')!
    );
  }
);
