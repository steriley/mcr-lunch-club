import { randomUUID } from 'node:crypto';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import {
  venueImages,
  venues,
  type TierProposalRow,
  type VenueImageRow,
  type VenueRow,
} from '@/db/schema';
import { isUniqueViolation } from '@/lib/db-errors';
import type { Database } from '@/lib/db-client';
import {
  CAPTION_MAX,
  FULL_MAX_EDGE,
  MAX_FULL_BYTES,
  MAX_IMAGES_PER_VENUE,
  MAX_THUMB_BYTES,
  THUMB_MAX_EDGE,
} from '@/lib/image-upload';
import type { LatLng, WalkingRoute } from '@/lib/ors';
import { fail, ok, outcomeTransaction, type Outcome, type PublicChange } from '@/lib/outcome';
import { markSuggestionAccepted, SUGGESTION_PROPOSED_TIER } from '@/lib/suggestions';
import { proposeTierInTx, type ProposalError } from '@/lib/tier-proposals';
import type { TierValue } from '@/lib/tiers';
import { recordVenueEvent, type Actor } from '@/lib/venue-events';
import {
  addVenueImage,
  countVenueImages,
  deleteVenueImage,
  setPrimary,
  updateImageMeta,
  type DeletedImage,
  type Focal,
  type ImageMetaChanges,
  type VenueImageError,
} from '@/lib/venue-images';
import type { PhotoStore } from '@/lib/venue-image-storage';
import type { VenueInput } from '@/lib/venue-schema';
import {
  isSlugTaken,
  recordVenueRevision,
  routeColumns,
  venueValues,
  writeVenue,
} from '@/lib/venues';
import { readWebpInfo, type WebpInfo } from '@/lib/webp';
import { computeRoute, resolveRoute, routeWarning, type ResolvedRoute } from '@/lib/walking-route';

/**
 * The venue lifecycle (#108): every operation on a venue, in one place.
 *
 * Routes parse the request, call one function here and turn its outcome into
 * a response (adminRoute does the mapping, #112). Each function takes the
 * database, the input and the acting Chair, and returns an `Outcome`: a
 * domain error code, or a value with the public change it made. Photo files
 * go through a `PhotoStore`, so tests run against a real database with an
 * in-memory store.
 *
 * Tier changes stay in src/lib/tier-proposals.ts; creating a venue starts
 * its first proposal there, in the same transaction.
 */

type RouteLookup = (to: LatLng) => Promise<WalkingRoute>;

const change = (action: string, venueId: string, when: PublicChange['when'] = 'queue') =>
  ({ action, venueId, when }) satisfies PublicChange;

// --- Validation: the one home of the caption and focal-point rules ---------------------------------

/** Trimmed caption, null when blank, or an error when too long. */
export function normaliseCaption(
  caption: string | null | undefined
): Outcome<string | null, 'caption_too_long'> {
  const trimmed = caption?.trim() ?? '';
  if (trimmed.length > CAPTION_MAX) return fail('caption_too_long');
  return ok(trimmed || null);
}

/** Both null (centre) or both whole numbers from 0 to 100. */
export function isValidFocal(focal: Focal): boolean {
  if (focal.focalX === null && focal.focalY === null) return true;
  return [focal.focalX, focal.focalY].every(
    (value) => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 100
  );
}

// --- Create, update, reroute ------------------------------------------------------------------------

interface CreateOptions {
  /** The first tier to propose, for a different Chair to approve. Ignored for a suggestion. */
  proposedTier: TierValue | null;
  /** The suggestion being accepted: always proposes To Be Assessed and is marked accepted. */
  fromSuggestion?: string | null;
}

type CreateError = 'slug_taken' | 'suggestion_unavailable' | ProposalError;

interface Created {
  venue: VenueRow;
  /** The first tier proposal, when one was asked for. */
  proposal: TierProposalRow | null;
  route: ResolvedRoute;
}

/**
 * Creates a venue with no approved tier (hidden) and, when a tier is asked for,
 * its first pending proposal, in one transaction; accepting a suggestion marks
 * it accepted in the same one. Nothing is published: the venue stays hidden
 * until its tier is approved.
 */
