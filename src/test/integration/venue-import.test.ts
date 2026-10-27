import '../setup-env';
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { eq, isNotNull, sql } from 'drizzle-orm';
import { venues } from '@/db/schema';
import type { TierValue } from '@/lib/tiers';
import { importVenues, toImportableVenue, type LegacyVenue } from '@/lib/venue-import';
import { closeTestDb, resetTestDb, skipIntegration, testDb } from './db';

const legacy: LegacyVenue[] = JSON.parse(fs.readFileSync('src/data/venues.json', 'utf8'));
const items = legacy.map(toImportableVenue);

describe('venue import (database)', { skip: skipIntegration }, () => {
  beforeEach(resetTestDb);
  after(closeTestDb);

  const tierOf = async (slug: string) => (await (await testDb()).select({ tier: venues.tier }).from(venues).where(eq(venues.slug, slug)))[0].tier;

  it('inserts every venue with its tier, so none are hidden', async () => {
    const db = await testDb();
    const result = await importVenues(db, items);
    assert.equal(result.inserted, legacy.length);

    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(venues).where(isNotNull(venues.tier));
    assert.equal(count, legacy.length);
  });

  it('is idempotent', async () => {
    const db = await testDb();
    await importVenues(db, items);
    const again = await importVenues(db, items);
    assert.deepEqual(again, { inserted: 0, updated: 0, skipped: legacy.length });
  });

  it('--update rewrites details but leaves an existing tier alone; updateTiers overwrites it', async () => {
    const db = await testDb();
    await importVenues(db, items);
    const slug = items[0].input.slug;
    const fileTier = items[0].tier;
    const otherTier: TierValue = fileTier === 'approved' ? 'rejected' : 'approved';
    await db.update(venues).set({ tier: otherTier, name: 'Edited' }).where(eq(venues.slug, slug));

    await importVenues(db, items, { update: true });
    assert.equal(await tierOf(slug), otherTier);
    assert.equal((await db.select({ name: venues.name }).from(venues).where(eq(venues.slug, slug)))[0].name, items[0].input.name);

    await importVenues(db, items, { update: true, updateTiers: true });
    assert.equal(await tierOf(slug), fileTier);
  });

  it('a dry run writes nothing', async () => {
    const db = await testDb();
    const result = await importVenues(db, items, { dryRun: true });
    assert.equal(result.inserted, legacy.length);
    assert.equal((await db.select({ id: venues.id }).from(venues)).length, 0);
  });
});
