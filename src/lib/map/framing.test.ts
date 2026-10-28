import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { anyOutsideView, frameFor, type Frame, type FrameOptions, type LatLng } from './framing';

const BASE: LatLng = { lat: 53.479, lng: -2.252 };

const phone: FrameOptions = {
  width: 390,
  height: 520,
  padding: { top: 72, right: 48, bottom: 48, left: 48 },
  minZoom: 12,
  maxZoom: 16,
};
const desktop: FrameOptions = {
  width: 900,
  height: 700,
  padding: { top: 72, right: 48, bottom: 48, left: 48 },
  minZoom: 12,
  maxZoom: 16,
};

const mercatorX = (lng: number) => (lng + 180) / 360;
const mercatorY = (lat: number) => {
  const sin = Math.sin((lat * Math.PI) / 180);
  return 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
};

/** Where a point lands on screen (px from the map's top left) for a given frame. */
function toScreen(point: LatLng, frame: Frame, options: FrameOptions) {
  const world = 256 * 2 ** frame.zoom;
  return {
    x: (mercatorX(point.lng) - mercatorX(frame.lng)) * world + options.width / 2,
    y: (mercatorY(point.lat) - mercatorY(frame.lat)) * world + options.height / 2,
  };
}

function assertFits(points: LatLng[], frame: Frame, options: FrameOptions) {
  const { padding } = options;
  for (const point of points) {
    const { x, y } = toScreen(point, frame, options);
    const slack = 0.5;
    assert.ok(
      x >= padding.left - slack && x <= options.width - padding.right + slack,
      `x ${x.toFixed(1)} inside the padded width`
    );
    assert.ok(
      y >= padding.top - slack && y <= options.height - padding.bottom + slack,
      `y ${y.toFixed(1)} inside the padded height`
    );
  }
}

// Venues over roughly 2 km either side of Base, like the real spread.
const spread: LatLng[] = [
  BASE,
  { lat: 53.4905, lng: -2.2185 },
  { lat: 53.4655, lng: -2.2742 },
  { lat: 53.4801, lng: -2.2915 },
  { lat: 53.4712, lng: -2.2301 },
];

describe('frameFor', () => {
  it('has no frame for no points', () => {
    assert.equal(frameFor([], desktop), null);
  });

  it('fits every point on screen, on a phone and on desktop', () => {
    for (const options of [phone, desktop]) {
      const frame = frameFor(spread, options)!;
      assertFits(spread, frame, options);
    }
  });

  it('zooms out further on a narrow phone than on desktop', () => {
    assert.ok(frameFor(spread, phone)!.zoom < frameFor(spread, desktop)!.zoom);
  });

  it('zooms in as far as it can while still fitting', () => {
    const frame = frameFor(spread, desktop)!;
    const tighter = { ...frame, zoom: frame.zoom + 1 };
    const fitsDeeper = spread.every((point) => {
      const { x, y } = toScreen(point, tighter, desktop);
      return x >= 48 && x <= 852 && y >= 72 && y <= 652;
    });
    assert.equal(fitsDeeper, false, 'one level deeper would push a venue out');
  });

  it('stops zooming in at the maximum for a handful of close venues', () => {
    const close = [BASE, { lat: BASE.lat + 0.0003, lng: BASE.lng + 0.0004 }];
    assert.equal(frameFor(close, desktop)!.zoom, 16);
  });

  it('frames a single point at the maximum zoom, centred on it', () => {
    const symmetric = { ...desktop, padding: { top: 40, right: 40, bottom: 40, left: 40 } };
    const frame = frameFor([BASE], symmetric)!;
    assert.equal(frame.zoom, 16);
    assert.ok(Math.abs(frame.lat - BASE.lat) < 1e-9 && Math.abs(frame.lng - BASE.lng) < 1e-9);
  });

  it('never zooms out past the minimum, however far apart the points are', () => {
    const far = [BASE, { lat: 51.5, lng: -0.12 }];
    assert.equal(frameFor(far, phone)!.zoom, 12);
  });

  it('centres the points in the padded area, not in the whole map', () => {
    const frame = frameFor(spread, desktop)!;
    const points = spread.map((point) => toScreen(point, frame, desktop));
    const middleY = (Math.min(...points.map((p) => p.y)) + Math.max(...points.map((p) => p.y))) / 2;
    // The padded area runs from y=72 to y=652, so its middle is y=362, below the map's middle (350).
    assert.ok(Math.abs(middleY - 362) < 1, `middle ${middleY.toFixed(1)}`);
  });
});

describe('anyOutsideView', () => {
  const view = { south: 53.47, west: -2.27, north: 53.49, east: -2.23 };

  it('is false when every point is in view, edges included', () => {
    assert.equal(anyOutsideView([BASE, { lat: 53.47, lng: -2.23 }], view), false);
  });

  it('is true when any point is off the view in any direction', () => {
    for (const point of [
      { lat: 53.46, lng: -2.25 },
      { lat: 53.5, lng: -2.25 },
      { lat: 53.48, lng: -2.3 },
      { lat: 53.48, lng: -2.2 },
    ]) {
      assert.equal(anyOutsideView([BASE, point], view), true);
    }
  });

  it('has nothing outside for no points', () => {
    assert.equal(anyOutsideView([], view), false);
  });
});
