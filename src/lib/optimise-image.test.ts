import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OptimiseError, fitWithin, optimiseImage } from './optimise-image';

describe('fitWithin', () => {
  it('scales the longest edge down to the limit, keeping the aspect ratio', () => {
    assert.deepEqual(fitWithin(4032, 3024, 1600), { width: 1600, height: 1200 });
    assert.deepEqual(fitWithin(3024, 4032, 1600), { width: 1200, height: 1600 });
    assert.deepEqual(fitWithin(4032, 3024, 640), { width: 640, height: 480 });
  });

  it('never scales up a small photo', () => {
    assert.deepEqual(fitWithin(800, 600, 1600), { width: 800, height: 600 });
    assert.deepEqual(fitWithin(1600, 900, 1600), { width: 1600, height: 900 });
  });

  it('keeps very thin images at least one pixel', () => {
    assert.deepEqual(fitWithin(10000, 2, 1600), { width: 1600, height: 1 });
  });
});

describe('optimiseImage errors', () => {
  const original = (globalThis as any).createImageBitmap;
  afterEach(() => {
    (globalThis as any).createImageBitmap = original;
  });

  it('reports an image the browser cannot decode (e.g. HEIC on desktop Chrome) as unsupported_format', async () => {
    (globalThis as any).createImageBitmap = async () => {
      throw new DOMException('The source image could not be decoded.', 'InvalidStateError');
    };
    await assert.rejects(optimiseImage(new Blob(['not an image'])), (error) => {
      assert.ok(error instanceof OptimiseError);
      assert.equal(error.reason, 'unsupported_format');
      return true;
    });
  });

  it('reports a drawing or encoding failure as encoder_failed and still releases the bitmap', async () => {
    let closed = false;
    (globalThis as any).createImageBitmap = async () => ({
      width: 4032,
      height: 3024,
      close: () => (closed = true),
    });
    // Node has no canvas, so drawing fails after the bitmap was decoded.
    await assert.rejects(optimiseImage(new Blob(['x'])), (error) => {
      assert.ok(error instanceof OptimiseError);
      assert.equal(error.reason, 'encoder_failed');
      return true;
    });
    assert.equal(closed, true);
  });
});
