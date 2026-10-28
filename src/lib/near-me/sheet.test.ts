import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  collapsedSnap,
  cycledSnap,
  expandedSnap,
  sheetHeightCss,
  sheetHeightPx,
  snapAfterSwipe,
} from './sheet';

describe('Near Me bottom sheet', () => {
  it('steps up and down, stopping at either end', () => {
    assert.equal(expandedSnap('collapsed'), 'half');
    assert.equal(expandedSnap('half'), 'full');
    assert.equal(expandedSnap('full'), 'full');
    assert.equal(collapsedSnap('full'), 'half');
    assert.equal(collapsedSnap('half'), 'collapsed');
    assert.equal(collapsedSnap('collapsed'), 'collapsed');
  });

  it('cycles through every height from the handle', () => {
    assert.equal(cycledSnap('collapsed'), 'half');
    assert.equal(cycledSnap('half'), 'full');
    assert.equal(cycledSnap('full'), 'collapsed');
  });

  it('changes height only for a swipe past the threshold', () => {
    assert.equal(snapAfterSwipe('half', -36), 'full');
    assert.equal(snapAfterSwipe('half', 36), 'collapsed');
    assert.equal(snapAfterSwipe('half', -35), 'half');
    assert.equal(snapAfterSwipe('half', 20), 'half');
  });

  it('gives the settled height in px and as CSS', () => {
    assert.equal(sheetHeightPx('collapsed', 1000), 140);
    assert.equal(sheetHeightPx('half', 1000), 540);
    assert.equal(sheetHeightPx('full', 1000), 860);
    assert.equal(sheetHeightCss('collapsed', false), '140px');
    assert.equal(sheetHeightCss('half', false), '54dvh');
    assert.equal(sheetHeightCss('full', false), '86dvh');
    assert.equal(sheetHeightCss('half', true), '0px');
  });
});
