import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isOutsideUk, slugify, venueCreateSchema, venueInputSchema } from './venue-schema';

const valid = { name: 'Chip Shop', slug: 'chip-shop', tier: 'approved', cost: '££' };

describe('venueInputSchema', () => {
  it('accepts a minimal venue and applies defaults', () => {
    const result = venueInputSchema.parse(valid);
    assert.equal(result.address, null);
    assert.equal(result.latitude, null);
  });

  it('turns blank optional strings into null and trims text', () => {
    const result = venueInputSchema.parse({ ...valid, name: '  Chip Shop ', pullQuote: '   ', lunchSpecial: ' Chips ' });
    assert.equal(result.name, 'Chip Shop');
    assert.equal(result.pullQuote, null);
    assert.equal(result.lunchSpecial, 'Chips');
  });

  it('only accepts cuisines from the fixed list, defaulting to Other', () => {
    assert.equal(venueInputSchema.parse(valid).cuisine, 'other');
    assert.equal(venueInputSchema.parse({ ...valid, cuisine: 'fish_and_chips' }).cuisine, 'fish_and_chips');
    assert.equal(venueInputSchema.safeParse({ ...valid, cuisine: 'British' }).success, false);
    assert.equal(venueInputSchema.safeParse({ ...valid, cuisine: 'Fish & Chips' }).success, false);
    assert.equal(venueInputSchema.safeParse({ ...valid, cuisine: '' }).success, false);
  });

  it('coerces numeric strings from form fields', () => {
    const result = venueInputSchema.parse({ ...valid, latitude: '53.48', longitude: '-2.25' });
    assert.equal(result.latitude, 53.48);
    assert.equal(result.longitude, -2.25);
  });

  it('never takes the tier: it only changes through an approved proposal', () => {
    assert.ok(!('tier' in venueInputSchema.parse({ ...valid, tier: 'rejected' })));
  });

  it('takes an optional proposed tier for a new venue, but never straight into Approved', () => {
    assert.equal(venueCreateSchema.parse(valid).proposedTier, null);
    assert.equal(venueCreateSchema.parse({ ...valid, proposedTier: '' }).proposedTier, null);
    assert.equal(venueCreateSchema.parse({ ...valid, proposedTier: 'rejected' }).proposedTier, 'rejected');
    assert.equal(venueCreateSchema.safeParse({ ...valid, proposedTier: 'great' }).success, false);
    const approved = venueCreateSchema.safeParse({ ...valid, proposedTier: 'approved' });
    assert.equal(approved.success, false);
    assert.deepEqual(approved.error?.issues[0].path, ['proposedTier']);
    assert.equal(venueCreateSchema.safeParse({ ...valid, latitude: 40.7, longitude: -74 }).success, false);
  });

  it('drops removed fields instead of storing them', () => {
    const result = venueInputSchema.parse({ ...valid, rank: 4, sortOrder: 7, summary: 'x', verdict: 'y', rejectionReason: 'z', published: true });
    for (const field of ['rank', 'sortOrder', 'summary', 'verdict', 'rejectionReason', 'published']) {
      assert.ok(!(field in result), field);
    }
  });

  it('rejects invalid slugs and cost bands', () => {
    assert.equal(venueInputSchema.safeParse({ ...valid, slug: 'Chip Shop' }).success, false);
    assert.equal(venueInputSchema.safeParse({ ...valid, slug: 'a--b' }).success, false);
    assert.equal(venueInputSchema.safeParse({ ...valid, cost: '$' }).success, false);
  });

  it('rejects out-of-range and non-numeric coordinates', () => {
    for (const [field, limit] of [['latitude', 90], ['longitude', 180]] as const) {
      assert.equal(venueInputSchema.safeParse({ ...valid, latitude: 53.48, longitude: -2.25, [field]: limit + 0.1 }).success, false);
      assert.equal(venueInputSchema.safeParse({ ...valid, latitude: 53.48, longitude: -2.25, [field]: -limit - 0.1 }).success, false);
    }
    assert.equal(venueInputSchema.safeParse({ ...valid, latitude: 'abc', longitude: -2.25 }).success, false);
  });

  it('only accepts coordinates inside the UK, given as a pair', () => {
    assert.equal(venueInputSchema.safeParse({ ...valid, latitude: 53.48, longitude: -2.25 }).success, true);
    const outside = venueInputSchema.safeParse({ ...valid, latitude: 40.7, longitude: -74 });
    assert.equal(outside.success, false);
    assert.deepEqual(outside.error?.issues[0].path, ['latitude']);
    const half = venueInputSchema.safeParse({ ...valid, latitude: 53.48 });
    assert.equal(half.success, false);
    assert.deepEqual(half.error?.issues[0].path, ['longitude']);
  });

  it('never accepts distance or walking time from the client', () => {
    const result = venueInputSchema.parse({ ...valid, distanceMiles: 2, walkingTimeMin: 5 });
    assert.ok(!('distanceMiles' in result));
    assert.ok(!('walkingTimeMin' in result));
  });

  it('only allows http(s) links', () => {
    assert.equal(venueInputSchema.safeParse({ ...valid, websiteUrl: 'https://example.com' }).success, true);
    assert.equal(venueInputSchema.safeParse({ ...valid, websiteUrl: 'javascript:alert(1)' }).success, false);
    assert.equal(venueInputSchema.safeParse({ ...valid, imageUrl: 'ftp://example.com/a.png' }).success, false);
    assert.equal(venueInputSchema.parse({ ...valid, mapSearchLink: '' }).mapSearchLink, null);
  });

  it('never accepts a hand-edited inspection date', () => {
    assert.ok(!('lastInspectionDate' in venueInputSchema.parse({ ...valid, lastInspectionDate: '2026-09-01' })));
  });

  it('enforces text length limits', () => {
    assert.equal(venueInputSchema.safeParse({ ...valid, pullQuote: 'x'.repeat(401) }).success, false);
    assert.equal(venueInputSchema.safeParse({ ...valid, name: 'x' }).success, false);
  });
});

describe('isOutsideUk', () => {
  it('is false for Manchester and for missing coordinates', () => {
    assert.equal(isOutsideUk(53.48, -2.25), false);
    assert.equal(isOutsideUk(null, -2.25), false);
    assert.equal(isOutsideUk(53.48, null), false);
  });

  it('is true outside the bounding box', () => {
    assert.equal(isOutsideUk(40.7, -74), true);
    assert.equal(isOutsideUk(49, -2), true);
    assert.equal(isOutsideUk(61, -2), true);
    assert.equal(isOutsideUk(53, 2), true);
    assert.equal(isOutsideUk(53, -9), true);
  });
});

describe('slugify', () => {
  it('lowercases, strips accents and apostrophes, and hyphenates', () => {
    assert.equal(slugify("Wright’s Fish & Chips"), 'wrights-fish-chips');
    assert.equal(slugify('Café Müller'), 'cafe-muller');
    assert.equal(slugify('  --Hello   World--  '), 'hello-world');
  });

  it('caps the length without leaving a trailing hyphen', () => {
    const slug = slugify(`${'a'.repeat(119)} b`);
    assert.equal(slug, 'a'.repeat(119));
    assert.ok(slugify('word '.repeat(60)).length <= 120);
  });
});
