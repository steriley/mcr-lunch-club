import '../setup-env';
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { venueEvents, venueImages, venues } from '@/db/schema';
import { addVenueImage, deleteVenueImage, listVenueImages, setPrimary, updateImageMeta, type NewVenueImage } from '@/lib/venue-images';
import { closeTestDb, createAdmin, createVenue, resetTestDb, skipIntegration, testDb, violates, type TestAdmin } from './db';

describe('venue images (database)', { skip: skipIntegration }, () => {
  let sam: TestAdmin;
  let venueId: string;
  // Distinct, increasing timestamps so "oldest" is unambiguous.
  let clock: number;
  const tick = () => new Date((clock += 60_000));

  beforeEach(async () => {
    await resetTestDb();
    sam = await createAdmin('sam', 'Sam');
    venueId = await createVenue();
    clock = Date.parse('2026-10-22T09:00:00Z');
  });

  after(closeTestDb);

  const image = (overrides: Partial<NewVenueImage> = {}): NewVenueImage => {
    const id = randomUUID();
    return {
      id,
      venueId,
      fullUrl: `https://abc.public.blob.vercel-storage.com/dev/venues/${venueId}/${id}-full.webp`,
      thumbUrl: `https://abc.public.blob.vercel-storage.com/dev/venues/${venueId}/${id}-thumb.webp`,
      width: 1600,
      height: 1200,
      uploadedBy: sam.id,
      ...overrides,
    };
  };

  const add = async (overrides: Partial<NewVenueImage> = {}) => {
    const result = await addVenueImage(await testDb(), image(overrides), tick());
    assert.ok(result.ok, `add failed: ${!result.ok && result.error}`);
    return result.value;
  };

  const primaries = async (id = venueId) => (await listVenueImages(await testDb(), id)).filter((row) => row.isPrimary).map((row) => row.id);

  it('makes the first image primary and later ones not, keeping the pre-generated id', async () => {
    const first = await add({ caption: '  The counter  ' });
    const second = await add();
    assert.equal(first.isPrimary, true);
    assert.equal(second.isPrimary, false);
    assert.equal(first.caption, 'The counter');
    assert.equal(first.uploadedBy, 'sam');
    assert.deepEqual(
      (await listVenueImages(await testDb(), venueId)).map((row) => row.id),
      [first.id, second.id]
    );
  });

  it('refuses a sixth image', async () => {
    for (let i = 0; i < 5; i++) await add();
    const result = await addVenueImage(await testDb(), image(), tick());
    assert.deepEqual(result, { ok: false, error: 'too_many_images' });
    assert.equal((await listVenueImages(await testDb(), venueId)).length, 5);
  });

  it('holds the cap and a single primary when uploads race', async () => {
    const db = await testDb();
    const results = await Promise.all(Array.from({ length: 8 }, () => addVenueImage(db, image())));
    assert.equal(results.filter((result) => result.ok).length, 5);
    assert.ok(results.filter((result) => !result.ok).every((result) => !result.ok && result.error === 'too_many_images'));
    assert.equal((await listVenueImages(db, venueId)).length, 5);
    assert.equal((await primaries()).length, 1);
  });

  it('counts the cap per venue', async () => {
    for (let i = 0; i < 5; i++) await add();
    const otherVenue = await createVenue('Pie Shop');
    const result = await addVenueImage(await testDb(), image({ venueId: otherVenue }), tick());
    assert.ok(result.ok);
    assert.equal(result.value.isPrimary, true);
  });

  it('refuses an unknown venue and an over-long caption', async () => {
    const db = await testDb();
    assert.deepEqual(await addVenueImage(db, image({ venueId: randomUUID() })), { ok: false, error: 'venue_not_found' });
    assert.deepEqual(await addVenueImage(db, image({ caption: 'x'.repeat(201) })), { ok: false, error: 'caption_too_long' });
    assert.equal((await db.select().from(venueImages)).length, 0);
  });

  it('changes the primary, reporting the previous one, and is a no-op when already primary', async () => {
    const db = await testDb();
    const first = await add();
    const second = await add();

    const changed = await setPrimary(db, venueId, second.id);
    assert.ok(changed.ok);
    assert.deepEqual(
      { id: changed.value.image.id, isPrimary: changed.value.image.isPrimary, previous: changed.value.previousPrimaryId, changed: changed.value.changed },
      { id: second.id, isPrimary: true, previous: first.id, changed: true }
    );
    assert.deepEqual(await primaries(), [second.id]);

    const again = await setPrimary(db, venueId, second.id);
    assert.ok(again.ok);
    assert.equal(again.value.changed, false);
    assert.deepEqual(await primaries(), [second.id]);
  });

  it('will not make another venue’s image primary', async () => {
    const db = await testDb();
    const mine = await add();
    const otherVenue = await createVenue('Pie Shop');
    const theirs = await add({ venueId: otherVenue });
    assert.deepEqual(await setPrimary(db, venueId, theirs.id), { ok: false, error: 'image_not_found' });
    assert.deepEqual(await primaries(), [mine.id]);
    assert.deepEqual(await primaries(otherVenue), [theirs.id]);
  });

  it('keeps exactly one primary when two admins change it at once', async () => {
    const db = await testDb();
    await add();
    const b = await add();
    const c = await add();
    const results = await Promise.all([setPrimary(db, venueId, b.id), setPrimary(db, venueId, c.id), setPrimary(db, venueId, b.id)]);
    assert.ok(results.every((result) => result.ok));
    const now = await primaries();
    assert.equal(now.length, 1);
    assert.ok([b.id, c.id].includes(now[0]));
  });

  it('the database refuses a second primary on its own', async () => {
    const db = await testDb();
    await add();
    await assert.rejects(
      db.insert(venueImages).values({ venueId, fullUrl: 'https://example.com/x.jpg', isPrimary: true }),
      violates('venue_images_one_primary_per_venue')
    );
  });

  it('deleting the primary promotes the oldest remaining image', async () => {
    const db = await testDb();
    const first = await add();
    const second = await add();
    const third = await add();
    await setPrimary(db, venueId, third.id);

    const removed = await deleteVenueImage(db, venueId, third.id);
    assert.ok(removed.ok);
    assert.equal(removed.value.deleted.id, third.id);
    assert.equal(removed.value.promoted?.id, first.id);
    assert.deepEqual(await primaries(), [first.id]);

    const next = await deleteVenueImage(db, venueId, first.id);
    assert.ok(next.ok);
    assert.equal(next.value.promoted?.id, second.id);
    assert.deepEqual(await primaries(), [second.id]);
  });

  it('deleting a non-primary image promotes nothing, and deleting the last leaves none', async () => {
    const db = await testDb();
    const first = await add();
    const second = await add();

    const removed = await deleteVenueImage(db, venueId, second.id);
    assert.ok(removed.ok);
    assert.equal(removed.value.promoted, null);
    assert.deepEqual(await primaries(), [first.id]);

    const last = await deleteVenueImage(db, venueId, first.id);
    assert.ok(last.ok);
    assert.equal(last.value.promoted, null);
    assert.deepEqual(await listVenueImages(db, venueId), []);

    assert.deepEqual(await deleteVenueImage(db, venueId, first.id), { ok: false, error: 'image_not_found' });
  });

  it('after a delete the next upload is not primary when one remains, and is when none do', async () => {
    const db = await testDb();
    const first = await add();
    await deleteVenueImage(db, venueId, first.id);
    const fresh = await add();
    assert.equal(fresh.isPrimary, true);
    const another = await add();
    assert.equal(another.isPrimary, false);
  });

  it('updates the caption and focal point, and resets the focal point to centre', async () => {
    const db = await testDb();
    const row = await add();

    const edited = await updateImageMeta(db, venueId, row.id, { caption: '  Top-down pizza ', focal: { focalX: 30, focalY: 70 } });
    assert.ok(edited.ok);
    assert.deepEqual([edited.value.caption, edited.value.focalX, edited.value.focalY], ['Top-down pizza', 30, 70]);

    const captionOnly = await updateImageMeta(db, venueId, row.id, { caption: '' });
    assert.ok(captionOnly.ok);
    assert.deepEqual([captionOnly.value.caption, captionOnly.value.focalX, captionOnly.value.focalY], [null, 30, 70]);

    const reset = await updateImageMeta(db, venueId, row.id, { focal: { focalX: null, focalY: null } });
    assert.ok(reset.ok);
    assert.deepEqual([reset.value.focalX, reset.value.focalY], [null, null]);
  });

  it('refuses bad metadata and images from another venue', async () => {
    const db = await testDb();
    const row = await add();
    assert.deepEqual(await updateImageMeta(db, venueId, row.id, { caption: 'x'.repeat(201) }), { ok: false, error: 'caption_too_long' });
    assert.deepEqual(await updateImageMeta(db, venueId, row.id, { focal: { focalX: 101, focalY: 5 } }), { ok: false, error: 'invalid_focal' });
    assert.deepEqual(await updateImageMeta(db, venueId, row.id, { focal: { focalX: 5, focalY: null } }), { ok: false, error: 'invalid_focal' });
    const otherVenue = await createVenue('Pie Shop');
    assert.deepEqual(await updateImageMeta(db, otherVenue, row.id, { caption: 'Hijack' }), { ok: false, error: 'image_not_found' });
    const [stored] = await db.select().from(venueImages).where(eq(venueImages.id, row.id));
    assert.deepEqual([stored.caption, stored.focalX, stored.focalY], [null, null, null]);
  });

  it('the database refuses a half-set or out-of-range focal point', async () => {
    const db = await testDb();
    const row = await add();
    await assert.rejects(db.update(venueImages).set({ focalX: 50 }).where(eq(venueImages.id, row.id)), violates('venue_images_focal_range'));
    await assert.rejects(
      db.update(venueImages).set({ focalX: 50, focalY: 101 }).where(eq(venueImages.id, row.id)),
      violates('venue_images_focal_range')
    );
  });

  it('logs adds, removals and primary changes (including promotion) with the actor, but not metadata edits', async () => {
    const db = await testDb();
    const actor = { id: sam.id, name: sam.name };
    const first = await addVenueImage(db, image(), tick(), actor);
    const second = await addVenueImage(db, image(), tick(), actor);
    assert.ok(first.ok && second.ok);
    await updateImageMeta(db, venueId, first.value.id, { caption: 'Counter', focal: { focalX: 10, focalY: 10 } });
    await setPrimary(db, venueId, second.value.id, actor);
    await deleteVenueImage(db, venueId, second.value.id, actor);

    const events = await db.select().from(venueEvents).where(eq(venueEvents.venueId, venueId));
    type Line = { kind: string; actor: string | null; imageId: string; reason?: string };
    const key = (line: Line) => `${line.kind}|${line.reason ?? ''}|${line.imageId}`;
    const sorted = (lines: Line[]) => [...lines].sort((a, b) => key(a).localeCompare(key(b)));
    const actual = events.map((event) => ({
      kind: event.kind,
      actor: event.actorName,
      imageId: (event.detail as any).imageId,
      ...((event.detail as any).reason ? { reason: (event.detail as any).reason } : {}),
    }));
    assert.deepEqual(
      sorted(actual),
      sorted([
        { kind: 'image_added', actor: 'Sam', imageId: first.value.id },
        { kind: 'image_added', actor: 'Sam', imageId: second.value.id },
        { kind: 'image_primary_changed', actor: 'Sam', imageId: second.value.id },
        { kind: 'image_primary_changed', actor: 'Sam', imageId: first.value.id, reason: 'promoted_after_delete' },
        { kind: 'image_removed', actor: 'Sam', imageId: second.value.id },
      ])
    );
    assert.ok(events.every((event) => 'thumbUrl' in (event.detail as object)));
  });

  it('a failed event insert rolls back the image change', async () => {
    const db = await testDb();
    const ghost = { id: 'no-such-user', name: 'Ghost' };
    // actor_id references user(id): an unknown id fails the event insert inside the transaction.
    await assert.rejects(addVenueImage(db, image(), tick(), ghost));
    assert.deepEqual(await listVenueImages(db, venueId), []);
  });

  it('deleting a venue removes its image rows', async () => {
    const db = await testDb();
    await add();
    await add();
    await db.delete(venues).where(eq(venues.id, venueId));
    assert.equal((await db.select().from(venueImages)).length, 0);
  });
});
