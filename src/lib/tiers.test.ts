import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TIERS, TIER_VALUES, isTierValue, parseTier, tierLabel, tierPathSegment } from './tiers';

describe('tiers', () => {
  it('exposes every tier value in order', () => {
    assert.deepEqual(TIER_VALUES, TIERS.map((tier) => tier.value));
    assert.equal(TIER_VALUES.length, 6);
  });

  it('isTierValue accepts stored values only', () => {
    assert.equal(isTierValue('approved'), true);
    assert.equal(isTierValue('gone_but_not_forgotten'), true);
    assert.equal(isTierValue('Approved'), false);
    assert.equal(isTierValue(undefined), false);
    assert.equal(isTierValue(42), false);
  });

  it('tierLabel maps values to display labels', () => {
    assert.equal(tierLabel('approved'), 'Approved');
    assert.equal(tierLabel('if_we_must'), 'If We Must');
    assert.equal(tierLabel('gone_but_not_forgotten'), 'Gone But Not Forgotten');
  });

  it('parseTier accepts values and labels, trimming whitespace', () => {
    assert.equal(parseTier('under_consideration'), 'under_consideration');
    assert.equal(parseTier('Under Consideration'), 'under_consideration');
    assert.equal(parseTier('  Rejected  '), 'rejected');
  });

  it('parseTier returns null for unknown or empty input', () => {
    assert.equal(parseTier('nope'), null);
    assert.equal(parseTier(''), null);
    assert.equal(parseTier(null), null);
    assert.equal(parseTier(undefined), null);
  });

  it('tierPathSegment swaps underscores for hyphens', () => {
    assert.equal(tierPathSegment('under_consideration'), 'under-consideration');
    assert.equal(tierPathSegment('approved'), 'approved');
  });
});
