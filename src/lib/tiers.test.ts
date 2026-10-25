import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_HOME_TIERS,
  NEAR_ME_DEFAULT_TIERS,
  NEAR_ME_TIERS,
  TIERS,
  TIER_VALUES,
  countVenuesByTier,
  isTierValue,
  parseTier,
  tierFromSlug,
  tierInfo,
  tierLabel,
} from './tiers';

describe('tiers', () => {
  it('keeps stored values in Postgres enum order', () => {
    assert.deepEqual(TIER_VALUES, ['approved', 'under_consideration', 'to_be_assessed', 'rejected', 'if_we_must', 'gone_but_not_forgotten']);
  });

  it('lists every tier once in display order, with If We Must before Rejected', () => {
    const order = TIERS.map((tier) => tier.value);
    assert.deepEqual([...order].sort(), [...TIER_VALUES].sort());
    assert.ok(order.indexOf('if_we_must') < order.indexOf('rejected'));
  });

  it('gives every tier a colour, banner and motto', () => {
    for (const tier of TIERS) {
      assert.equal(tier.color, `var(--color-tier-${tier.slug})`);
      assert.equal(tier.border, `var(--color-tier-${tier.slug}-edge)`);
      assert.equal(tier.tint, `var(--color-tier-${tier.slug}-tint)`);
      assert.equal(tier.bannerClass, `bg-tier-${tier.slug}`);
      for (const text of [tier.icon, tier.quote, tier.motto, tier.description, tier.rule]) assert.ok(text.trim());
    }
  });

  it('defines every tier colour token in the theme', () => {
    const css = readFileSync('src/styles/global.css', 'utf8');
    for (const tier of TIERS) {
      for (const suffix of ['', '-edge', '-tint']) {
        assert.match(css, new RegExp(`--color-tier-${tier.slug}${suffix}: #[0-9a-f]{6};`), `${tier.slug}${suffix} has no token`);
      }
    }
  });

  it('only shows Near Me tiers that are allowed there', () => {
    assert.deepEqual(NEAR_ME_DEFAULT_TIERS, ['approved']);
    assert.ok(!NEAR_ME_TIERS.includes('rejected') && !NEAR_ME_TIERS.includes('gone_but_not_forgotten'));
    for (const tier of [...NEAR_ME_DEFAULT_TIERS, ...DEFAULT_HOME_TIERS]) assert.ok(isTierValue(tier));
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

  it('slugs swap underscores for hyphens and resolve back to their tier', () => {
    for (const tier of TIERS) {
      assert.equal(tier.slug, tier.value.replace(/_/g, '-'));
      assert.equal(tierFromSlug(tier.slug), tierInfo(tier.value));
    }
    assert.equal(tierFromSlug('under_consideration'), null);
    assert.equal(tierFromSlug(undefined), null);
  });

  it('counts venues per tier, including empty tiers', () => {
    assert.deepEqual(countVenuesByTier([{ tier: 'approved' }, { tier: 'approved' }, { tier: 'rejected' }]), {
      approved: 2,
      under_consideration: 0,
      to_be_assessed: 0,
      rejected: 1,
      if_we_must: 0,
      gone_but_not_forgotten: 0,
    });
  });
});
