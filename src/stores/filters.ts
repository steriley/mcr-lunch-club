import { atom } from 'nanostores';
import type { FilterState, TierStatus, CostTier, Venue } from '@/types';

export const initialFilterState: FilterState = {
  tiers: ['Approved'],
  showAllTiers: false,
  cost: 'all',
  maxWalkMinutes: 30,
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
export const $isInspectionModalOpen = atom<boolean>(false);
export const $inspectionTargetVenue = atom<Venue | null>(null);

// Chairs' Mode toggle (Executive Authority vs Member Mode)
export const $isChairsMode = atom<boolean>(false);

// Filter Actions
export function setTiers(tiers: TierStatus[]) {
  $filters.set({ ...$filters.get(), tiers, showAllTiers: tiers.length > 1 });
}

export function toggleAllTiers() {
  const current = $filters.get();
  if (current.showAllTiers) {
    $filters.set({
      ...current,
      tiers: ['Approved'],
      showAllTiers: false,
    });
  } else {
    $filters.set({
      ...current,
      tiers: [
        'Approved',
        'Under Consideration',
        'To Be Assessed',
        'Rejected',
        'If We Must',
        'Gone But Not Forgotten',
      ],
      showAllTiers: true,
    });
  }
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
    showAllTiers: updated.length === 6,
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

export function openInspectionModal(venue: Venue | null = null) {
  $inspectionTargetVenue.set(venue);
  $isInspectionModalOpen.set(true);
}

export function closeInspectionModal() {
  $isInspectionModalOpen.set(false);
  $inspectionTargetVenue.set(null);
}

export function toggleChairsMode() {
  $isChairsMode.set(!$isChairsMode.get());
}
