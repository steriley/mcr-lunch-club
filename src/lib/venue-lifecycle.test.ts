import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isValidFocal, normaliseCaption } from './venue-lifecycle';

describe('normaliseCaption', () => {
  it('trims, and stores a blank caption as null', () => {
    assert.deepEqual(normaliseCaption('  Pizza, top down  '), {
      ok: true,
      value: 'Pizza, top down',
    });
    assert.deepEqual(normaliseCaption('   '), { ok: true, value: null });
    assert.deepEqual(normaliseCaption(null), { ok: true, value: null });
    assert.deepEqual(normaliseCaption(undefined), { ok: true, value: null });
  });

  it('allows 200 characters and refuses 201', () => {
    assert.deepEqual(normaliseCaption('a'.repeat(200)), { ok: true, value: 'a'.repeat(200) });
    assert.deepEqual(normaliseCaption('a'.repeat(201)), { ok: false, error: 'caption_too_long' });
  });
});

describe('isValidFocal', () => {
  it('accepts both null, or both whole numbers from 0 to 100', () => {
    assert.equal(isValidFocal({ focalX: null, focalY: null }), true);
    assert.equal(isValidFocal({ focalX: 0, focalY: 100 }), true);
    assert.equal(isValidFocal({ focalX: 37, focalY: 62 }), true);
  });

  it('refuses one null, out-of-range and fractional values', () => {
    assert.equal(isValidFocal({ focalX: 50, focalY: null }), false);
    assert.equal(isValidFocal({ focalX: null, focalY: 50 }), false);
    assert.equal(isValidFocal({ focalX: -1, focalY: 50 }), false);
    assert.equal(isValidFocal({ focalX: 50, focalY: 101 }), false);
    assert.equal(isValidFocal({ focalX: 12.5, focalY: 50 }), false);
    assert.equal(isValidFocal({ focalX: Number.NaN, focalY: 50 }), false);
  });
});
