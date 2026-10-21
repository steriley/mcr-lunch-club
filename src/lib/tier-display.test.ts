import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TIERS } from './tiers';
import { TIER_COLORS, TIER_DISPLAY_ORDER, countVenuesByTier } from './tier-display';

describe('tier display', () => {
  it('lists every tier once, with If We Must before Rejected', () => {
    assert.deepEqual([...TIER_DISPLAY_ORDER].sort(), TIERS.map((tier) => tier.label).sort());
    assert.ok(TIER_DISPLAY_ORDER.indexOf('If We Must') < TIER_DISPLAY_ORDER.indexOf('Rejected'));
    for (const tier of TIER_DISPLAY_ORDER) assert.match(TIER_COLORS[tier], /^#[0-9A-F]{6}$/i);
  });

  it('counts venues per tier, including empty tiers', () => {
    const counts = countVenuesByTier([
      { status: 'Approved' },
      { status: 'Approved' },
      { status: 'Rejected' },
    ]);
    assert.deepEqual(counts, {
      Approved: 2,
      'Under Consideration': 0,
      'To Be Assessed': 0,
      'If We Must': 0,
      Rejected: 1,
      'Gone But Not Forgotten': 0,
    });
  });
});
