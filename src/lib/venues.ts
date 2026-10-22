import { and, desc, eq, ne } from 'drizzle-orm';
import { venueRevisions, venues, type VenueRow } from '@/db/schema';
import type { Database, Tx } from '@/lib/db-client';
import type { WalkingRoute, LatLng } from '@/lib/ors';
import type { Actor } from '@/lib/venue-events';
import type { VenueInput } from '@/lib/venue-schema';
import { computeRoute, resolveRoute, type ResolvedRoute, type RouteValues } from '@/lib/walking-route';

/**
 * The Venue store: every change to a venue row goes through updateVenue()
 * (or createVenueWithProposal() in venue-create.ts), so each one writes the
 * row and its revision snapshot together, in one transaction.
 */

type RouteLookup = (to: LatLng) => Promise<WalkingRoute>;

/** Distance and walking time as stored. Only ever computed by src/lib/walking-route.ts, never typed in. */
export function routeColumns(route: RouteValues) {
  return {
    distanceMiles: route.distanceMiles === null ? null : route.distanceMiles.toFixed(2),
    walkingTimeMin: route.walkingTimeMin,
    ...(route.routeUpdatedAt === undefined ? {} : { routeUpdatedAt: route.routeUpdatedAt }),
  };
}

/**
 * Database values for an insert or update. Distance and walking time come
 * from resolveRoute() (src/lib/walking-route.ts), never from the form.
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
    ...routeColumns(route),
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

/**
 * Writes `changes` to a venue and records the revision, in one transaction
 * (a savepoint when `db` is already a transaction). A Chair's change is
 * stamped with who and when; a script's (`actor` null) adds no stamp of its
 * own, though `changes` may still carry one. Null when the venue does not exist.
 */
export function updateVenue(
  db: Database | Tx,
  id: string,
  changes: Partial<typeof venues.$inferInsert>,
  actor: Pick<Actor, 'id'> | null,
  now: Date = new Date()
): Promise<VenueRow | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(venues)
      .set(actor ? { ...changes, updatedBy: actor.id, updatedAt: now } : changes)
      .where(eq(venues.id, id))
      .returning();
    if (row) await recordVenueRevision(tx, row, actor?.id ?? null);
    return row ?? null;
  });
}

export type SaveVenueResult = { ok: true; venue: VenueRow; route: ResolvedRoute } | { ok: false; error: 'not_found' | 'slug_taken' };

/** Saves the admin venue form: slug check, walking route (ORS only when the location needs it), then the row. */
export async function saveVenue(db: Database, id: string, input: VenueInput, actor: Actor, lookup?: RouteLookup): Promise<SaveVenueResult> {
  if (await isSlugTaken(db, input.slug, id)) return { ok: false, error: 'slug_taken' };

  const [existing] = await db
    .select({
      latitude: venues.latitude,
      longitude: venues.longitude,
      distanceMiles: venues.distanceMiles,
      walkingTimeMin: venues.walkingTimeMin,
      routeUpdatedAt: venues.routeUpdatedAt,
    })
    .from(venues)
    .where(eq(venues.id, id))
    .limit(1);
  if (!existing) return { ok: false, error: 'not_found' };

  // Looked up before the transaction, so a slow ORS call never holds it open. Failures leave the route pending.
  const route = await resolveRoute(input, existing, lookup);
  const venue = await updateVenue(db, id, venueValues(input, actor.id, route), actor);
  return venue ? { ok: true, venue, route } : { ok: false, error: 'not_found' };
}

export type RerouteResult =
  | { ok: true; venue: VenueRow }
  | { ok: false; error: 'not_found' }
  | { ok: false; error: 'needs_location' }
  | { ok: false; error: 'route_failed'; route: ResolvedRoute };

/** Retries the ORS walking route from HQ. A failed lookup changes nothing. */
export async function rerouteVenue(db: Database, id: string, actor: Actor, lookup?: RouteLookup): Promise<RerouteResult> {
  const [venue] = await db.select({ latitude: venues.latitude, longitude: venues.longitude }).from(venues).where(eq(venues.id, id)).limit(1);
  if (!venue) return { ok: false, error: 'not_found' };
  if (venue.latitude === null || venue.longitude === null) return { ok: false, error: 'needs_location' };

  const route = await computeRoute({ lat: Number(venue.latitude), lng: Number(venue.longitude) }, lookup);
  if (route.error) return { ok: false, error: 'route_failed', route };

  const row = await updateVenue(db, id, routeColumns(route), actor);
  return row ? { ok: true, venue: row } : { ok: false, error: 'not_found' };
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
  // The old single image link is no longer edited here; photos live in venue_images (#35).
  const { imageUrl: _imageUrl, ...fields } = venue;
  return {
    ...fields,
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
