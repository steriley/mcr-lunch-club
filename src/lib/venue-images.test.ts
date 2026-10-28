import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isOwnedBlobUrl, isValidFocal, normaliseCaption, readWebpInfo } from './venue-images';
import { JPEG, PNG, VP8, VP8L, VP8X } from '../test/webp-samples';

describe('readWebpInfo', () => {
  it('reads the size of a lossy (VP8) WebP', () => {
    assert.deepEqual(readWebpInfo(VP8), { format: 'VP8', width: 37, height: 21 });
  });

  it('reads the size of a lossless (VP8L) WebP', () => {
    assert.deepEqual(readWebpInfo(VP8L), { format: 'VP8L', width: 37, height: 21 });
  });

  it('reads the canvas size of an extended (VP8X) WebP', () => {
    assert.deepEqual(readWebpInfo(VP8X), { format: 'VP8X', width: 29, height: 43 });
  });

  it('rejects JPEG and PNG files', () => {
    assert.equal(readWebpInfo(JPEG), null);
    assert.equal(readWebpInfo(PNG), null);
  });

  it('rejects empty and truncated files', () => {
    assert.equal(readWebpInfo(new Uint8Array()), null);
    assert.equal(readWebpInfo(VP8.subarray(0, 12)), null);
    for (const file of [VP8, VP8L, VP8X]) {
      assert.equal(
        readWebpInfo(file.subarray(0, file.length - 1)),
        null,
        'one byte short of the RIFF size'
      );
      assert.equal(readWebpInfo(file.subarray(0, 24)), null, 'cut inside the first chunk');
    }
  });

  it('rejects a RIFF file that is not WebP, and an unknown first chunk', () => {
    const wave = VP8.slice();
    wave.set(new TextEncoder().encode('WAVE'), 8);
    assert.equal(readWebpInfo(wave), null);

    const unknown = VP8.slice();
    unknown.set(new TextEncoder().encode('ALPH'), 12);
    assert.equal(readWebpInfo(unknown), null);
  });

  it('rejects a lossy WebP without the VP8 start code or with a zero size', () => {
    const badStartCode = VP8.slice();
    badStartCode[20 + 3] = 0;
    assert.equal(readWebpInfo(badStartCode), null);

    const zeroWidth = VP8.slice();
    zeroWidth[20 + 6] = 0;
    zeroWidth[20 + 7] = 0;
    assert.equal(readWebpInfo(zeroWidth), null);
  });

  it('rejects a lossless WebP without its signature byte', () => {
    const bad = VP8L.slice();
    bad[20] = 0;
    assert.equal(readWebpInfo(bad), null);
  });

  it('reports large dimensions so oversize images can be refused', () => {
    // 1601 x 900 written into the VP8X canvas fields (stored as size - 1).
    const big = VP8X.slice();
    big.set([0x40, 0x06, 0x00], 20 + 4);
    big.set([0x83, 0x03, 0x00], 20 + 7);
    assert.deepEqual(readWebpInfo(big), { format: 'VP8X', width: 1601, height: 900 });
  });
});

describe('isOwnedBlobUrl', () => {
  it('accepts our public Vercel Blob URLs', () => {
    assert.equal(
      isOwnedBlobUrl('https://abc123.public.blob.vercel-storage.com/dev/venues/v/i-full.webp'),
      true
    );
    assert.equal(
      isOwnedBlobUrl('https://ABC123.Public.Blob.Vercel-Storage.com/venues/old.jpg'),
      true
    );
  });

  it('rejects external links and look-alike hosts', () => {
    for (const url of [
      'https://example.com/photo.jpg',
      'https://images.unsplash.com/photo-1?w=800',
      'https://public.blob.vercel-storage.com/x.webp',
      'https://abc.public.blob.vercel-storage.com.evil.com/x.webp',
      'https://evil.com/abc.public.blob.vercel-storage.com/x.webp',
      'https://evil.com/?u=abc.public.blob.vercel-storage.com',
      'http://abc.public.blob.vercel-storage.com/x.webp',
    ]) {
      assert.equal(isOwnedBlobUrl(url), false, url);
    }
  });

  it('rejects empty and unparseable values', () => {
    assert.equal(isOwnedBlobUrl(null), false);
    assert.equal(isOwnedBlobUrl(undefined), false);
    assert.equal(isOwnedBlobUrl(''), false);
    assert.equal(isOwnedBlobUrl('not a url'), false);
  });
});

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
