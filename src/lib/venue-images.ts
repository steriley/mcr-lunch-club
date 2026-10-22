import { and, asc, count, eq } from 'drizzle-orm';
import { venueImages, venues, type VenueImageRow } from '@/db/schema';
import type { Database } from '@/lib/db-client';
import { CAPTION_MAX, MAX_IMAGES_PER_VENUE, type SerializedVenueImage } from '@/lib/image-upload';
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
 * logged). Blob writes and deletes are the routes' job.
 */

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

export type VenueImageError = 'venue_not_found' | 'image_not_found' | 'too_many_images' | 'caption_too_long' | 'invalid_focal';

export const VENUE_IMAGE_ERROR_MESSAGES: Record<VenueImageError, string> = {
  venue_not_found: 'Venue not found.',
  image_not_found: 'Photo not found.',
  too_many_images: `A venue can have at most ${MAX_IMAGES_PER_VENUE} photos. Delete one first.`,
  caption_too_long: `Keep the caption to ${CAPTION_MAX} characters or fewer.`,
  invalid_focal: 'The focal point must be two whole numbers from 0 to 100, or both empty.',
};

export const VENUE_IMAGE_ERROR_STATUS: Record<VenueImageError, number> = {
  venue_not_found: 404,
  image_not_found: 404,
  too_many_images: 409,
  caption_too_long: 400,
  invalid_focal: 400,
};

export type VenueImageResult<T> = { ok: true; value: T } | { ok: false; error: VenueImageError };

const fail = (error: VenueImageError) => ({ ok: false as const, error });

async function lockVenue(tx: Tx, venueId: string): Promise<boolean> {
  const [venue] = await tx.select({ id: venues.id }).from(venues).where(eq(venues.id, venueId)).for('update').limit(1);
  return Boolean(venue);
}

/** Trimmed caption, null when blank, or an error when too long. */
export function normaliseCaption(caption: string | null | undefined): VenueImageResult<string | null> {
  const trimmed = caption?.trim() ?? '';
  if (trimmed.length > CAPTION_MAX) return fail('caption_too_long');
  return { ok: true, value: trimmed || null };
}

export interface Focal {
  focalX: number | null;
  focalY: number | null;
}

/** Both null (centre) or both whole numbers from 0 to 100. */
export function isValidFocal(focal: Focal): boolean {
  if (focal.focalX === null && focal.focalY === null) return true;
  return [focal.focalX, focal.focalY].every((value) => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 100);
}

/** Oldest first, matching the order photos were added. */
/** How many photos the venue has, or null when the venue does not exist. Unlocked: a pre-check only. */
export async function countVenueImages(db: Database, venueId: string): Promise<number | null> {
  const [venue] = await db.select({ id: venues.id }).from(venues).where(eq(venues.id, venueId)).limit(1);
  if (!venue) return null;
  const [{ total }] = await db.select({ total: count() }).from(venueImages).where(eq(venueImages.venueId, venueId));
  return total;
}

/** What venue_events keeps about a photo: never enough to render a removed one, just which it was. */
const eventDetail = (image: VenueImageRow, extra: Record<string, unknown> = {}) => ({ imageId: image.id, thumbUrl: image.thumbUrl, ...extra });

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
export function addVenueImage(db: Database, image: NewVenueImage, now: Date = new Date(), actor?: Actor): Promise<VenueImageResult<VenueImageRow>> {
  const caption = normaliseCaption(image.caption);
  if (!caption.ok) return Promise.resolve(caption);

  return db.transaction(async (tx) => {
    if (!(await lockVenue(tx, image.venueId))) return fail('venue_not_found');

    const [{ total }] = await tx.select({ total: count() }).from(venueImages).where(eq(venueImages.venueId, image.venueId));
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
        caption: caption.value,
        isPrimary: !primary,
        uploadedBy: image.uploadedBy,
        createdAt: now,
      })
      .returning();
    if (actor) await recordVenueEvent(tx, image.venueId, 'image_added', actor, eventDetail(row));
    return { ok: true, value: row };
  });
}

export interface PrimaryChange {
  image: VenueImageRow;
  /** The image that was primary before, or null when nothing changed or there was none. */
  previousPrimaryId: string | null;
  changed: boolean;
}

/** Makes one of the venue's photos primary. A no-op when it already is. */
export function setPrimary(db: Database, venueId: string, imageId: string, actor?: Actor): Promise<VenueImageResult<PrimaryChange>> {
  return db.transaction(async (tx) => {
    if (!(await lockVenue(tx, venueId))) return fail('venue_not_found');

    const [image] = await tx
      .select()
      .from(venueImages)
      .where(and(eq(venueImages.id, imageId), eq(venueImages.venueId, venueId)))
      .limit(1);
    if (!image) return fail('image_not_found');
    if (image.isPrimary) return { ok: true, value: { image, previousPrimaryId: null, changed: false } };

    // Clear the old primary before setting the new one: a single
    // `set is_primary = (id = $1)` can trip the partial unique index mid-statement.
    const cleared = await tx
      .update(venueImages)
      .set({ isPrimary: false })
      .where(and(eq(venueImages.venueId, venueId), eq(venueImages.isPrimary, true)))
      .returning({ id: venueImages.id });
    const [updated] = await tx.update(venueImages).set({ isPrimary: true }).where(eq(venueImages.id, imageId)).returning();
    if (actor) await recordVenueEvent(tx, venueId, 'image_primary_changed', actor, eventDetail(updated));
    return { ok: true, value: { image: updated, previousPrimaryId: cleared[0]?.id ?? null, changed: true } };
  });
}

