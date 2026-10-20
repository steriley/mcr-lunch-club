import { and, desc, eq, ne } from 'drizzle-orm';
import { venueRevisions, venues, type VenueRow } from '@/db/schema';
import type { Database } from '@/lib/db-client';
import { BASE_COORDINATES } from '@/lib/map/config';
import { haversineMetres } from '@/lib/map/ranking';
import type { VenueInput } from '@/lib/venue-schema';

const METRES_PER_MILE = 1609.344;

export function distanceFromBaseMiles(latitude: number, longitude: number): number {
  return Math.round((haversineMetres(BASE_COORDINATES, { lat: latitude, lng: longitude }) / METRES_PER_MILE) * 100) / 100;
}

/** Walking estimate on the city grid; same formula as scripts/seed-data.mjs. */
export function estimateWalkingMinutes(miles: number): number {
  if (miles <= 0) return 1;
  return Math.max(1, Math.round(miles * 19.5 + (miles > 0.5 ? 2 : 1)));
}

/** Database values for an insert or update; fills distance/walk time from coordinates when left blank. */
export function venueValues(input: VenueInput, userId: string | null) {
  const hasCoordinates = input.latitude !== null && input.longitude !== null;
  const distanceMiles =
    input.distanceMiles ?? (hasCoordinates ? distanceFromBaseMiles(input.latitude!, input.longitude!) : null);
  const walkingTimeMin = input.walkingTimeMin ?? (distanceMiles !== null ? estimateWalkingMinutes(distanceMiles) : null);

  return {
    name: input.name,
    slug: input.slug,
    tier: input.tier,
    address: input.address,
    latitude: input.latitude === null ? null : input.latitude.toFixed(6),
    longitude: input.longitude === null ? null : input.longitude.toFixed(6),
    pullQuote: input.pullQuote,
    lunchSpecial: input.lunchSpecial,
    websiteUrl: input.websiteUrl,
    imageUrl: input.imageUrl,
    cost: input.cost,
    cuisine: input.cuisine,
    distanceMiles: distanceMiles === null ? null : distanceMiles.toFixed(2),
    walkingTimeMin,
    lastInspectionDate: input.lastInspectionDate,
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
export async function recordVenueRevision(db: Database, venue: VenueRow, changedBy: string | null): Promise<void> {
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
  };
}

export type SerializedVenue = ReturnType<typeof serializeVenue>;