async function createVenue(
  db: Database,
  input: VenueInput,
  options: CreateOptions,
  actor: Actor,
  lookup?: RouteLookup
): Promise<Outcome<Created, CreateError>> {
  if (await isSlugTaken(db, input.slug)) return fail('slug_taken');

  // ORS failures never block the save; the route stays pending instead. Looked up before the transaction.
  const route = await resolveRoute(input, null, lookup);
  const proposedTier = options.fromSuggestion ? SUGGESTION_PROPOSED_TIER : options.proposedTier;

  try {
    return await outcomeTransaction(db, async (tx) => {
      const [venue] = await tx
        .insert(venues)
        .values(venueValues(input, actor.id, route))
        .returning();
      await recordVenueRevision(tx, venue, actor.id);

      let proposal: TierProposalRow | null = null;
      if (proposedTier) {
        const proposed = await proposeTierInTx(tx, venue.id, proposedTier, actor);
        if (!proposed.ok) return fail(proposed.error);
        proposal = proposed.value;
      }
      if (
        options.fromSuggestion &&
        !(await markSuggestionAccepted(tx, options.fromSuggestion, venue.id, actor.id))
      )
        return fail('suggestion_unavailable');
      return ok({ venue, proposal, route });
    });
  } catch (error) {
    // Two Chairs saving the same slug at once: the unique index is the backstop for the pre-check.
    if (isUniqueViolation(error)) return fail('slug_taken');
    throw error;
  }
}

interface Updated {
  venue: VenueRow;
  route: ResolvedRoute;
}

/** Saves the admin venue form: slug check, walking route (ORS only when the location needs it), then the row. */
async function updateVenue(
  db: Database,
  id: string,
  input: VenueInput,
  actor: Actor,
  lookup?: RouteLookup
): Promise<Outcome<Updated, 'venue_not_found' | 'slug_taken'>> {
  if (await isSlugTaken(db, input.slug, id)) return fail('slug_taken');

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
  if (!existing) return fail('venue_not_found');

  // Looked up before the transaction, so a slow ORS call never holds it open. Failures leave the route pending.
  const route = await resolveRoute(input, existing, lookup);
  try {
    const venue = await writeVenue(db, id, venueValues(input, actor.id, route), actor);
    return venue ? ok({ venue, route }, change('Update venue', id)) : fail('venue_not_found');
  } catch (error) {
    if (isUniqueViolation(error)) return fail('slug_taken');
    throw error;
  }
}

type RerouteError =
  'venue_not_found' | 'needs_location' | 'route_rate_limited' | 'route_unavailable';

/** Retries the ORS walking route from HQ. A failed lookup changes nothing. */
async function rerouteVenue(
  db: Database,
  id: string,
  actor: Actor,
  lookup?: RouteLookup
): Promise<Outcome<VenueRow, RerouteError>> {
  const [venue] = await db
    .select({ latitude: venues.latitude, longitude: venues.longitude })
    .from(venues)
    .where(eq(venues.id, id))
    .limit(1);
  if (!venue) return fail('venue_not_found');
  if (venue.latitude === null || venue.longitude === null) return fail('needs_location');

  const route = await computeRoute(
    { lat: Number(venue.latitude), lng: Number(venue.longitude) },
    lookup
  );
  if (route.error)
    return fail(
      route.error.kind === 'rate_limited' ? 'route_rate_limited' : 'route_unavailable',
      routeWarning(route, 'reroute') ?? undefined
    );

  const row = await writeVenue(db, id, routeColumns(route), actor);
  return row ? ok(row, change('Recompute venue route', id)) : fail('venue_not_found');
}

// --- Close, reopen, delete --------------------------------------------------------------------------

/**
 * "Permanently closed" is a fact about a venue, not a tier: closing never
 * changes the tier and needs no second admin. Any admin can close or reopen;
 * both are logged with who and when, and published at once.
 */
async function setClosed(
  db: Database,
  venueId: string,
  actor: Actor,
  close: boolean
): Promise<Outcome<VenueRow, 'venue_not_found' | 'already_closed' | 'not_closed'>> {
  return db.transaction(async (tx) => {
    // Only flips the flag when it is not already in the target state, so a double click logs once.
    const [venue] = await tx
      .update(venues)
      .set(
        close ? { closedAt: new Date(), closedBy: actor.id } : { closedAt: null, closedBy: null }
      )
      .where(
        and(eq(venues.id, venueId), close ? isNull(venues.closedAt) : isNotNull(venues.closedAt))
      )
      .returning();

    if (!venue) {
      const [existing] = await tx
        .select({ id: venues.id })
        .from(venues)
        .where(eq(venues.id, venueId))
        .limit(1);
      return fail(existing ? (close ? 'already_closed' : 'not_closed') : 'venue_not_found');
    }

    await recordVenueEvent(tx, venueId, close ? 'closed' : 'reopened', actor);
    return ok(venue, change(close ? 'Close venue' : 'Reopen venue', venueId, 'now'));
  });
}

