import { atom } from 'nanostores';
import type { FilterState, CostTier, Venue } from '@/types';
import { londonDate } from '@/lib/london-date';
import { DEFAULT_HOME_TIERS, type TierValue } from '@/lib/tiers';

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

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Whole calendar days from `from` to `to`, both YYYY-MM-DD. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * The homepage map's filter rule. `today` is the London calendar day, so
 * "inspected within 7 days" counts whole days, inclusive. A venue whose walking
 * route is still pending is never hidden by the walk-time limit; a venue with
 * no inspection date never passes an inspection-age filter.
 */
export function matchesFilters(
  venue: Venue,
  filters: Omit<FilterState, 'tiers'> & { tiers: readonly TierValue[] },
  today: string = londonDate()
): boolean {
  if (venue.lat === null || venue.lng === null) return false;
  if (!filters.tiers.includes(venue.tier)) return false;
  if (filters.cost !== 'all' && venue.cost !== filters.cost) return false;
  if (filters.maxWalkMinutes && venue.walkingTimeMin !== null && venue.walkingTimeMin > filters.maxWalkMinutes) return false;
  if (filters.cuisine !== 'all' && venue.cuisine !== filters.cuisine) return false;

  if (filters.inspectedDays !== 'all') {
    // Anything but a stored YYYY-MM-DD (e.g. the "Awaiting Assessment" placeholder) means never inspected.
    if (!ISO_DAY.test(venue.lastInspectionDate)) return false;
    if (daysBetween(venue.lastInspectionDate, today) > filters.inspectedDays) return false;
  }

  const query = filters.searchQuery.trim().toLowerCase();
  if (query) {
    const haystack = [venue.name, venue.cuisine, venue.eatLikeUs, venue.address].map((text) => (text || '').toLowerCase());
    if (!haystack.some((text) => text.includes(query))) return false;
  }
  return true;
}

// Active venue currently selected for the slide-up sheet
export const $activeVenue = atom<Venue | null>(null);

// Modal states
export const $isWhereTodayOpen = atom<boolean>(false);
export const $isSuggestModalOpen = atom<boolean>(false);
export const $isNearMeOpen = atom<boolean>(false);

// Filter Actions
export function setTiers(tiers: TierValue[]) {
  $filters.set({ ...$filters.get(), tiers });
}

export function toggleTier(tier: TierValue) {
  const current = $filters.get();
  let updated: TierValue[];
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
