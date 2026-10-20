import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isOutsideUk, slugify, venueInputSchema } from './venue-schema';

const valid = { name: 'Chip Shop', slug: 'chip-shop', tier: 'approved', cost: '££' };

describe('venueInputSchema', () => {
  it('accepts a minimal venue and applies defaults', () => {
    const result = venueInputSchema.parse(valid);
    assert.equal(result.published, false);
    assert.equal(result.sortOrder, 0);
    assert.equal(result.address, null);
    assert.equal(result.latitude, null);
    assert.equal(result.lastInspectionDate, null);
  });

  it('turns blank optional strings into null and trims text', () => {
    const result = venueInputSchema.parse({ ...valid, name: '  Chip Shop ', summary: '   ', cuisine: ' British ' });
    assert.equal(result.name, 'Chip Shop');
    assert.equal(result.summary, null);
    assert.equal(result.cuisine, 'British');
  });

  it('coerces numeric strings from form fields', () => {
    const result = venueInputSchema.parse({ ...valid, latitude: '53.48', longitude: '-2.25', rank: '4', sortOrder: '7' });
    assert.equal(result.latitude, 53.48);
    assert.equal(result.longitude, -2.25);
    assert.equal(result.rank, 4);
    assert.equal(result.sortOrder, 7);
  });

  it('rejects invalid slugs, tiers and cost bands', () => {
    assert.equal(venueInputSchema.safeParse({ ...valid, slug: 'Chip Shop' }).success, false);
    assert.equal(venueInputSchema.safeParse({ ...valid, slug: 'a--b' }).success, false);
    assert.equal(venueInputSchema.safeParse({ ...valid, tier: 'great' }).success, false);
    assert.equal(venueInputSchema.safeParse({ ...valid, cost: '$' }).success, false);
  });

  it('rejects out-of-range coordinates and ranks', () => {
    for (const [field, limit] of [['latitude', 90], ['longitude', 180]] as const) {
      assert.equal(venueInputSchema.safeParse({ ...valid, [field]: limit }).success, true);
      assert.equal(venueInputSchema.safeParse({ ...valid, [field]: -limit }).success, true);
      assert.equal(venueInputSchema.safeParse({ ...valid, [field]: limit + 0.1 }).success, false);
      assert.equal(venueInputSchema.safeParse({ ...valid, [field]: -limit - 0.1 }).success, false);
    }
    assert.equal(venueInputSchema.safeParse({ ...valid, latitude: 'abc' }).success, false);
    assert.equal(venueInputSchema.safeParse({ ...valid, rank: 0 }).success, false);
    assert.equal(venueInputSchema.safeParse({ ...valid, rank: 1.5 }).success, false);
    assert.equal(venueInputSchema.safeParse({ ...valid, distanceMiles: -1 }).success, false);
  });

  it('only allows http(s) links', () => {
    assert.equal(venueInputSchema.safeParse({ ...valid, websiteUrl: 'https://example.com' }).success, true);
    assert.equal(venueInputSchema.safeParse({ ...valid, websiteUrl: 'javascript:alert(1)' }).success, false);
    assert.equal(venueInputSchema.safeParse({ ...valid, imageUrl: 'ftp://example.com/a.png' }).success, false);
    assert.equal(venueInputSchema.parse({ ...valid, mapSearchLink: '' }).mapSearchLink, null);
  });

  it('validates the inspection date', () => {
    assert.equal(venueInputSchema.safeParse({ ...valid, lastInspectionDate: '2026-09-01' }).success, true);
    assert.equal(venueInputSchema.safeParse({ ...valid, lastInspectionDate: '2026-13-01' }).success, false);
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
