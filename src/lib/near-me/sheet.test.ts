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
  it('steps up and down through every height, stopping at either end', () => {
    assert.equal(expandedSnap('collapsed'), 'peek');
    assert.equal(expandedSnap('peek'), 'half');
    assert.equal(expandedSnap('half'), 'full');
    assert.equal(expandedSnap('full'), 'full');
    assert.equal(collapsedSnap('full'), 'half');
    assert.equal(collapsedSnap('half'), 'peek');
    assert.equal(collapsedSnap('peek'), 'collapsed');
    assert.equal(collapsedSnap('collapsed'), 'collapsed');
  });

  it('cycles through every height from the handle', () => {
    assert.equal(cycledSnap('collapsed'), 'peek');
    assert.equal(cycledSnap('peek'), 'half');
    assert.equal(cycledSnap('half'), 'full');
    assert.equal(cycledSnap('full'), 'collapsed');
  });

  it('changes height only for a swipe past the threshold', () => {
    assert.equal(snapAfterSwipe('half', -36), 'full');
    assert.equal(snapAfterSwipe('half', 36), 'peek');
    assert.equal(snapAfterSwipe('peek', 36), 'collapsed');
    assert.equal(snapAfterSwipe('peek', -36), 'half');
    assert.equal(snapAfterSwipe('half', -35), 'half');
    assert.equal(snapAfterSwipe('half', 20), 'half');
  });

  it('gives the settled height in px and as CSS', () => {
    assert.equal(sheetHeightPx('collapsed', 1000), 140);
    assert.equal(sheetHeightPx('peek', 1000), 380);
    assert.equal(sheetHeightPx('half', 1000), 540);
    assert.equal(sheetHeightPx('full', 1000), 860);
    assert.equal(sheetHeightCss('collapsed', false), '140px');
    assert.equal(sheetHeightCss('peek', false), 'max(38dvh, 0px)');
    assert.equal(sheetHeightCss('half', false), '54dvh');
    assert.equal(sheetHeightCss('full', false), '86dvh');
    assert.equal(sheetHeightCss('half', true), '0px');
  });

  it('never lets the peek be shorter than the content it shows', () => {
    assert.equal(sheetHeightPx('peek', 1000, 300), 380);
    assert.equal(sheetHeightPx('peek', 600, 410), 410);
    assert.equal(sheetHeightCss('peek', false, 409.2), 'max(38dvh, 410px)');
  });
});
