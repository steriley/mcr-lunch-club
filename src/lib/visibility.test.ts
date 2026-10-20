import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hiddenReason, isPubliclyVisible, publicVenueCondition } from './visibility';
import { renderSql } from '../test/route-helpers';

describe('isPubliclyVisible', () => {
  const cases: Array<[string, { tier: string | null; latitude: string | null; longitude: string | null }, boolean]> = [
    ['tier and coordinates', { tier: 'approved', latitude: '53.48', longitude: '-2.25' }, true],
    ['rejected tier and coordinates', { tier: 'rejected', latitude: '53.48', longitude: '-2.25' }, true],
    ['gone but not forgotten with coordinates', { tier: 'gone_but_not_forgotten', latitude: '53.48', longitude: '-2.25' }, true],
    ['no approved tier', { tier: null, latitude: '53.48', longitude: '-2.25' }, false],
    ['no latitude', { tier: 'approved', latitude: null, longitude: '-2.25' }, false],
    ['no longitude', { tier: 'approved', latitude: '53.48', longitude: null }, false],
    ['nothing at all', { tier: null, latitude: null, longitude: null }, false],
  ];

  for (const [name, venue, expected] of cases) {
    it(`${expected ? 'shows' : 'hides'} a venue with ${name}`, () => {
      assert.equal(isPubliclyVisible(venue), expected);
      assert.equal(hiddenReason(venue) === null, expected);
    });
  }

  it('treats zero coordinates as present', () => {
    assert.equal(isPubliclyVisible({ tier: 'approved', latitude: 0, longitude: 0 }), true);
  });
});

describe('hiddenReason', () => {
  it('reports a missing tier before a missing location', () => {
    assert.equal(hiddenReason({ tier: null, latitude: null, longitude: null }), 'no_tier');
    assert.equal(hiddenReason({ tier: 'approved', latitude: null, longitude: null }), 'needs_location');
  });
});

describe('publicVenueCondition', () => {
  it('requires a tier and both coordinates in SQL', () => {
    const { sql, params } = renderSql(publicVenueCondition());
    assert.equal(sql, '("venues"."tier" is not null and "venues"."latitude" is not null and "venues"."longitude" is not null)');
    assert.deepEqual(params, []);
  });
});