const closeVenue = (db: Database, venueId: string, actor: Actor) =>
  setClosed(db, venueId, actor, true);

const reopenVenue = (db: Database, venueId: string, actor: Actor) =>
  setClosed(db, venueId, actor, false);

/** Deletes the venue, then the files of its photos (the rows go with it). */
async function deleteVenue(
  db: Database,
  photos: PhotoStore,
  venueId: string
): Promise<Outcome<null, 'venue_not_found'>> {
  // Collect the name and the photos first: deleting the venue cascades to their rows, and the
  // pending change keeps the name of a venue that is gone.
  const [existing] = await db
    .select({ name: venues.name })
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1);
  const images = await db
    .select({ fullUrl: venueImages.fullUrl, thumbUrl: venueImages.thumbUrl })
    .from(venueImages)
    .where(eq(venueImages.venueId, venueId));
  const [row] = await db.delete(venues).where(eq(venues.id, venueId)).returning({ id: venues.id });
  if (!row) return fail('venue_not_found');

  await photos.delete(
    images.flatMap((image) => [image.fullUrl, image.thumbUrl]).filter((url) => url !== null)
  );
  return ok(null, {
    ...change('Delete venue', venueId),
    venueName: existing?.name ?? null,
  });
}

// --- Photos -----------------------------------------------------------------------------------------

interface NewPhoto {
  /** The two WebP variants; null when the form had none. */
  full: Uint8Array | null;
  thumb: Uint8Array | null;
  /** What the browser says the full variant measures; it must match the file. */
  width: number | null;
  height: number | null;
  caption: string | null;
}

type PhotoError = VenueImageError | 'caption_too_long' | 'invalid_focal' | 'invalid_photo';

const KB = (bytes: number) => `${Math.round(bytes / 1024)} KB`;

type Variant = { ok: true; bytes: Uint8Array; info: WebpInfo } | { ok: false; message: string };

/** Must really be WebP (by its bytes, not its declared type) and within the size and dimension limits. */
function checkVariant(
  bytes: Uint8Array | null,
  label: string,
  maxBytes: number,
  maxEdge: number
): Variant {
  if (!bytes) return { ok: false, message: `The ${label} image is missing.` };
  if (bytes.length > maxBytes)
    return {
      ok: false,
      message: `The ${label} image is ${KB(bytes.length)}; the limit is ${KB(maxBytes)}.`,
    };
  const info = readWebpInfo(bytes);
  if (!info) return { ok: false, message: `The ${label} image is not a valid WebP file.` };
  if (Math.max(info.width, info.height) > maxEdge) {
    return {
      ok: false,
      message: `The ${label} image is ${info.width}×${info.height}; its longest edge must be ${maxEdge}px or less.`,
    };
  }
  return { ok: true, bytes, info };
}

type Variants = {
  ok: true;
  full: Extract<Variant, { ok: true }>;
  thumb: Extract<Variant, { ok: true }>;
};

const refused = (detail: string) => ({
  ok: false as const,
  error: 'invalid_photo' as const,
  detail,
});

function checkPhoto(
  photo: NewPhoto
): Variants | { ok: false; error: 'invalid_photo'; detail: string } {
  const full = checkVariant(photo.full, 'full-size', MAX_FULL_BYTES, FULL_MAX_EDGE);
  if (!full.ok) return refused(full.message);
  const thumb = checkVariant(photo.thumb, 'thumbnail', MAX_THUMB_BYTES, THUMB_MAX_EDGE);
  if (!thumb.ok) return refused(thumb.message);
  if (photo.width !== full.info.width || photo.height !== full.info.height)
    return refused('The width and height do not match the full-size image.');
  return { ok: true, full, thumb };
}

/**
 * Adds a photo: checks the two WebP variants and the caption, writes both
 * files, then inserts the row under the venue's lock (the first photo becomes
 * primary, and the cap is enforced there). If anything fails after a file was
 * written, the files written so far are deleted.
 */
