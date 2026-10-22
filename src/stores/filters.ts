import { atom } from 'nanostores';
import type { FilterState, TierStatus, CostTier, Venue } from '@/types';
import { DEFAULT_HOME_TIERS } from '@/lib/tier-display';

export const initialFilterState: FilterState = {
  tiers: [...DEFAULT_HOME_TIERS],
  cost: 'all',
  // Everything within the 2.5 mi bound, so far-flung venues are not hidden on first load.
  maxWalkMinutes: 60,
  inspectedDays: 'all',
  cuisine: 'all',
  searchQuery: '',
};

export const $filters = atom<FilterState>(initialFilterState);

// Active venue currently selected for the slide-up sheet
export const $activeVenue = atom<Venue | null>(null);

// Modal states
export const $isWhereTodayOpen = atom<boolean>(false);
export const $isSuggestModalOpen = atom<boolean>(false);
export const $isNearMeOpen = atom<boolean>(false);

// Filter Actions
export function setTiers(tiers: TierStatus[]) {
  $filters.set({ ...$filters.get(), tiers });
}

export function toggleTier(tier: TierStatus) {
  const current = $filters.get();
  let updated: TierStatus[];
  if (current.tiers.includes(tier)) {
    updated = current.tiers.filter((t) => t !== tier);
  } else {
    updated = [...current.tiers, tier];
  }
  $filters.set({
    ...current,
    tiers: updated,
  });
}

export function setCost(cost: CostTier | 'all') {
  $filters.set({ ...$filters.get(), cost });
}

export function setMaxWalkMinutes(maxWalkMinutes: number) {
  $filters.set({ ...$filters.get(), maxWalkMinutes });
}

export function setInspectedDays(inspectedDays: number | 'all') {
  $filters.set({ ...$filters.get(), inspectedDays });
}

export function setCuisine(cuisine: string | 'all') {
  $filters.set({ ...$filters.get(), cuisine });
}

export function setSearchQuery(searchQuery: string) {
  $filters.set({ ...$filters.get(), searchQuery });
}

export function resetFilters() {
  $filters.set(initialFilterState);
}

export function selectVenue(venue: Venue | null) {
  $activeVenue.set(venue);
}

export function openWhereToday() {
  $isWhereTodayOpen.set(true);
}

export function closeWhereToday() {
  $isWhereTodayOpen.set(false);
}

export function openSuggestModal() {
  $isSuggestModalOpen.set(true);
}

export function closeSuggestModal() {
  $isSuggestModalOpen.set(false);
}

export function openNearMe() {
  $isNearMeOpen.set(true);
}

export function closeNearMe() {
  $isNearMeOpen.set(false);
}
