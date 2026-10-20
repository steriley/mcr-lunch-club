import type { APIRoute } from 'astro';
import { jsonError, jsonResponse, requireAdmin, serverError } from '@/lib/admin-api';
import { OrsError, searchPlaces } from '@/lib/ors';

export const prerender = false;

const MIN_QUERY_LENGTH = 3;
const MAX_QUERY_LENGTH = 200;

/** GET /api/admin/geocode?q=…: up to five ORS candidates near Greater Manchester. */
export const GET: APIRoute = async ({ request, url }) => {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  const query = (url.searchParams.get('q') ?? '').trim();
  if (query.length < MIN_QUERY_LENGTH) {
    return jsonError(400, `Type at least ${MIN_QUERY_LENGTH} characters to search.`);
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return jsonError(400, 'That search is too long.');
  }

  try {
    return jsonResponse({ results: await searchPlaces(query) });
  } catch (error) {
    if (error instanceof OrsError) {
      const status = error.kind === 'rate_limited' ? 429 : 503;
      const message =
        error.kind === 'rate_limited'
          ? 'Location search is rate limited right now. Try again in a minute, or enter the location manually.'
          : 'Location search is unavailable right now. Enter the location manually instead.';
      return jsonError(status, message);
    }
    return serverError('Geocode search', error);
  }
};
