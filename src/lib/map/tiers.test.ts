import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  NEAR_ME_DEFAULT_TIERS,
  NEAR_ME_ELIGIBLE_TIERS,
  STATUS_COLORS,
  TIER_METADATA,
  getTierMetadata,
  isNearMeEligible,
} from './tiers';
import type { TierStatus } from '@/types';

describe('map tiers', () => {
  it('keys every tier by its own status and matches STATUS_COLORS', () => {
    for (const [status, metadata] of Object.entries(TIER_METADATA)) {
      assert.equal(metadata.status, status);
      assert.equal(STATUS_COLORS[status as TierStatus], metadata.colors);
    }
  });

  it('only Approved is selected by default in Near Me', () => {
    assert.deepEqual(NEAR_ME_DEFAULT_TIERS, ['Approved']);
  });

  it('excludes Rejected and Gone But Not Forgotten from Near Me', () => {
    assert.deepEqual(NEAR_ME_ELIGIBLE_TIERS, ['Approved', 'Under Consideration', 'To Be Assessed', 'If We Must']);
    assert.equal(isNearMeEligible('Approved'), true);
    assert.equal(isNearMeEligible('Rejected'), false);
    assert.equal(isNearMeEligible('Gone But Not Forgotten'), false);
  });

  it('isNearMeEligible is false for unknown statuses', () => {
    assert.equal(isNearMeEligible('Mystery' as TierStatus), false);
  });

  it('getTierMetadata returns metadata, falling back to Approved', () => {
    assert.equal(getTierMetadata('If We Must').slug, 'if-we-must');
    assert.equal(getTierMetadata('Mystery' as TierStatus), TIER_METADATA.Approved);
  });
});