async function addPhoto(
  db: Database,
  photos: PhotoStore,
  venueId: string,
  photo: NewPhoto,
  actor: Actor
): Promise<Outcome<VenueImageRow, PhotoError>> {
  const caption = normaliseCaption(photo.caption);
  if (!caption.ok) return caption;
  const checked = checkPhoto(photo);
  if (!checked.ok) return checked;

  // A cheap early exit before anything is uploaded; addVenueImage checks again under the lock.
  const existing = await countVenueImages(db, venueId);
  if (existing === null) return fail('venue_not_found');
  if (existing >= MAX_IMAGES_PER_VENUE) return fail('too_many_images');

  const imageId = randomUUID();
  const written: string[] = [];
  try {
    const fullUrl = await photos.put(`venues/${venueId}/${imageId}-full.webp`, checked.full.bytes);
    written.push(fullUrl);
    const thumbUrl = await photos.put(
      `venues/${venueId}/${imageId}-thumb.webp`,
      checked.thumb.bytes
    );
    written.push(thumbUrl);

    const added = await addVenueImage(
      db,
      {
        id: imageId,
        venueId,
        fullUrl,
        thumbUrl,
        width: checked.full.info.width,
        height: checked.full.info.height,
        caption: caption.value,
        uploadedBy: actor.id,
      },
      new Date(),
      actor
    );
    if (!added.ok) {
      await photos.delete(written);
      return added;
    }
    return ok(added.value, change('Add venue image', venueId));
  } catch (error) {
    await photos.delete(written);
    throw error;
  }
}

interface PhotoChanges {
  /** undefined leaves it alone; null or blank clears it. */
  caption?: string | null;
  /** Both together (or both null to reset to centre); undefined leaves the focal point alone. */
  focalX?: number | null;
  focalY?: number | null;
  /** There must always be a primary, so a photo can only be made primary, never unset. */
  isPrimary?: true;
}

/** Caption, focal point and the primary flag of one photo. */
async function updatePhoto(
  db: Database,
  venueId: string,
  imageId: string,
  changes: PhotoChanges,
  actor: Actor
): Promise<Outcome<VenueImageRow, PhotoError>> {
  // Validate everything before writing anything.
  const meta: ImageMetaChanges = {};
  if (changes.caption !== undefined) {
    const caption = normaliseCaption(changes.caption);
    if (!caption.ok) return caption;
    meta.caption = caption.value;
  }
  if (changes.focalX !== undefined || changes.focalY !== undefined) {
    // Both coordinates together (null is a real value: reset to centre), or neither.
    const { focalX, focalY } = changes;
    if (focalX === undefined || focalY === undefined) return fail('invalid_focal');
    const focal = { focalX, focalY };
    if (!isValidFocal(focal)) return fail('invalid_focal');
    meta.focal = focal;
  }

  // Primary first: it is the one change that can fail on a stale image, so nothing is half-written.
  let primaryImage: VenueImageRow | null = null;
  if (changes.isPrimary) {
    const primary = await setPrimary(db, venueId, imageId, actor);
    if (!primary.ok) return primary;
    primaryImage = primary.value.image;
  }
  if (primaryImage && Object.keys(meta).length === 0)
    return ok(primaryImage, change('Update venue image', venueId));

  const updated = await updateImageMeta(db, venueId, imageId, meta);
  return updated.ok ? ok(updated.value, change('Update venue image', venueId)) : updated;
}

/** Removes the row (promoting a new primary if needed), then the files, best-effort. */
async function removePhoto(
  db: Database,
  photos: PhotoStore,
  venueId: string,
  imageId: string,
  actor: Actor
): Promise<Outcome<DeletedImage, VenueImageError>> {
  const removed = await deleteVenueImage(db, venueId, imageId, actor);
  if (!removed.ok) return removed;
  const { deleted } = removed.value;
  await photos.delete([deleted.fullUrl, ...(deleted.thumbUrl ? [deleted.thumbUrl] : [])]);
  return ok(removed.value, change('Delete venue image', venueId));
}

/**
 * Every venue operation. Routes call these through the object so route tests
 * can stub one function without touching the database (a module's own exports
 * cannot be replaced).
 */
export const venueLifecycle = {
  createVenue,
  updateVenue,
  closeVenue,
  reopenVenue,
  rerouteVenue,
  deleteVenue,
  addPhoto,
  updatePhoto,
  removePhoto,
};
