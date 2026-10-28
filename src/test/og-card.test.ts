import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OG_HEIGHT, OG_WIDTH, renderOgCard } from '@/lib/og-card';
import { TIER_VALUES } from '@/lib/tiers';

describe('venue social cards', () => {
  it('renders a 1200x630 PNG for every tier, with or without a walk time', async () => {
    for (const tier of TIER_VALUES) {
      const png = Buffer.from(await renderOgCard({ name: 'Test Venue', tier, cost: '££', walkingTimeMin: tier === 'approved' ? null : 9 }));
      assert.equal(png.subarray(1, 4).toString(), 'PNG');
      assert.equal(png.readUInt32BE(16), OG_WIDTH);
      assert.equal(png.readUInt32BE(20), OG_HEIGHT);
    }
  });

  it('draws a different card when the verdict changes', async () => {
    const venue = { name: 'Test Venue', cost: '£' as const, walkingTimeMin: 5 };
    const [a, b] = await Promise.all([renderOgCard({ ...venue, tier: 'approved' }), renderOgCard({ ...venue, tier: 'rejected' })]);
    assert.notDeepEqual(a, b);
  });
});
