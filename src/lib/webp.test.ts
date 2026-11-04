import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readWebpInfo } from './webp';
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
