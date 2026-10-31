import { adminRoute, jsonError, jsonResponse } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { closeVenue } from '@/lib/venue-closure';
import { serializeVenue } from '@/lib/venues';

export const prerender = false;

export const POST = adminRoute(
  { action: 'Close venue', publish: 'now', venueParam: 'id', params: { id: 'Venue not found.' } },
  async ({ params, actor }) => {
    const result = await closeVenue(db, params.id, actor);
    if (!result.ok) {
      return result.reason === 'not_found'
        ? jsonError(404, 'Venue not found.')
        : jsonError(409, 'This venue is already marked closed.');
    }
    return jsonResponse({ venue: serializeVenue(result.venue) });
  }
);