export interface ImageMetaChanges {
  /** undefined leaves it alone; null or blank clears it. */
  caption?: string | null;
  /** undefined leaves it alone; both null resets to centre. */
  focal?: Focal;
}

/** Caption and focal point. One statement, so no lock is needed. */
export async function updateImageMeta(
  db: Database,
  venueId: string,
  imageId: string,
  changes: ImageMetaChanges
): Promise<VenueImageResult<VenueImageRow>> {
  const set: Partial<typeof venueImages.$inferInsert> = {};
  if (changes.caption !== undefined) {
    const caption = normaliseCaption(changes.caption);
    if (!caption.ok) return caption;
    set.caption = caption.value;
  }
  if (changes.focal !== undefined) {
    if (!isValidFocal(changes.focal)) return fail('invalid_focal');
    set.focalX = changes.focal.focalX;
    set.focalY = changes.focal.focalY;
  }

  const where = and(eq(venueImages.id, imageId), eq(venueImages.venueId, venueId));
  const [row] = Object.keys(set).length
    ? await db.update(venueImages).set(set).where(where).returning()
    : await db.select().from(venueImages).where(where).limit(1);
  return row ? { ok: true, value: row } : fail('image_not_found');
}

export interface DeletedImage {
  deleted: VenueImageRow;
  /** The image promoted to primary because the primary was deleted, if any. */
  promoted: VenueImageRow | null;
}

/** Removes the row. If it was primary, the oldest remaining photo becomes primary. Blobs are the caller's job. */
export function deleteVenueImage(db: Database, venueId: string, imageId: string, actor?: Actor): Promise<VenueImageResult<DeletedImage>> {
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
        [promoted] = await tx.update(venueImages).set({ isPrimary: true }).where(eq(venueImages.id, oldest.id)).returning();
      }
    }
    if (actor) {
      await recordVenueEvent(tx, venueId, 'image_removed', actor, eventDetail(deleted));
      if (promoted) await recordVenueEvent(tx, venueId, 'image_primary_changed', actor, eventDetail(promoted, { reason: 'promoted_after_delete' }));
    }
    return { ok: true, value: { deleted, promoted } };
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

const OWNED_BLOB_HOST_SUFFIX = '.public.blob.vercel-storage.com';

/**
 * True only for our own public Vercel Blob URLs. Migrated external links
 * (and anything unparseable) must never be passed to `del()`.
 */
export function isOwnedBlobUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname.toLowerCase().endsWith(OWNED_BLOB_HOST_SUFFIX);
  } catch {
    return false;
  }
}

export interface WebpInfo {
  /** First chunk: lossy, lossless, or extended (alpha, animation, metadata). */
  format: 'VP8' | 'VP8L' | 'VP8X';
  width: number;
  height: number;
}

const ascii = (bytes: Uint8Array, offset: number, length: number) => String.fromCharCode(...bytes.subarray(offset, offset + length));
const u16 = (bytes: Uint8Array, offset: number) => bytes[offset] | (bytes[offset + 1] << 8);
const u24 = (bytes: Uint8Array, offset: number) => bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
const u32 = (bytes: Uint8Array, offset: number) => (u24(bytes, offset) | (bytes[offset + 3] << 24)) >>> 0;

/**
 * Reads a WebP's real format and pixel size from its bytes, ignoring any
 * declared content type. Returns null for anything that is not a complete
 * WebP: a wrong signature, an unknown first chunk, or a truncated file.
 */
export function readWebpInfo(bytes: Uint8Array): WebpInfo | null {
  // RIFF header (12) + chunk header (8).
  if (bytes.length < 20 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') return null;
  // The RIFF size covers everything after its own 8 bytes; a shorter file is truncated.
  if (u32(bytes, 4) + 8 > bytes.length) return null;

  const chunk = ascii(bytes, 12, 4);
  const size = u32(bytes, 16);
  const data = 20;
  if (data + size > bytes.length) return null;

  if (chunk === 'VP8 ') {
    // Frame tag (3), start code 9d 01 2a (3), then 14-bit width and height.
    if (size < 10 || bytes[data + 3] !== 0x9d || bytes[data + 4] !== 0x01 || bytes[data + 5] !== 0x2a) return null;
    const width = u16(bytes, data + 6) & 0x3fff;
    const height = u16(bytes, data + 8) & 0x3fff;
    return width && height ? { format: 'VP8', width, height } : null;
  }
  if (chunk === 'VP8L') {
    // Signature 0x2f, then 14 bits of width - 1 and 14 bits of height - 1.
    if (size < 5 || bytes[data] !== 0x2f) return null;
    const bits = u32(bytes, data + 1);
    return { format: 'VP8L', width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') {
    // Flags (1), reserved (3), then 24-bit canvas width - 1 and height - 1.
    if (size < 10) return null;
    return { format: 'VP8X', width: u24(bytes, data + 4) + 1, height: u24(bytes, data + 7) + 1 };
  }
  return null;
}
