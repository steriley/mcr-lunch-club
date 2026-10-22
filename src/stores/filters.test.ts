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
import { DEFAULT_HOME_TIERS } from '@/lib/tier-display';
import type { Venue } from '@/types';

const venue = { id: 'v', slug: 'v', name: 'V' } as Venue;

beforeEach(() => {
  resetFilters();
});

describe('filter state', () => {
  it('starts on Approved, Under Consideration and To Be Assessed', () => {
    assert.deepEqual($filters.get(), initialFilterState);
    assert.deepEqual($filters.get().tiers, ['Approved', 'Under Consideration', 'To Be Assessed']);
    assert.deepEqual($filters.get().tiers, [...DEFAULT_HOME_TIERS]);
  });

  it('setTiers replaces the selected tiers', () => {
    setTiers(['Approved', 'Rejected']);
    assert.deepEqual($filters.get().tiers, ['Approved', 'Rejected']);
    setTiers(['Rejected']);
    assert.deepEqual($filters.get().tiers, ['Rejected']);
  });

  it('toggleTier adds and removes tiers', () => {
    toggleTier('Rejected');
    assert.deepEqual($filters.get().tiers, ['Approved', 'Under Consideration', 'To Be Assessed', 'Rejected']);
    toggleTier('Approved');
    assert.deepEqual($filters.get().tiers, ['Under Consideration', 'To Be Assessed', 'Rejected']);
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
    setTiers(['Rejected']);
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
