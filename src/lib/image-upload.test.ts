import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IMAGE_CONTENT_TYPES, MAX_IMAGE_BYTES, imageUploadPath } from './image-upload';

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
