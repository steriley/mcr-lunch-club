import { and, desc, eq, ne } from 'drizzle-orm';
import { venueRevisions, venues, type VenueRow } from '@/db/schema';
import type { Database } from '@/lib/db-client';
import type { VenueInput } from '@/lib/venue-schema';
import type { RouteValues } from '@/lib/venue-route';

/**
 * Database values for an insert or update. Distance and walking time come
 * from resolveRoute() (src/lib/venue-route.ts), never from the form.
 */
export function venueValues(input: VenueInput, userId: string | null, route: RouteValues) {
  return {
    name: input.name,
    slug: input.slug,
    address: input.address,
    latitude: input.latitude === null ? null : input.latitude.toFixed(6),
    longitude: input.longitude === null ? null : input.longitude.toFixed(6),
    pullQuote: input.pullQuote,
    lunchSpecial: input.lunchSpecial,
    websiteUrl: input.websiteUrl,
    cost: input.cost,
    cuisine: input.cuisine,
    distanceMiles: route.distanceMiles === null ? null : route.distanceMiles.toFixed(2),
    walkingTimeMin: route.walkingTimeMin,
    ...(route.routeUpdatedAt === undefined ? {} : { routeUpdatedAt: route.routeUpdatedAt }),
    mapSearchLink: input.mapSearchLink,
    updatedBy: userId,
    updatedAt: new Date(),
  };
}

export async function isSlugTaken(db: Database, slug: string, excludeId?: string): Promise<boolean> {
  const condition = excludeId ? and(eq(venues.slug, slug), ne(venues.id, excludeId)) : eq(venues.slug, slug);
  const [row] = await db.select({ id: venues.id }).from(venues).where(condition).limit(1);
  return Boolean(row);
}

/** Audit trail: store a full snapshot of the venue as saved. */
export async function recordVenueRevision(db: Pick<Database, 'insert'>, venue: VenueRow, changedBy: string | null): Promise<void> {
  await db.insert(venueRevisions).values({
    venueId: venue.id,
    changedBy,
    snapshot: serializeVenue(venue),
  });
}

export async function listVenueRevisions(db: Database, venueId: string) {
  return db
    .select()
    .from(venueRevisions)
    .where(eq(venueRevisions.venueId, venueId))
    .orderBy(desc(venueRevisions.changedAt))
    .limit(100);
}

const toNumber = (value: string | null) => (value === null ? null : Number(value));

/** JSON-safe venue for admin islands and revision snapshots. */
export function serializeVenue(venue: VenueRow) {
  return {
    ...venue,
    latitude: toNumber(venue.latitude),
    longitude: toNumber(venue.longitude),
    distanceMiles: toNumber(venue.distanceMiles),
    createdAt: venue.createdAt.toISOString(),
    updatedAt: venue.updatedAt.toISOString(),
    closedAt: venue.closedAt?.toISOString() ?? null,
    routeUpdatedAt: venue.routeUpdatedAt?.toISOString() ?? null,
  };
}

export type SerializedVenue = ReturnType<typeof serializeVenue>;
