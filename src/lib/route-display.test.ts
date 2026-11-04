import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { milesText, walkText } from './route-display';

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
