import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPTION_MAX,
  FULL_MAX_EDGE,
  FULL_QUALITIES,
  MAX_FULL_BYTES,
  MAX_IMAGES_PER_VENUE,
  MAX_THUMB_BYTES,
  THUMB_MAX_EDGE,
  THUMB_QUALITY,
  focalStyle,
} from './image-upload';

describe('venue image settings', () => {
  it('match the agreed starting values', () => {
    assert.deepEqual(
      { MAX_IMAGES_PER_VENUE, FULL_MAX_EDGE, THUMB_MAX_EDGE, FULL_QUALITIES, THUMB_QUALITY, MAX_FULL_BYTES, MAX_THUMB_BYTES, CAPTION_MAX },
      {
        MAX_IMAGES_PER_VENUE: 5,
        FULL_MAX_EDGE: 1600,
        THUMB_MAX_EDGE: 640,
        FULL_QUALITIES: [80, 65, 50],
        THUMB_QUALITY: 75,
        MAX_FULL_BYTES: 800 * 1024,
        MAX_THUMB_BYTES: 150 * 1024,
        CAPTION_MAX: 200,
      }
    );
    assert.ok(THUMB_MAX_EDGE < FULL_MAX_EDGE && MAX_THUMB_BYTES < MAX_FULL_BYTES);
  });
});

describe('focalStyle', () => {
  it('centres an image with no focal point', () => {
    assert.equal(focalStyle({ focalX: null, focalY: null }), '50% 50%');
  });

  it('centres when only one coordinate is set', () => {
    assert.equal(focalStyle({ focalX: 20, focalY: null }), '50% 50%');
  });

  it('positions the crop on the focal point, including the edges', () => {
    assert.equal(focalStyle({ focalX: 25, focalY: 80 }), '25% 80%');
    assert.equal(focalStyle({ focalX: 0, focalY: 100 }), '0% 100%');
  });
});
