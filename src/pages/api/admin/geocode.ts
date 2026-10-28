import { adminRoute, jsonError, jsonResponse } from '@/lib/admin-api';
import { OrsError, searchPlaces } from '@/lib/ors';

export const prerender = false;

const MIN_QUERY_LENGTH = 3;
const MAX_QUERY_LENGTH = 200;

function orsFailure(error: unknown): Response | undefined {
  if (!(error instanceof OrsError)) return undefined;
  return error.kind === 'rate_limited'
    ? jsonError(
        429,
        'Location search is rate limited right now. Try again in a minute, or enter the location manually.'
      )
    : jsonError(
        503,
        'Location search is unavailable right now. Enter the location manually instead.'
      );
}

/** GET /api/admin/geocode?q=…: up to five ORS candidates near Greater Manchester. */
export const GET = adminRoute(
  { action: 'Geocode search', publishes: false, onError: orsFailure },
  async ({ url }) => {
    const query = (url.searchParams.get('q') ?? '').trim();
    if (query.length < MIN_QUERY_LENGTH) {
      return jsonError(400, `Type at least ${MIN_QUERY_LENGTH} characters to search.`);
    }
    if (query.length > MAX_QUERY_LENGTH) {
      return jsonError(400, 'That search is too long.');
    }
    return jsonResponse({ results: await searchPlaces(query) });
  }
);
