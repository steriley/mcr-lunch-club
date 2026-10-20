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
  toggleAllTiers,
  toggleTier,
} from './filters';
import type { Venue } from '@/types';

const venue = { id: 'v', slug: 'v', name: 'V' } as Venue;

beforeEach(() => {
  resetFilters();
});

describe('filter state', () => {
  it('starts on Approved only', () => {
    assert.deepEqual($filters.get(), initialFilterState);
    assert.deepEqual($filters.get().tiers, ['Approved']);
  });

  it('setTiers flags showAllTiers when more than one tier is chosen', () => {
    setTiers(['Approved', 'Rejected']);
    assert.equal($filters.get().showAllTiers, true);
    setTiers(['Rejected']);
    assert.equal($filters.get().showAllTiers, false);
    assert.deepEqual($filters.get().tiers, ['Rejected']);
  });

  it('toggleAllTiers switches between all six tiers and Approved only', () => {
    toggleAllTiers();
    assert.equal($filters.get().tiers.length, 6);
    assert.equal($filters.get().showAllTiers, true);
    toggleAllTiers();
    assert.deepEqual($filters.get().tiers, ['Approved']);
    assert.equal($filters.get().showAllTiers, false);
  });

  it('toggleTier adds and removes tiers and tracks when all six are on', () => {
    toggleTier('Rejected');
    assert.deepEqual($filters.get().tiers, ['Approved', 'Rejected']);
    toggleTier('Approved');
    assert.deepEqual($filters.get().tiers, ['Rejected']);

    setTiers(['Approved', 'Under Consideration', 'To Be Assessed', 'Rejected', 'If We Must']);
    toggleTier('Gone But Not Forgotten');
    assert.equal($filters.get().showAllTiers, true);
    toggleTier('Gone But Not Forgotten');
    assert.equal($filters.get().showAllTiers, false);
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

  it('resetFilters restores the defaults', () => {
    setCost('£££');
    setSearchQuery('x');
    resetFilters();
    assert.deepEqual($filters.get(), initialFilterState);
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
