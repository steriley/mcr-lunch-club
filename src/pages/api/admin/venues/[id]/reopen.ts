import { adminRoute, jsonError, jsonResponse } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { reopenVenue } from '@/lib/venue-closure';
import { serializeVenue } from '@/lib/venues';

export const prerender = false;

export const POST = adminRoute({ action: 'Reopen venue', publishes: true, params: { id: 'Venue not found.' } }, async ({ params, actor }) => {
  const result = await reopenVenue(db, params.id, actor);
  if (!result.ok) {
    return result.reason === 'not_found' ? jsonError(404, 'Venue not found.') : jsonError(409, 'This venue is not closed.');
  }
  return jsonResponse({ venue: serializeVenue(result.venue) });
});
