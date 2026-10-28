import '../test/setup-env';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { notShownReason } from './golden-cut';

const venue = (overrides = {}) => ({
  tier: 'approved',
  latitude: '53.48',
  longitude: '-2.25',
  closedAt: null,
  ...overrides,
});

describe('notShownReason', () => {
  it('is null for an open, located Approved venue', () => {
    assert.equal(notShownReason(venue()), null);
  });

  it('explains why the home page is skipping a venue', () => {
    assert.equal(notShownReason(venue({ tier: 'if_we_must' })), 'No longer Approved');
    assert.equal(notShownReason(venue({ tier: null })), 'No longer Approved');
    assert.equal(notShownReason(venue({ latitude: null })), 'Needs a location');
    assert.equal(notShownReason(venue({ closedAt: new Date() })), 'Permanently closed');
  });
});
