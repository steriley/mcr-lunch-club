import type { APIRoute } from 'astro';
import { and, asc, eq, ilike, not, or, type SQL } from 'drizzle-orm';
import { venues } from '@/db/schema';
import { isUniqueViolation, jsonError, jsonResponse, readJson, requireAdmin, serverError, validationError } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { parseTier } from '@/lib/tiers';
import { venueInputSchema } from '@/lib/venue-schema';
import { resolveRoute, routeWarning } from '@/lib/venue-route';
import { isSlugTaken, recordVenueRevision, serializeVenue, venueValues } from '@/lib/venues';
import { publicVenueCondition } from '@/lib/visibility';

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  try {
    const conditions: SQL[] = [];
    const query = url.searchParams.get('query')?.trim();
    const tier = parseTier(url.searchParams.get('tier'));
    const status = url.searchParams.get('status');

    if (query) {
      const pattern = `%${query.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
      conditions.push(or(ilike(venues.name, pattern), ilike(venues.slug, pattern))!);
    }
    if (tier) conditions.push(eq(venues.tier, tier));
    if (status === 'public') conditions.push(publicVenueCondition());
    if (status === 'hidden') conditions.push(not(publicVenueCondition()));

    const rows = await db
      .select()
      .from(venues)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(venues.name));

    return jsonResponse({ venues: rows.map(serializeVenue) });
  } catch (error) {
    return serverError('List venues', error);
  }
};

export const POST: APIRoute = async ({ request }) => {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  const parsed = venueInputSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);

  try {
    if (await isSlugTaken(db, parsed.data.slug)) {
      return jsonError(409, 'That slug is already in use.', { slug: 'That slug is already in use. Choose another.' });
    }

    // ORS failures never block the save; the route stays pending instead.
    const route = await resolveRoute(parsed.data, null);
    const [row] = await db.insert(venues).values(venueValues(parsed.data, session.user.id, route)).returning();
    await recordVenueRevision(db, row, session.user.id);
    return jsonResponse({ venue: serializeVenue(row), routeWarning: routeWarning(route) }, 201);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return jsonError(409, 'That slug is already in use.', { slug: 'That slug is already in use. Choose another.' });
    }
    return serverError('Create venue', error);
  }
};
