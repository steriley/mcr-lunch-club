import { and, asc, count, eq } from 'drizzle-orm';
import { venueImages, venues, type VenueImageRow } from '@/db/schema';
import type { Database, Tx } from '@/lib/db-client';
import { MAX_IMAGES_PER_VENUE, type SerializedVenueImage } from '@/lib/image-upload';
import { fail, ok, type Outcome } from '@/lib/outcome';
import { recordVenueEvent, type Actor } from '@/lib/venue-events';

/**
 * Venue photos (#35): the server data layer. A venue has 0 to 5 images and,
 * when it has any, exactly one is primary. The first image added becomes
 * primary; deleting the primary promotes the oldest remaining image.
 *
 * Every change that counts images or moves the primary flag locks the venue
 * row first, so two admins acting at once cannot exceed the cap or leave a
 * venue with two primaries (the partial unique index is the backstop).
 * Given an actor, adds, deletes and primary changes are logged to
 * venue_events in the same transaction (caption and focal edits are not
 * logged). Blob writes and deletes, and the caption and focal rules, belong to
 * the venue lifecycle (src/lib/venue-lifecycle.ts), which calls this module.
 */

export type VenueImageError = 'venue_not_found' | 'image_not_found' | 'too_many_images';

export type VenueImageResult<T> = Outcome<T, VenueImageError>;

async function lockVenue(tx: Tx, venueId: string): Promise<boolean> {
  const [venue] = await tx
    .select({ id: venues.id })
    .from(venues)
    .where(eq(venues.id, venueId))
    .for('update')
    .limit(1);
  return Boolean(venue);
}

export interface Focal {
  focalX: number | null;
  focalY: number | null;
}

/** How many photos the venue has, or null when the venue does not exist. Unlocked: a pre-check only. */
export async function countVenueImages(db: Database, venueId: string): Promise<number | null> {
  const [venue] = await db
    .select({ id: venues.id })
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1);
  if (!venue) return null;
  const [{ total }] = await db
    .select({ total: count() })
    .from(venueImages)
    .where(eq(venueImages.venueId, venueId));
  return total;
}

/** What venue_events keeps about a photo: never enough to render a removed one, just which it was. */
const eventDetail = (image: VenueImageRow, extra: Record<string, unknown> = {}) => ({
  imageId: image.id,
  thumbUrl: image.thumbUrl,
  ...extra,
});

/** Oldest first, matching the order photos were added. */
export async function listVenueImages(db: Database, venueId: string): Promise<VenueImageRow[]> {
  return db
    .select()
    .from(venueImages)
    .where(eq(venueImages.venueId, venueId))
    .orderBy(asc(venueImages.createdAt), asc(venueImages.id));
}

export interface NewVenueImage {
  /** Generated before upload so the Blob keys can use it. */
  id?: string;
  venueId: string;
  fullUrl: string;
  thumbUrl: string | null;
  width: number | null;
  height: number | null;
  caption?: string | null;
  uploadedBy: string | null;
}

/** Adds a photo under the cap. The venue's first photo becomes primary. */
export function addVenueImage(
  db: Database,
  image: NewVenueImage,
  now: Date = new Date(),
  actor?: Actor
): Promise<VenueImageResult<VenueImageRow>> {
  return db.transaction(async (tx) => {
    if (!(await lockVenue(tx, image.venueId))) return fail('venue_not_found');

    const [{ total }] = await tx
      .select({ total: count() })
      .from(venueImages)
      .where(eq(venueImages.venueId, image.venueId));
    if (total >= MAX_IMAGES_PER_VENUE) return fail('too_many_images');
    const [primary] = await tx
      .select({ id: venueImages.id })
      .from(venueImages)
      .where(and(eq(venueImages.venueId, image.venueId), eq(venueImages.isPrimary, true)))
      .limit(1);

    const [row] = await tx
      .insert(venueImages)
      .values({
        ...(image.id ? { id: image.id } : {}),
        venueId: image.venueId,
        fullUrl: image.fullUrl,
        thumbUrl: image.thumbUrl,
        width: image.width,
        height: image.height,
        caption: image.caption ?? null,
        isPrimary: !primary,
        uploadedBy: image.uploadedBy,
        createdAt: now,
      })
      .returning();
    if (actor) await recordVenueEvent(tx, image.venueId, 'image_added', actor, eventDetail(row));
    return ok(row);
  });
}

export interface PrimaryChange {
  image: VenueImageRow;
  /** The image that was primary before, or null when nothing changed or there was none. */
  previousPrimaryId: string | null;
  changed: boolean;
}

