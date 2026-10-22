import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  $activeVenue,
  $filters,
  $isNearMeOpen,
  $isSuggestModalOpen,
  $isWhereTodayOpen,
  closeNearMe,
  closeSuggestModal,
  closeWhereToday,
  initialFilterState,
  matchesFilters,
  openNearMe,
  openSuggestModal,
  openWhereToday,
  resetFilters,
  selectVenue,
  setCost,
  setCuisine,
  setInspectedDays,
  setMaxWalkMinutes,
  setSearchQuery,
  setTiers,
  toggleTier,
} from './filters';
import { DEFAULT_HOME_TIERS } from '@/lib/tiers';
import type { Venue } from '@/types';

const venue = { id: 'v', slug: 'v', name: 'V' } as Venue;

beforeEach(() => {
  resetFilters();
});

describe('filter state', () => {
  it('starts on Approved, Under Consideration and To Be Assessed', () => {
    assert.deepEqual($filters.get(), initialFilterState);
    assert.deepEqual($filters.get().tiers, ['approved', 'under_consideration', 'to_be_assessed']);
    assert.deepEqual($filters.get().tiers, [...DEFAULT_HOME_TIERS]);
  });

  it('setTiers replaces the selected tiers', () => {
    setTiers(['approved', 'rejected']);
    assert.deepEqual($filters.get().tiers, ['approved', 'rejected']);
    setTiers(['rejected']);
    assert.deepEqual($filters.get().tiers, ['rejected']);
  });

  it('toggleTier adds and removes tiers', () => {
    toggleTier('rejected');
    assert.deepEqual($filters.get().tiers, ['approved', 'under_consideration', 'to_be_assessed', 'rejected']);
    toggleTier('approved');
    assert.deepEqual($filters.get().tiers, ['under_consideration', 'to_be_assessed', 'rejected']);
  });

  it('toggleTier can switch every tier off on the homepage', () => {
    for (const tier of DEFAULT_HOME_TIERS) toggleTier(tier);
    assert.deepEqual($filters.get().tiers, []);
  });

  it('simple setters update one field and leave the rest alone', () => {
    setCost('£');
    setMaxWalkMinutes(10);
    setInspectedDays(30);
    setCuisine('Thai');
    setSearchQuery('noodle');
    assert.deepEqual($filters.get(), {
      ...initialFilterState,
      cost: '£',
      maxWalkMinutes: 10,
      inspectedDays: 30,
      cuisine: 'Thai',
      searchQuery: 'noodle',
    });
  });

  it('resetFilters restores the defaults, including the three default tiers', () => {
    setCost('£££');
    setSearchQuery('x');
    setTiers(['rejected']);
    resetFilters();
    assert.deepEqual($filters.get(), initialFilterState);
    assert.deepEqual($filters.get().tiers, [...DEFAULT_HOME_TIERS]);
  });
});

describe('UI state', () => {
  it('selects and clears the active venue', () => {
    selectVenue(venue);
    assert.equal($activeVenue.get(), venue);
    selectVenue(null);
    assert.equal($activeVenue.get(), null);
  });

  it('opens and closes the modals', () => {
    openWhereToday();
    assert.equal($isWhereTodayOpen.get(), true);
    closeWhereToday();
    assert.equal($isWhereTodayOpen.get(), false);

    openSuggestModal();
    assert.equal($isSuggestModalOpen.get(), true);
    closeSuggestModal();
    assert.equal($isSuggestModalOpen.get(), false);

    openNearMe();
    assert.equal($isNearMeOpen.get(), true);
    closeNearMe();
    assert.equal($isNearMeOpen.get(), false);
  });
});

describe('matchesFilters', () => {
  const place = (overrides: Partial<Venue> = {}): Venue => ({
    id: 'pie', slug: 'pie', name: 'Pie Shop', tier: 'approved', lat: 53.48, lng: -2.25, distanceMiles: 0.4, walkingTimeMin: 9,
    cost: '££', cuisine: 'British', eatLikeUs: 'Steak pudding', lastInspectionDate: '2026-10-15', address: '1 Deansgate', mapSearchLink: '',
    ...overrides,
  });
  const filters = (overrides: Partial<typeof initialFilterState> = {}) => ({ ...initialFilterState, ...overrides });
  const today = '2026-10-22';

  it('passes a located venue in a selected tier with no other filters', () => {
    assert.equal(matchesFilters(place(), filters(), today), true);
  });

  it('drops venues without a location or outside the selected tiers', () => {
    assert.equal(matchesFilters(place({ lat: null }), filters(), today), false);
    assert.equal(matchesFilters(place({ tier: 'rejected' }), filters(), today), false);
    assert.equal(matchesFilters(place({ tier: 'rejected' }), filters({ tiers: ['rejected'] }), today), true);
  });

  it('filters by cost and cuisine', () => {
    assert.equal(matchesFilters(place(), filters({ cost: '£' }), today), false);
    assert.equal(matchesFilters(place(), filters({ cost: '££', cuisine: 'British' }), today), true);
    assert.equal(matchesFilters(place(), filters({ cuisine: 'Pizza' }), today), false);
  });

  it('applies the walk limit, but never hides a venue whose route is pending', () => {
    assert.equal(matchesFilters(place({ walkingTimeMin: 12 }), filters({ maxWalkMinutes: 10 }), today), false);
    assert.equal(matchesFilters(place({ walkingTimeMin: 10 }), filters({ maxWalkMinutes: 10 }), today), true);
    assert.equal(matchesFilters(place({ walkingTimeMin: null }), filters({ maxWalkMinutes: 10 }), today), true);
  });

  it('counts inspection age in whole London days, inclusive', () => {
    assert.equal(matchesFilters(place({ lastInspectionDate: '2026-10-15' }), filters({ inspectedDays: 7 }), today), true);
    assert.equal(matchesFilters(place({ lastInspectionDate: '2026-10-14' }), filters({ inspectedDays: 7 }), today), false);
    assert.equal(matchesFilters(place({ lastInspectionDate: today }), filters({ inspectedDays: 7 }), today), true);
  });

  it('never passes an inspection-age filter without a stored date', () => {
    for (const lastInspectionDate of ['Awaiting Assessment', '', 'not a date']) {
      assert.equal(matchesFilters(place({ lastInspectionDate }), filters({ inspectedDays: 90 }), today), false, lastInspectionDate);
      assert.equal(matchesFilters(place({ lastInspectionDate }), filters(), today), true, lastInspectionDate);
    }
  });

  it('searches name, cuisine, order and address, ignoring case and spaces around the query', () => {
    for (const searchQuery of ['pie', 'BRITISH', 'pudding', 'deansgate', '  shop  ']) {
      assert.equal(matchesFilters(place(), filters({ searchQuery }), today), true, searchQuery);
    }
    assert.equal(matchesFilters(place(), filters({ searchQuery: 'sushi' }), today), false);
    assert.equal(matchesFilters(place(), filters({ searchQuery: '   ' }), today), true);
  });
});
