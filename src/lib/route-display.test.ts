import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ROUTE_PENDING_LABEL, milesText, routeStats, walkText } from './route-display';

describe('walkText / milesText', () => {
  it('formats present values', () => {
    assert.equal(walkText(12), '12 min walk');
    assert.equal(walkText(12, 'mins'), '12 mins');
    assert.equal(milesText(0.6), '0.60 miles');
    assert.equal(milesText(0.6, 'mi'), '0.60 mi');
  });

  it('keeps the admin-facing pending wording', () => {
    assert.equal(walkText(null), 'Walk time pending');
    assert.equal(milesText(null), 'Distance pending');
  });
});

describe('routeStats', () => {
  it('keeps the usual values and captions when the route is present', () => {
    assert.deepEqual(routeStats(12, 0.6), {
      combined: false,
      walk: { value: '12 mins', caption: 'from Spinningfields Base' },
      distance: { value: '0.60 miles', caption: 'walking route' },
    });
  });

  it('collapses into one cell when both are missing', () => {
    assert.deepEqual(routeStats(null, null), { combined: true });
  });

  it('shows a dash with a muted caption for a lone missing value', () => {
    assert.deepEqual(routeStats(null, 0.6), {
      combined: false,
      walk: { value: null, caption: ROUTE_PENDING_LABEL },
      distance: { value: '0.60 miles', caption: 'walking route' },
    });
    assert.deepEqual(routeStats(12, null), {
      combined: false,
      walk: { value: '12 mins', caption: 'from Spinningfields Base' },
      distance: { value: null, caption: ROUTE_PENDING_LABEL },
    });
  });
});