/** Makes one of the venue's photos primary. A no-op when it already is. */
export function setPrimary(
  db: Database,
  venueId: string,
  imageId: string,
  actor?: Actor
): Promise<VenueImageResult<PrimaryChange>> {
  return db.transaction(async (tx) => {
    if (!(await lockVenue(tx, venueId))) return fail('venue_not_found');

    const [image] = await tx
      .select()
      .from(venueImages)
      .where(and(eq(venueImages.id, imageId), eq(venueImages.venueId, venueId)))
      .limit(1);
    if (!image) return fail('image_not_found');
    if (image.isPrimary) return ok({ image, previousPrimaryId: null, changed: false });

    // Clear the old primary before setting the new one: a single
    // `set is_primary = (id = $1)` can trip the partial unique index mid-statement.
    const cleared = await tx
      .update(venueImages)
      .set({ isPrimary: false })
      .where(and(eq(venueImages.venueId, venueId), eq(venueImages.isPrimary, true)))
      .returning({ id: venueImages.id });
    const [updated] = await tx
      .update(venueImages)
      .set({ isPrimary: true })
      .where(eq(venueImages.id, imageId))
      .returning();
    if (actor)
      await recordVenueEvent(tx, venueId, 'image_primary_changed', actor, eventDetail(updated));
    return ok({ image: updated, previousPrimaryId: cleared[0]?.id ?? null, changed: true });
  });
}

export interface ImageMetaChanges {
  /** undefined leaves it alone; null clears it. */
  caption?: string | null;
  /** undefined leaves it alone; both null resets to centre. */
  focal?: Focal;
}

/** Caption and focal point, already validated by the caller. One statement, so no lock is needed. */
export async function updateImageMeta(
  db: Database,
  venueId: string,
  imageId: string,
  changes: ImageMetaChanges
): Promise<VenueImageResult<VenueImageRow>> {
  const set: Partial<typeof venueImages.$inferInsert> = {};
  if (changes.caption !== undefined) set.caption = changes.caption;
  if (changes.focal !== undefined) {
    set.focalX = changes.focal.focalX;
    set.focalY = changes.focal.focalY;
  }

  const where = and(eq(venueImages.id, imageId), eq(venueImages.venueId, venueId));
  const [row] = Object.keys(set).length
    ? await db.update(venueImages).set(set).where(where).returning()
    : await db.select().from(venueImages).where(where).limit(1);
  return row ? ok(row) : fail('image_not_found');
}

export interface DeletedImage {
  deleted: VenueImageRow;
  /** The image promoted to primary because the primary was deleted, if any. */
  promoted: VenueImageRow | null;
}

/** Removes the row. If it was primary, the oldest remaining photo becomes primary. Blobs are the caller's job. */
export function deleteVenueImage(
  db: Database,
  venueId: string,
  imageId: string,
  actor?: Actor
): Promise<VenueImageResult<DeletedImage>> {
  return db.transaction(async (tx) => {
    if (!(await lockVenue(tx, venueId))) return fail('venue_not_found');

    const [deleted] = await tx
      .delete(venueImages)
      .where(and(eq(venueImages.id, imageId), eq(venueImages.venueId, venueId)))
      .returning();
    if (!deleted) return fail('image_not_found');

    let promoted: VenueImageRow | null = null;
    if (deleted.isPrimary) {
      const [oldest] = await tx
        .select({ id: venueImages.id })
        .from(venueImages)
        .where(eq(venueImages.venueId, venueId))
        .orderBy(asc(venueImages.createdAt), asc(venueImages.id))
        .limit(1);
      if (oldest) {
        [promoted] = await tx
          .update(venueImages)
          .set({ isPrimary: true })
          .where(eq(venueImages.id, oldest.id))
          .returning();
      }
    }
    if (actor) {
      await recordVenueEvent(tx, venueId, 'image_removed', actor, eventDetail(deleted));
      if (promoted)
        await recordVenueEvent(
          tx,
          venueId,
          'image_primary_changed',
          actor,
          eventDetail(promoted, { reason: 'promoted_after_delete' })
        );
    }
    return ok({ deleted, promoted });
  });
}

/** JSON-safe photo for admin islands and API responses. */
export function serializeVenueImage(image: VenueImageRow): SerializedVenueImage {
  return {
    id: image.id,
    venueId: image.venueId,
    fullUrl: image.fullUrl,
    thumbUrl: image.thumbUrl,
    width: image.width,
    height: image.height,
    caption: image.caption,
    isPrimary: image.isPrimary,
    focalX: image.focalX,
    focalY: image.focalY,
    createdAt: image.createdAt.toISOString(),
  };
}
