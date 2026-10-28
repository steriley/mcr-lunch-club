import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  NAME_HEIGHT_PX,
  byNamePriority,
  clusterRect,
  labelWidth,
  nameLabelText,
  nameOptions,
  overlaps,
  pinRect,
  placeLabels,
  ringLabelOptions,
  type Rect,
} from './labels';
import type { Venue } from '@/types';

const rect = (x: number, y: number, width = 10, height = 10): Rect => ({ x, y, width, height });

function venue(id: string, overrides: Partial<Venue> = {}): Venue {
  return {
    id,
    name: id,
    slug: id,
    tier: 'approved',
    lat: 53.479,
    lng: -2.252,
    distanceMiles: 0.3,
    walkingTimeMin: 6,
    cost: '££',
    cuisine: 'British',
    eatLikeUs: '',
    lastInspectionDate: '2026-09-01',
    address: '',
    mapSearchLink: '',
    ...overrides,
  };
}

describe('overlaps', () => {
  it('is true when rectangles share area and false when they only touch', () => {
    assert.equal(overlaps(rect(0, 0), rect(5, 5)), true);
    assert.equal(overlaps(rect(0, 0), rect(10, 0)), false);
    assert.equal(overlaps(rect(0, 0), rect(0, 10)), false);
    assert.equal(overlaps(rect(0, 0), rect(20, 20)), false);
  });
});

describe('placeLabels', () => {
  it('takes the first option that is free', () => {
    const placed = placeLabels([{ id: 'a', options: [rect(0, 0), rect(50, 0)] }], []);
    assert.equal(placed.get('a'), 0);
  });

  it('moves on to the next option when the first hits an obstacle', () => {
    const placed = placeLabels([{ id: 'a', options: [rect(0, 0), rect(50, 0)] }], [rect(5, 5)]);
    assert.equal(placed.get('a'), 1);
  });

  it('leaves a label out when no option fits', () => {
    const placed = placeLabels([{ id: 'a', options: [rect(0, 0)] }], [rect(0, 0)]);
    assert.equal(placed.has('a'), false);
  });

  it('gives the earlier label its place and makes the later one move or go', () => {
    const placed = placeLabels(
      [
        { id: 'first', options: [rect(0, 0)] },
        { id: 'second', options: [rect(4, 0), rect(100, 0)] },
        { id: 'third', options: [rect(2, 2)] },
      ],
      []
    );
    assert.equal(placed.get('first'), 0);
    assert.equal(placed.get('second'), 1);
    assert.equal(placed.has('third'), false);
  });

  it('keeps a little room round every label, not just a clear edge', () => {
    // 1 px apart: not overlapping, but closer than the padding allows.
    const placed = placeLabels([{ id: 'a', options: [rect(0, 0)] }], [rect(11, 0)]);
    assert.equal(placed.has('a'), false);
  });

  it('never lets two placed labels overlap, however crowded', () => {
    const candidates = Array.from({ length: 60 }, (_, i) => ({
      id: String(i),
      options: nameOptions({ x: (i % 10) * 20, y: Math.floor(i / 10) * 18 }, 70),
    }));
    const placed = placeLabels(candidates, []);
    const boxes = [...placed].map(([id, index]) => candidates[Number(id)].options[index]);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) assert.equal(overlaps(boxes[i], boxes[j]), false);
    }
    assert.ok(boxes.length > 0 && boxes.length < candidates.length);
  });
});

describe('name placement', () => {
  const point = { x: 200, y: 200 };

  it('puts the name beside the pin disc, on the right first and then the left', () => {
    const [right, left] = nameOptions(point, 80);
    assert.ok(right.x >= pinRect(point).x + pinRect(point).width, 'right of the pin');
    assert.ok(left.x + left.width <= pinRect(point).x, 'left of the pin');
    // Vertically centred on the disc, 16 px above the point.
    assert.equal(right.y + NAME_HEIGHT_PX / 2, point.y - 16);
  });

  it('never overlaps its own pin, and hops to the other side of a neighbour pin', () => {
    const neighbour = pinRect({ x: 232, y: 200 });
    const placed = placeLabels(
      [{ id: 'a', options: nameOptions(point, 80) }],
      [pinRect(point), neighbour]
    );
    assert.equal(placed.get('a'), 1);
  });

  it('is blocked by a cluster marker', () => {
    const placed = placeLabels(
      [{ id: 'a', options: nameOptions(point, 80).slice(0, 1) }],
      [clusterRect({ x: 240, y: 184 })]
    );
    assert.equal(placed.has('a'), false);
  });
});

describe('ringLabelOptions', () => {
  const size = { width: 40, height: 14 };
  const screen = rect(0, 0, 400, 400);

  it('starts due north and fans out either side', () => {
    const options = ringLabelOptions({ x: 200, y: 200 }, 100, size, screen);
    const first = options[0];
    assert.equal(first.x + size.width / 2, 200);
    assert.equal(first.y + size.height / 2, 100);
    // The next two sit either side of north.
    assert.ok(options[1].x + size.width / 2 > 200);
    assert.ok(options[2].x + size.width / 2 < 200);
  });

  it('keeps every option on screen', () => {
    // The ring's top is above the screen, so due north is not an option.
    const options = ringLabelOptions({ x: 200, y: 50 }, 100, size, screen);
    assert.ok(options.length > 0);
    for (const option of options) {
      assert.ok(
        option.y >= 0 &&
          option.x >= 0 &&
          option.x + option.width <= 400 &&
          option.y + option.height <= 400
      );
    }
    assert.notEqual(
      options[0].x + size.width / 2,
      200,
      'the first option has swung away from due north, to where it can be seen'
    );
  });

  it('has no option for a ring that is entirely off screen', () => {
    assert.deepEqual(ringLabelOptions({ x: 2000, y: 2000 }, 100, size, screen), []);
  });
});

describe('name priority', () => {
  it('puts Approved venues first, then the nearest to Base', () => {
    const near = venue('near-rejected', { tier: 'rejected', lat: 53.479, lng: -2.252 });
    const far = venue('far-approved', { lat: 53.49, lng: -2.252 });
    const closer = venue('closer-approved', { lat: 53.48, lng: -2.252 });
    assert.deepEqual(
      byNamePriority([near, far, closer]).map((entry) => entry.id),
      ['closer-approved', 'far-approved', 'near-rejected']
    );
  });

  it('does not reorder the list it is given', () => {
    const list = [venue('b', { tier: 'rejected' }), venue('a')];
    byNamePriority(list);
    assert.deepEqual(
      list.map((entry) => entry.id),
      ['b', 'a']
    );
  });
});

describe('label text and width', () => {
  it('adds the price after the name', () => {
    assert.equal(nameLabelText({ name: "Crazy Pedro's", cost: '££' }), "Crazy Pedro's · ££");
  });

  it('is just the name for a venue without a price', () => {
    assert.equal(nameLabelText({ name: 'Mystery Cafe', cost: '' as never }), 'Mystery Cafe');
  });

  it('estimates a width outside a browser and caps it', () => {
    const short = labelWidth('Pie', '600 12px serif');
    const long = labelWidth(
      'A very long restaurant name indeed that keeps going',
      '600 12px serif'
    );
    assert.ok(short > 0 && short < long);
    assert.equal(long, 176);
  });
});
