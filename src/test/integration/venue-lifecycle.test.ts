import '../setup-env';
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { tierProposals, venueEvents, venueImages, venueRevisions, venues } from '@/db/schema';
import { OrsError } from '@/lib/ors';
import { venueLifecycle } from '@/lib/venue-lifecycle';
import { venueInputSchema, type VenueInput } from '@/lib/venue-schema';
import { JPEG, VP8, VP8X, webpWithSize } from '../webp-samples';
import { memoryPhotoStore, type MemoryPhotoStore } from '../memory-photo-store';
import {
  closeTestDb,
  createAdmin,
  createVenue,
  resetTestDb,
  skipIntegration,
  testDb,
  type TestAdmin,
} from './db';

const asBlob = (bytes: Uint8Array | null) => (bytes ? new Blob([bytes.slice()]) : null);

const lookup = async () => ({ distanceMetres: 480, durationSeconds: 400 });

const input = (overrides: Record<string, unknown> = {}): VenueInput =>
  venueInputSchema.parse({
    name: 'Pasty Palace',
    slug: 'pasty-palace',
    cost: '£',
    latitude: 53.477,
    longitude: -2.247,
    ...overrides,
  });

describe('the venue lifecycle (database)', { skip: skipIntegration }, () => {
  let sam: TestAdmin;
  let alex: TestAdmin;
  let photos: MemoryPhotoStore;

  beforeEach(async () => {
    await resetTestDb();
    sam = await createAdmin('sam', 'Sam');
    alex = await createAdmin('alex', 'Alex');
    photos = memoryPhotoStore();
  });

  after(closeTestDb);

  describe('createVenue', () => {
    it('creates a hidden venue with its revision, and publishes nothing', async () => {
      const db = await testDb();
      const created = await venueLifecycle.createVenue(
        db,
        input(),
        { proposedTier: null },
        sam,
        lookup
      );
      assert.ok(created.ok);
      assert.equal(created.published, undefined, 'the venue stays hidden until a tier is approved');
      const { venue, proposal, route } = created.value;
      assert.equal(venue.tier, null);
      assert.equal(venue.updatedBy, 'sam');
      assert.equal(proposal, null);
      assert.equal(route.walkingTimeMin, venue.walkingTimeMin);
      const revisions = await db
        .select()
        .from(venueRevisions)
        .where(eq(venueRevisions.venueId, venue.id));
      assert.equal(revisions.length, 1);
    });

    it('turns the chosen tier into a pending proposal by the creator', async () => {
      const db = await testDb();
      const created = await venueLifecycle.createVenue(
        db,
        input(),
        { proposedTier: 'to_be_assessed' },
        sam,
        lookup
      );
      assert.ok(created.ok);
      assert.deepEqual(
        {
          tier: created.value.proposal?.proposedTier,
          by: created.value.proposal?.proposedBy,
          status: created.value.proposal?.status,
        },
        { tier: 'to_be_assessed', by: 'sam', status: 'pending' }
      );
    });

    it('refuses a slug that is taken, before looking up the route', async () => {
      const db = await testDb();
      await createVenue('Pasty Palace', { slug: 'pasty-palace' });
      let looked = false;
      const outcome = await venueLifecycle.createVenue(
        db,
        input(),
        { proposedTier: null },
        sam,
        async () => {
          looked = true;
          return { distanceMetres: 1, durationSeconds: 1 };
        }
      );
      assert.deepEqual(outcome, { ok: false, error: 'slug_taken' });
      assert.equal(looked, false);
    });

    it('answers slug_taken when the unique index catches a race the pre-check missed', async () => {
      const db = await testDb();
      const [first, second] = await Promise.all([
        venueLifecycle.createVenue(db, input(), { proposedTier: null }, sam, lookup),
        venueLifecycle.createVenue(db, input(), { proposedTier: null }, alex, lookup),
      ]);
      assert.deepEqual([first.ok, second.ok].sort(), [false, true]);
      const refused = first.ok ? second : first;
      assert.deepEqual(refused.ok === false && refused.error, 'slug_taken');
      assert.equal((await db.select().from(venues)).length, 1);
    });

    it('rolls the venue back when the first verdict is refused', async () => {
      const db = await testDb();
      const outcome = await venueLifecycle.createVenue(
        db,
        input(),
        { proposedTier: 'approved' },
        sam,
        lookup
      );
      assert.deepEqual(outcome, { ok: false, error: 'needs_verified_inspection' });
      assert.equal((await db.select().from(venues)).length, 0);
      assert.equal((await db.select().from(tierProposals)).length, 0);
    });
  });

  describe('updateVenue', () => {
    it('saves the form, records a revision and publishes the venue', async () => {
      const db = await testDb();
      const id = await createVenue('Chip Shop');
      const outcome = await venueLifecycle.updateVenue(
        db,
        id,
        input({ name: 'Chippy', slug: 'chippy' }),
        sam,
        lookup
      );
      assert.ok(outcome.ok);
      assert.deepEqual(outcome.published, {
        action: 'Update venue',
        venueId: id,
        when: 'queue',
      });
      assert.equal(outcome.value.venue.name, 'Chippy');
      const revisions = await db
        .select()
        .from(venueRevisions)
        .where(eq(venueRevisions.venueId, id));
      assert.equal(revisions.length, 1);
    });

    it('returns the amendment it wrote, built by the server', async () => {
      const db = await testDb();
      const id = await createVenue('Chip Shop');
      const outcome = await venueLifecycle.updateVenue(
        db,
        id,
        input({ name: 'Chippy', slug: 'chippy' }),
        sam,
        lookup
      );
      assert.ok(outcome.ok);
      const { timelineEntry } = outcome.value;
      assert.equal(timelineEntry.kind, 'amendment');
      assert.match(timelineEntry.text, /^Earliest recorded version, by Sam$/);

      const again = await venueLifecycle.updateVenue(
        db,
        id,
        input({ name: 'Chippy Two', slug: 'chippy' }),
        sam,
        lookup
      );
      assert.ok(again.ok);
      assert.match(again.value.timelineEntry.text, /^Amended by Sam: Name$/);

      const same = await venueLifecycle.updateVenue(
        db,
        id,
        input({ name: 'Chippy Two', slug: 'chippy' }),
        sam,
        lookup
      );
      assert.ok(same.ok);
      assert.equal(same.value.timelineEntry.text, 'Saved by Sam with no field changes');
    });

    it('refuses a slug another venue has, and an unknown venue', async () => {
      const db = await testDb();
      const id = await createVenue('Chip Shop');
      await createVenue('Pasty Palace');
      assert.deepEqual(
        await venueLifecycle.updateVenue(db, id, input({ slug: 'pasty-palace' }), sam, lookup),
        { ok: false, error: 'slug_taken' }
      );
      assert.deepEqual(
        await venueLifecycle.updateVenue(
          db,
          '3f2b7a52-5c1e-4c0d-9a4f-1a2b3c4d5e6f',
          input({ slug: 'nowhere' }),
          sam,
          lookup
        ),
        { ok: false, error: 'venue_not_found' }
      );
    });

    it('may keep its own slug', async () => {
      const db = await testDb();
      const id = await createVenue('Chip Shop');
      const outcome = await venueLifecycle.updateVenue(
        db,
        id,
        input({ slug: 'chip-shop' }),
        sam,
        lookup
      );
      assert.ok(outcome.ok);
    });
  });

  describe('updateVenue and the walking route', () => {
    const located = (overrides: Record<string, unknown> = {}) =>
      input({
        name: 'Chip Shop',
        slug: 'chip-shop',
        latitude: 53.481,
        longitude: -2.249,
        ...overrides,
      });
    const stored = async (id: string) => {
      const [row] = await (await testDb()).select().from(venues).where(eq(venues.id, id));
      return row;
    };

    it('computes distance and walking time when the coordinates change', async () => {
      const db = await testDb();
      const id = await createVenue('Chip Shop');
      let looked = 0;
      const outcome = await venueLifecycle.updateVenue(db, id, located(), sam, async () => {
        looked += 1;
        return { distanceMetres: 1609.344, durationSeconds: 1170 };
      });
      assert.ok(outcome.ok);
      assert.equal(looked, 1);
      assert.deepEqual(
        [outcome.value.venue.distanceMiles, outcome.value.venue.walkingTimeMin],
        ['1.00', 24]
      );
    });

    it('keeps the stored route without calling the route service when the coordinates are unchanged', async () => {
      const db = await testDb();
      const id = await createVenue('Chip Shop', {
        distanceMiles: '0.40',
        walkingTimeMin: 9,
        routeUpdatedAt: new Date('2026-10-01T00:00:00Z'),
      });
      const outcome = await venueLifecycle.updateVenue(
        db,
        id,
        located({ latitude: 53.48, longitude: -2.25 }),
        sam,
        async () => assert.fail('should not look up the route')
      );
      assert.ok(outcome.ok);
      const row = await stored(id);
      assert.deepEqual([row.distanceMiles, row.walkingTimeMin], ['0.40', 9]);
    });

    it('still saves, with the route pending, when the route service fails', async () => {
      const db = await testDb();
      const id = await createVenue('Chip Shop');
      const outcome = await venueLifecycle.updateVenue(db, id, located(), sam, async () => {
        throw new OrsError('rate_limited', 'slow down');
      });
      assert.ok(outcome.ok);
      assert.equal(outcome.value.route.error?.kind, 'rate_limited');
      const row = await stored(id);
      assert.deepEqual(
        [row.distanceMiles, row.walkingTimeMin, row.latitude],
        [null, null, '53.481000']
      );
    });

    it('never takes distance or walking time from the form', async () => {
      const db = await testDb();
      const id = await createVenue('Nowhere', { latitude: null, longitude: null });
      const outcome = await venueLifecycle.updateVenue(
        db,
        id,
        input({
          slug: 'nowhere',
          latitude: null,
          longitude: null,
          distanceMiles: 3,
          walkingTimeMin: 4,
        }),
        sam,
        lookup
      );
      assert.ok(outcome.ok);
      assert.deepEqual(
        [outcome.value.venue.distanceMiles, outcome.value.venue.walkingTimeMin],
        [null, null]
      );
    });
  });

  describe('rerouteVenue', () => {
    it('stores the new route and publishes the venue', async () => {
      const db = await testDb();
      const id = await createVenue('Chip Shop');
      const outcome = await venueLifecycle.rerouteVenue(db, id, sam, lookup);
      assert.ok(outcome.ok);
      assert.equal(outcome.published?.action, 'Recompute venue route');
      assert.equal(outcome.value.walkingTimeMin, 7);
      assert.ok(outcome.value.routeUpdatedAt);
    });

    it('leaves the venue alone when the route service fails, saying why', async () => {
      const db = await testDb();
      const id = await createVenue('Chip Shop');
      const limited = await venueLifecycle.rerouteVenue(db, id, sam, async () => {
        throw new OrsError('rate_limited', 'slow down');
      });
      assert.ok(!limited.ok);
      assert.equal(limited.error, 'route_rate_limited');
      assert.match(limited.detail ?? '', /rate limited/);
      const down = await venueLifecycle.rerouteVenue(db, id, sam, async () => {
        throw new Error('down');
      });
      assert.ok(!down.ok);
      assert.equal(down.error, 'route_unavailable');
      const [stored] = await db.select().from(venues).where(eq(venues.id, id));
      assert.equal(stored.routeUpdatedAt, null);
    });

    it('needs a location, and a venue', async () => {
      const db = await testDb();
      const id = await createVenue('Nowhere', { latitude: null, longitude: null });
      assert.deepEqual(await venueLifecycle.rerouteVenue(db, id, sam, lookup), {
        ok: false,
        error: 'needs_location',
      });
      assert.deepEqual(
        await venueLifecycle.rerouteVenue(db, '3f2b7a52-5c1e-4c0d-9a4f-1a2b3c4d5e6f', sam, lookup),
        { ok: false, error: 'venue_not_found' }
      );
    });
  });

  describe('closeVenue and reopenVenue', () => {
    it('closes without touching the tier, logs who did it, and publishes now', async () => {
      const db = await testDb();
      const id = await createVenue('Chip Shop', { tier: 'if_we_must' });
      const closed = await venueLifecycle.closeVenue(db, id, sam);
      assert.ok(closed.ok);
      assert.deepEqual(closed.published, { action: 'Close venue', venueId: id, when: 'now' });
      assert.equal(closed.value.tier, 'if_we_must');
      assert.equal(closed.value.closedBy, 'sam');
      assert.ok(closed.value.closedAt);
      const events = await db.select().from(venueEvents).where(eq(venueEvents.venueId, id));
      assert.deepEqual(
        events.map((event) => [event.kind, event.actorId]),
        [['closed', 'sam']]
      );
    });

    it('logs the Chair’s email when they have no display name', async () => {
      const db = await testDb();
      const id = await createVenue('Chip Shop');
      await venueLifecycle.closeVenue(db, id, { ...sam, name: '' });
      const [event] = await db.select().from(venueEvents).where(eq(venueEvents.venueId, id));
      assert.equal(event.actorName, sam.email);
    });

    it('reopens, clearing who closed it', async () => {
      const db = await testDb();
      const id = await createVenue('Chip Shop');
      await venueLifecycle.closeVenue(db, id, sam);
      const reopened = await venueLifecycle.reopenVenue(db, id, alex);
      assert.ok(reopened.ok);
      assert.equal(reopened.published?.action, 'Reopen venue');
      assert.equal(reopened.value.closedAt, null);
      assert.equal(reopened.value.closedBy, null);
      const events = await db.select().from(venueEvents).where(eq(venueEvents.venueId, id));
      assert.deepEqual(events.map((event) => event.kind).sort(), ['closed', 'reopened']);
    });

    it('refuses a repeat without logging it again, and an unknown venue', async () => {
      const db = await testDb();
      const id = await createVenue('Chip Shop');
      assert.deepEqual(await venueLifecycle.reopenVenue(db, id, sam), {
        ok: false,
        error: 'not_closed',
      });
      await venueLifecycle.closeVenue(db, id, sam);
      assert.deepEqual(await venueLifecycle.closeVenue(db, id, alex), {
        ok: false,
        error: 'already_closed',
      });
      assert.deepEqual(
        await venueLifecycle.closeVenue(db, '3f2b7a52-5c1e-4c0d-9a4f-1a2b3c4d5e6f', sam),
        { ok: false, error: 'venue_not_found' }
      );
      assert.equal(
        (await db.select().from(venueEvents).where(eq(venueEvents.venueId, id))).length,
        1
      );
    });
  });

  describe('photos', () => {
    let globalDb: Awaited<ReturnType<typeof testDb>>;
    const upload = (venueId: string, overrides: Record<string, unknown> = {}) =>
      venueLifecycle.addPhoto(
        globalDb,
        photos,
        venueId,
        {
          full: asBlob(VP8X),
          thumb: asBlob(VP8),
          width: 29,
          height: 43,
          caption: null,
          ...overrides,
          ...('full' in overrides ? { full: asBlob(overrides.full as Uint8Array | null) } : {}),
          ...('thumb' in overrides ? { thumb: asBlob(overrides.thumb as Uint8Array | null) } : {}),
        },
        sam
      );
    beforeEach(async () => {
      globalDb = await testDb();
    });

    it('stores both files, inserts the row, logs it and publishes the venue', async () => {
      const venueId = await createVenue();
      const added = await upload(venueId, { caption: '  The counter  ' });
      assert.ok(added.ok);
      assert.deepEqual(added.published, {
        action: 'Add venue image',
        venueId,
        when: 'queue',
      });
      assert.equal(added.value.caption, 'The counter');
      assert.equal(added.value.isPrimary, true);
      assert.deepEqual(
        [...photos.files.keys()].sort(),
        [added.value.fullUrl, added.value.thumbUrl].sort()
      );
      assert.match(
        added.value.fullUrl,
        new RegExp(`/venues/${venueId}/${added.value.id}-full\\.webp$`)
      );
      const events = await globalDb
        .select()
        .from(venueEvents)
        .where(eq(venueEvents.venueId, venueId));
      assert.deepEqual(
        events.map((event) => event.kind),
        ['image_added']
      );
    });

    it('accepts images exactly at the size limits', async () => {
      const venueId = await createVenue();
      const added = await upload(venueId, {
        full: webpWithSize(1600, 1200),
        thumb: webpWithSize(640, 480),
        width: 1600,
        height: 1200,
      });
      assert.ok(added.ok);
    });

    it('refuses files that are not really WebP, too big, or the wrong size, storing nothing', async () => {
      const venueId = await createVenue();
      const padded = (bytes: number) => {
        const out = new Uint8Array(bytes);
        out.set(VP8X);
        return out;
      };
      const detail = async (overrides: Record<string, unknown>) => {
        const refused = await upload(venueId, overrides);
        assert.ok(!refused.ok);
        assert.equal(refused.error, 'invalid_photo');
        return refused.detail ?? '';
      };
      assert.match(await detail({ full: JPEG }), /not a valid WebP/);
      assert.match(await detail({ thumb: JPEG }), /thumbnail image is not a valid WebP/);
      assert.match(await detail({ full: VP8X.subarray(0, 30) }), /not a valid WebP/);
      assert.match(await detail({ full: null }), /full-size image is missing/);
      assert.match(await detail({ thumb: null }), /thumbnail image is missing/);
      assert.match(await detail({ full: padded(800 * 1024 + 1) }), /the limit is 800 KB/);
      assert.match(await detail({ thumb: padded(150 * 1024 + 1) }), /the limit is 150 KB/);
      assert.match(
        await detail({ full: webpWithSize(1601, 900), width: 1601, height: 900 }),
        /1601×900; its longest edge must be 1600px/
      );
      assert.match(
        await detail({ thumb: webpWithSize(300, 641) }),
        /641; its longest edge must be 640px/
      );
      assert.match(await detail({ width: 30 }), /do not match/);
      assert.match(await detail({ height: null }), /do not match/);
      assert.equal(photos.files.size, 0);
    });

    it('refuses an oversized file from its size alone, without reading it', async () => {
      const venueId = await createVenue();
      const huge = new Blob([new Uint8Array(1)]);
      Object.defineProperty(huge, 'size', { value: 800 * 1024 + 1 });
      huge.arrayBuffer = async () => assert.fail('an oversized upload must not be buffered');
      const refused = await venueLifecycle.addPhoto(
        globalDb,
        photos,
        venueId,
        { full: huge, thumb: asBlob(VP8), width: 29, height: 43, caption: null },
        sam
      );
      assert.ok(!refused.ok && refused.error === 'invalid_photo');
      assert.match(refused.detail ?? '', /the limit is 800 KB/);
    });

    it('refuses a caption over 200 characters, storing nothing', async () => {
      const venueId = await createVenue();
      assert.deepEqual(await upload(venueId, { caption: 'x'.repeat(201) }), {
        ok: false,
        error: 'caption_too_long',
      });
      assert.equal(photos.files.size, 0);
    });

    it('refuses an unknown venue without storing anything', async () => {
      assert.deepEqual(await upload('3f2b7a52-5c1e-4c0d-9a4f-1a2b3c4d5e6f'), {
        ok: false,
        error: 'venue_not_found',
      });
      assert.equal(photos.files.size, 0);
    });

    it('refuses a sixth photo without storing anything', async () => {
      const venueId = await createVenue();
      for (let i = 0; i < 5; i += 1) assert.ok((await upload(venueId)).ok);
      const filesBefore = photos.files.size;
      assert.deepEqual(await upload(venueId), { ok: false, error: 'too_many_images' });
      assert.equal(photos.files.size, filesBefore);
      assert.equal((await globalDb.select().from(venueImages)).length, 5);
    });

    it('holds the cap when uploads race, deleting the files of the loser', async () => {
      const venueId = await createVenue();
      for (let i = 0; i < 4; i += 1) assert.ok((await upload(venueId)).ok);
      const results = await Promise.all([upload(venueId), upload(venueId)]);
      assert.deepEqual(results.map((result) => result.ok).sort(), [false, true]);
      assert.equal((await globalDb.select().from(venueImages)).length, 5);
      assert.equal(photos.files.size, 10, 'five photos, two files each');
    });

    it('deletes the first file when the second write fails, and rethrows', async () => {
      const venueId = await createVenue();
      photos.failPut(2);
      await assert.rejects(upload(venueId), /Simulated upload failure/);
      assert.equal(photos.files.size, 0);
      assert.equal((await globalDb.select().from(venueImages)).length, 0);
    });

    it('deletes both files when the row cannot be inserted', async () => {
      const venueId = await createVenue();
      // The venue goes between the early check and the insert.
      const racing = {
        ...photos,
        put: async (key: string, bytes: Uint8Array) => {
          const url = await photos.put(key, bytes);
          if (key.endsWith('-thumb.webp'))
            await globalDb.delete(venues).where(eq(venues.id, venueId));
          return url;
        },
      };
      const outcome = await venueLifecycle.addPhoto(
        globalDb,
        racing,
        venueId,
        { full: asBlob(VP8X), thumb: asBlob(VP8), width: 29, height: 43, caption: null },
        sam
      );
      assert.deepEqual(outcome, { ok: false, error: 'venue_not_found' });
      assert.equal(photos.files.size, 0);
    });

    it('updates the caption and focal point, validating both once', async () => {
      const venueId = await createVenue();
      const added = await upload(venueId);
      assert.ok(added.ok);
      const imageId = added.value.id;
      const update = (changes: Parameters<typeof venueLifecycle.updatePhoto>[3]) =>
        venueLifecycle.updatePhoto(globalDb, venueId, imageId, changes, sam);

      const edited = await update({ caption: '  Top-down pizza ', focalX: 30, focalY: 70 });
      assert.ok(edited.ok);
      assert.equal(edited.published?.action, 'Update venue image');
      assert.deepEqual(
        [edited.value.caption, edited.value.focalX, edited.value.focalY],
        ['Top-down pizza', 30, 70]
      );
      const cleared = await update({ caption: '' });
      assert.ok(cleared.ok && cleared.value.caption === null);
      const reset = await update({ focalX: null, focalY: null });
      assert.ok(reset.ok && reset.value.focalX === null && reset.value.focalY === null);

      assert.deepEqual(await update({ caption: 'x'.repeat(201) }), {
        ok: false,
        error: 'caption_too_long',
      });
      for (const focal of [
        { focalX: 101, focalY: 5 },
        { focalX: 5, focalY: null },
        { focalX: 12.5, focalY: 5 },
        { focalX: 5 },
      ]) {
        assert.deepEqual(
          await update(focal),
          { ok: false, error: 'invalid_focal' },
          JSON.stringify(focal)
        );
      }
      const otherVenue = await createVenue('Pie Shop');
      assert.deepEqual(
        await venueLifecycle.updatePhoto(globalDb, otherVenue, imageId, { caption: 'Hijack' }, sam),
        { ok: false, error: 'image_not_found' }
      );
    });

    it('makes a photo primary, and removes one with its files, promoting the oldest', async () => {
      const venueId = await createVenue();
      const first = await upload(venueId);
      const second = await upload(venueId);
      assert.ok(first.ok && second.ok);

      const primary = await venueLifecycle.updatePhoto(
        globalDb,
        venueId,
        second.value.id,
        { isPrimary: true },
        sam
      );
      assert.ok(primary.ok && primary.value.isPrimary);

      const removed = await venueLifecycle.removePhoto(
        globalDb,
        photos,
        venueId,
        second.value.id,
        sam
      );
      assert.ok(removed.ok);
      assert.deepEqual(removed.published, {
        action: 'Delete venue image',
        venueId,
        when: 'queue',
      });
      assert.equal(removed.value.promoted?.id, first.value.id);
      assert.deepEqual(
        [...photos.files.keys()].sort(),
        [first.value.fullUrl, first.value.thumbUrl].sort()
      );
      assert.deepEqual(
        await venueLifecycle.removePhoto(globalDb, photos, venueId, second.value.id, sam),
        {
          ok: false,
          error: 'image_not_found',
        }
      );
    });
  });

  describe('deleteVenue', () => {
    it('removes the venue and the files of all its photos, naming it in the public change', async () => {
      const db = await testDb();
      const venueId = await createVenue("Albert's Schloss");
      const kept = await createVenue('Pie Shop');
      for (const id of [venueId, venueId, kept]) {
        const added = await venueLifecycle.addPhoto(
          db,
          photos,
          id,
          { full: asBlob(VP8X), thumb: asBlob(VP8), width: 29, height: 43, caption: null },
          sam
        );
        assert.ok(added.ok);
      }
      assert.equal(photos.files.size, 6);

      const deleted = await venueLifecycle.deleteVenue(db, photos, venueId);
      assert.ok(deleted.ok);
      assert.deepEqual(deleted.published, {
        action: 'Delete venue',
        venueId,
        venueName: "Albert's Schloss",
        when: 'queue',
      });
      assert.equal((await db.select().from(venues).where(eq(venues.id, venueId))).length, 0);
      assert.equal(
        (await db.select().from(venueImages).where(eq(venueImages.venueId, venueId))).length,
        0
      );
      assert.equal(photos.files.size, 2, 'only the other venue’s photo is left');
    });

    it('answers venue_not_found and leaves the files for an unknown venue', async () => {
      const db = await testDb();
      assert.deepEqual(
        await venueLifecycle.deleteVenue(db, photos, '3f2b7a52-5c1e-4c0d-9a4f-1a2b3c4d5e6f'),
        { ok: false, error: 'venue_not_found' }
      );
    });
  });
});
