import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { iconShape, STROKE_ICON_PATHS, type IconName } from './icons';

const FILLED: IconName[] = [
  'award_star',
  'directions_walk',
  'explore',
  'fact_check',
  'history_edu',
  'military_tech',
  'my_location',
  'newspaper',
  'open_in_new',
  'restaurant',
];

describe('iconShape', () => {
  it('draws filled icons on the 960 box with the origin at y=-960', () => {
    for (const name of FILLED) {
      const shape = iconShape(name);
      assert.equal(shape.viewBox, '0 -960 960 960', name);
      assert.equal(shape.stroke, false, name);
      assert.ok(shape.d.length > 0, name);
    }
  });

  it('draws line icons on the 24 box and marks them as strokes', () => {
    const names = Object.keys(STROKE_ICON_PATHS) as (keyof typeof STROKE_ICON_PATHS)[];
    assert.ok(names.length > 0);
    for (const name of names) {
      assert.deepEqual(iconShape(name), {
        viewBox: '0 0 24 24',
        stroke: true,
        d: STROKE_ICON_PATHS[name],
      });
    }
  });

  it('gives every icon distinct, non-empty path data', () => {
    const names = [...FILLED, ...(Object.keys(STROKE_ICON_PATHS) as IconName[])];
    const paths = names.map((name) => iconShape(name).d);
    assert.equal(new Set(paths).size, names.length);
  });
});
