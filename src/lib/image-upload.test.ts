import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPTION_MAX,
  FULL_MAX_EDGE,
  FULL_QUALITY,
  IMAGE_CONTENT_TYPES,
  MAX_FULL_BYTES,
  MAX_IMAGE_BYTES,
  MAX_IMAGES_PER_VENUE,
  MAX_THUMB_BYTES,
  THUMB_MAX_EDGE,
  THUMB_QUALITY,
  focalStyle,
  imageUploadPath,
} from './image-upload';

describe('imageUploadPath', () => {
  it('slugifies the base name and keeps the extension', () => {
    assert.equal(imageUploadPath('My Lunch Photo!.PNG'), 'venues/my-lunch-photo.png');
  });

  it('defaults the extension and name', () => {
    assert.equal(imageUploadPath('noextension'), 'venues/noextension.jpg');
    assert.equal(imageUploadPath('???.webp'), 'venues/image.webp');
  });

  it('truncates long names to 60 characters', () => {
    const path = imageUploadPath(`${'a'.repeat(100)}.jpg`);
    assert.equal(path, `venues/${'a'.repeat(60)}.jpg`);
  });
});

describe('image limits', () => {
  it('allows common web image types up to 4MB', () => {
    assert.ok(IMAGE_CONTENT_TYPES.includes('image/png'));
    assert.ok(!IMAGE_CONTENT_TYPES.includes('image/svg+xml'));
    assert.equal(MAX_IMAGE_BYTES, 4 * 1024 * 1024);
  });
});

describe('venue image settings', () => {
  it('match the agreed starting values', () => {
    assert.deepEqual(
      { MAX_IMAGES_PER_VENUE, FULL_MAX_EDGE, THUMB_MAX_EDGE, FULL_QUALITY, THUMB_QUALITY, MAX_FULL_BYTES, MAX_THUMB_BYTES, CAPTION_MAX },
      {
        MAX_IMAGES_PER_VENUE: 5,
        FULL_MAX_EDGE: 1600,
        THUMB_MAX_EDGE: 640,
        FULL_QUALITY: 80,
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
