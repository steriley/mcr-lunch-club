import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hiddenReason, isMappable, isPubliclyVisible, type VisibilityFields } from './visibility';
import { publicVenueCondition } from './visibility-sql';
import { renderSql } from '../test/route-helpers';

const CLOSED_AT = new Date('2026-10-21T12:00:00Z');
const venue = (overrides: Partial<VisibilityFields> = {}): VisibilityFields => ({
  tier: 'approved',
  latitude: '53.48',
  longitude: '-2.25',
  closedAt: null,
  ...overrides,
});

describe('isPubliclyVisible', () => {
  const cases: Array<[string, VisibilityFields, boolean]> = [
    ['tier and coordinates', venue(), true],
    ['rejected tier and coordinates', venue({ tier: 'rejected' }), true],
    ['gone but not forgotten with coordinates', venue({ tier: 'gone_but_not_forgotten' }), true],
    ['no approved tier', venue({ tier: null }), false],
    ['no latitude', venue({ latitude: null }), false],
    ['no longitude', venue({ longitude: null }), false],
    ['nothing at all', venue({ tier: null, latitude: null, longitude: null }), false],
    ['closed, approved', venue({ closedAt: CLOSED_AT }), false],
    ['closed, gone but not forgotten', venue({ tier: 'gone_but_not_forgotten', closedAt: CLOSED_AT }), true],
    ['closed, gone but not forgotten, no coordinates', venue({ tier: 'gone_but_not_forgotten', closedAt: CLOSED_AT, latitude: null }), false],
    ['closed, no tier', venue({ tier: null, closedAt: CLOSED_AT }), false],
  ];

  for (const [name, fields, expected] of cases) {
    it(`${expected ? 'shows' : 'hides'} a venue with ${name}`, () => {
      assert.equal(isPubliclyVisible(fields), expected);
      assert.equal(hiddenReason(fields) === null, expected);
    });
  }

  it('treats zero coordinates as present', () => {
    assert.equal(isPubliclyVisible(venue({ latitude: 0, longitude: 0 })), true);
  });
});

describe('closed venue matrix', () => {
  // Tier page and venue page both use isPubliclyVisible (via publicVenueCondition); map and Near Me use isMappable.
  const matrix: Array<[string, VisibilityFields, { tierPage: boolean; venuePage: boolean; map: boolean; nearMe: boolean }]> = [
    ['open, other tier', venue({ tier: 'if_we_must' }), { tierPage: true, venuePage: true, map: true, nearMe: true }],
    ['open, gone but not forgotten', venue({ tier: 'gone_but_not_forgotten' }), { tierPage: true, venuePage: true, map: true, nearMe: true }],
    ['closed, other tier', venue({ tier: 'if_we_must', closedAt: CLOSED_AT }), { tierPage: false, venuePage: false, map: false, nearMe: false }],
    ['closed, gone but not forgotten', venue({ tier: 'gone_but_not_forgotten', closedAt: CLOSED_AT }), { tierPage: true, venuePage: true, map: false, nearMe: false }],
  ];

  for (const [name, fields, expected] of matrix) {
    it(name, () => {
      assert.deepEqual(
        { tierPage: isPubliclyVisible(fields), venuePage: isPubliclyVisible(fields), map: isMappable(fields), nearMe: isMappable(fields) },
        expected
      );
    });
  }

  it('reopening restores the previous visibility with nothing else changed', () => {
    const open = venue({ tier: 'under_consideration' });
    const closed = { ...open, closedAt: CLOSED_AT };
    const reopened = { ...closed, closedAt: null };
    assert.equal(isPubliclyVisible(closed), false);
    assert.equal(isPubliclyVisible(reopened), isPubliclyVisible(open));
    assert.equal(isMappable(reopened), isMappable(open));
  });
});

describe('hiddenReason', () => {
  it('reports a missing tier, then a missing location, then closure', () => {
    assert.equal(hiddenReason(venue({ tier: null, latitude: null, closedAt: CLOSED_AT })), 'no_tier');
    assert.equal(hiddenReason(venue({ latitude: null, closedAt: CLOSED_AT })), 'needs_location');
    assert.equal(hiddenReason(venue({ closedAt: CLOSED_AT })), 'closed');
    assert.equal(hiddenReason(venue({ tier: 'gone_but_not_forgotten', closedAt: CLOSED_AT })), null);
  });
});

describe('publicVenueCondition', () => {
  it('requires a tier, both coordinates, and open or Gone But Not Forgotten', () => {
    const { sql, params } = renderSql(publicVenueCondition());
    assert.equal(
      sql,
      '("venues"."tier" is not null and "venues"."latitude" is not null and "venues"."longitude" is not null and ("venues"."closed_at" is null or "venues"."tier" = $1))'
    );
    assert.deepEqual(params, ['gone_but_not_forgotten']);
  });
});
