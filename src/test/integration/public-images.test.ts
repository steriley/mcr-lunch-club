import '../setup-env';
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { goldenCut } from '@/db/schema';
import { db as appDb } from '@/lib/db';
import { getGoldenCut, getMapVenues, getPublicVenue, getPublicVenues } from '@/lib/public-data';
import { addVenueImage, setPrimary, updateImageMeta } from '@/lib/venue-images';
import { closeTestDb, createAdmin, createVenue, resetTestDb, skipIntegration, testDb } from './db';

describe('public venue photos (database)', { skip: skipIntegration }, () => {
  let approved: string;
  let pending: string;
  let bare: string;

  beforeEach(async () => {
    await resetTestDb();
    await createAdmin('sam', 'Sam');
    approved = await createVenue('Pizza Place', { tier: 'approved' });
    pending = await createVenue('Pending Cafe', { tier: null });
    bare = await createVenue('No Photo Diner', { tier: 'approved' });
  });

  after(closeTestDb);

  const photo = (venueId: string, name: string) => ({
    venueId,
    fullUrl: `https://store.public.blob.vercel-storage.com/dev/venues/${venueId}/${name}-full.webp`,
    thumbUrl: `https://store.public.blob.vercel-storage.com/dev/venues/${venueId}/${name}-thumb.webp`,
    width: 1600,
    height: 1067,
    uploadedBy: 'sam',
  });

  /** Points the public queries (which use the app's db) at the test database. */
  async function asPublic<T>(fn: () => Promise<T>): Promise<T> {
    const db = await testDb();
    const original = (appDb as any).select;
    (appDb as any).select = (...args: unknown[]) => (db as any).select(...args);
    try {
      return await fn();
    } finally {
      (appDb as any).select = original;
    }
  }

  it('shows only the primary photo, once per venue, and nothing for a venue without one', async () => {
    const db = await testDb();
    const first = await addVenueImage(
      db,
      photo(approved, 'first'),
      new Date('2026-10-22T09:00:00Z')
    );
    const second = await addVenueImage(
      db,
      photo(approved, 'second'),
      new Date('2026-10-22T09:01:00Z')
    );
    assert.ok(first.ok && second.ok);
    await setPrimary(db, approved, second.value.id);
    await updateImageMeta(db, approved, second.value.id, {
      caption: 'Top-down pizza',
      focal: { focalX: 25, focalY: 75 },
    });

    const venues = await asPublic(getPublicVenues);
    assert.deepEqual(
      venues.map((venue) => venue.name).sort(),
      ['No Photo Diner', 'Pizza Place'],
      'one row per venue'
    );
    const pizza = venues.find((venue) => venue.name === 'Pizza Place')!;
    assert.deepEqual(pizza.image, {
      url: second.value.fullUrl,
      thumbUrl: second.value.thumbUrl,
      width: 1600,
      height: 1067,
      alt: 'Top-down pizza',
      focalX: 25,
      focalY: 75,
    });
    assert.equal(venues.find((venue) => venue.name === 'No Photo Diner')!.image, null);
    assert.equal(
      (await asPublic(getMapVenues)).find((venue) => venue.name === 'Pizza Place')!.image?.url,
      second.value.fullUrl
    );
    assert.equal(
      (await asPublic(() => getPublicVenue('pizza-place')))?.image?.alt,
      'Top-down pizza'
    );
  });

  it('a venue that is not publicly visible exposes no photo', async () => {
    const db = await testDb();
    assert.ok((await addVenueImage(db, photo(pending, 'p'))).ok);
    assert.ok(!(await asPublic(getPublicVenues)).some((venue) => venue.name === 'Pending Cafe'));
    assert.ok(!(await asPublic(getMapVenues)).some((venue) => venue.name === 'Pending Cafe'));
    assert.equal(await asPublic(() => getPublicVenue('pending-cafe')), null);
  });

  it('The Golden Cut carries the full image, and the alt text falls back to the venue name', async () => {
    const db = await testDb();
    const added = await addVenueImage(db, photo(approved, 'g'));
    assert.ok(added.ok);
    await db.insert(goldenCut).values([
      { venueId: approved, position: 1 },
      { venueId: bare, position: 2 },
    ]);
    const cut = await asPublic(getGoldenCut);
    assert.deepEqual(
      cut.map(({ venue }) => [venue.name, venue.image?.url ?? null, venue.image?.alt ?? null]),
      [
        ['Pizza Place', added.value.fullUrl, 'Pizza Place'],
        ['No Photo Diner', null, null],
      ]
    );
  });
});
