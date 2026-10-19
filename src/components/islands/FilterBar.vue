<template>
  <section class="ledger-filters" aria-label="Search and filter the venue ledger">
    <div class="ledger-filters-inner">
      <div class="ledger-search-wrap">
        <svg class="ledger-search-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="11" cy="11" r="7.5" />
          <path d="m16.5 16.5 4 4" />
        </svg>
        <input
          ref="searchInputRef"
          id="ledger-search-input"
          v-model="searchQueryModel"
          type="search"
          autocomplete="off"
          aria-label="Search the venue ledger"
          placeholder="Search ledger by name, street, dish, or cuisine (e.g. Bada Bing, Bundobust, Rudy's, Salt Beef, Biryani)..."
          class="ledger-search-input"
        />
        <span class="ledger-search-shortcut" aria-hidden="true">⌘ K</span>
      </div>

      <div class="ledger-tier-row">
        <div class="ledger-tier-filters" role="group" aria-label="Filter by verdict">
          <button
            v-for="tier in allTiers"
            :key="tier.name"
            type="button"
            :aria-pressed="filters.tiers.includes(tier.name)"
            :class="['ledger-tier-chip', filters.tiers.includes(tier.name) && 'is-selected']"
            :style="filters.tiers.includes(tier.name)
              ? { backgroundColor: tier.color, borderColor: tier.color } : undefined"
            @click="toggleTier(tier.name)"
          >
            <span
              :class="['ledger-tier-dot', filters.tiers.includes(tier.name) && 'is-selected']"
              :style="!filters.tiers.includes(tier.name) ? { backgroundColor: tier.color } : undefined"
              aria-hidden="true"
            ></span>
            <span>{{ tier.name }}</span>
            <span class="nav-count ledger-tier-count">{{ getTierCount(tier.name) }}</span>
            <span v-if="filters.tiers.includes(tier.name)" class="ledger-tier-check" aria-hidden="true">✓</span>
          </button>
        </div>

        <button
          type="button"
          class="ledger-secondary-toggle"
          :aria-expanded="isSecondaryFiltersOpen"
          aria-controls="ledger-secondary-filters"
          :aria-label="`${isSecondaryFiltersOpen ? 'Hide' : 'Show'} secondary filters${activeSecondaryFilterCount ? `, ${activeSecondaryFilterCount} active` : ''}`"
          :title="isSecondaryFiltersOpen ? 'Hide secondary filters' : 'Show secondary filters'"
          @click="isSecondaryFiltersOpen = !isSecondaryFiltersOpen"
        >
          <svg class="ledger-secondary-toggle-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 7h9m4 0h3M4 17h3m4 0h9" />
            <circle cx="15" cy="7" r="2" />
            <circle cx="9" cy="17" r="2" />
          </svg>
          <span v-if="activeSecondaryFilterCount" class="ledger-secondary-filter-count" aria-hidden="true">{{ activeSecondaryFilterCount }}</span>
          <svg :class="['ledger-secondary-chevron', isSecondaryFiltersOpen && 'is-open']" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m3 6 5 5 5-5" />
          </svg>
        </button>
      </div>

      <div id="ledger-secondary-filters" v-show="isSecondaryFiltersOpen" class="ledger-secondary-filters">
        <div class="ledger-filter-groups">
          <div class="ledger-filter-group">
            <span class="ledger-filter-label">Cost:</span>
            <div class="ledger-cost-selector" role="group" aria-label="Filter by cost">
              <button
                v-for="cost in costOptions"
                :key="cost.id"
                type="button"
                :aria-pressed="filters.cost === cost.id"
                :title="cost.title"
                :class="['ledger-cost-button', filters.cost === cost.id && 'is-selected']"
                @click="setCost(cost.id)"
              >{{ cost.label }}</button>
            </div>
          </div>

          <label class="ledger-filter-group">
            <span class="ledger-filter-label">Max Walk:</span>
            <select
              :value="filters.maxWalkMinutes"
              aria-label="Maximum walking time"
              class="ledger-select"
              @change="onWalkChange"
            >
              <option :value="25">🗺 25 min (2.5 mi Max Bound)</option>
              <option :value="20">🚶 20 min (1.00 mi)</option>
              <option :value="15">🚶 15 min (0.75 mi)</option>
              <option :value="10">🏃 10 min (0.50 mi)</option>
              <option :value="5">⚡ 5 min (0.25 mi)</option>
              <option :value="60">All within 2.5 mi</option>
            </select>
          </label>

          <label class="ledger-filter-group">
            <span class="ledger-filter-label">Inspected:</span>
            <select
              :value="filters.inspectedDays"
              aria-label="Filter by inspection date"
              class="ledger-select"
              @change="onInspectedChange"
            >
              <option value="all">Any Inspection Date</option>
              <option :value="30">Last 30 Days (Fresh Gazette)</option>
              <option :value="90">Last 90 Days</option>
              <option :value="180">Last 180 Days</option>
            </select>
          </label>

          <label class="ledger-filter-group">
            <span class="ledger-filter-label">Cuisine:</span>
            <select
              :value="filters.cuisine"
              aria-label="Filter by cuisine"
              class="ledger-select cuisine-select"
              @change="onCuisineChange"
            >
              <option value="all">All Cuisines</option>
              <option v-for="cuisine in availableCuisines" :key="cuisine" :value="cuisine">{{ cuisine }}</option>
            </select>
          </label>
        </div>

        <div class="ledger-filter-actions">
          <button type="button" class="ledger-reset-button" @click="resetAll">Reset Filters</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useStore } from '@nanostores/vue';
import {
  $filters,
  toggleTier,
  setCost,
  setMaxWalkMinutes,
  setInspectedDays,
  setCuisine,
  setSearchQuery,
  resetFilters,
  openWhereToday,
  openSuggestModal,
} from '@/stores/filters';
import { $venuesList } from '@/stores/ledger';
import type { CostTier, TierStatus } from '@/types';

const filters = useStore($filters);
const venuesList = useStore($venuesList);
const searchInputRef = ref<HTMLInputElement | null>(null);
const isSecondaryFiltersOpen = ref(false);

const activeSecondaryFilterCount = computed(() => {
  const current = filters.value;
  return Number(current.cost !== 'all')
    + Number(current.maxWalkMinutes !== 25)
    + Number(current.inspectedDays !== 'all')
    + Number(current.cuisine !== 'all');
});

const allTiers: { name: TierStatus; color: string }[] = [
  { name: 'Approved', color: '#1E7A4E' },
  { name: 'Under Consideration', color: '#C27803' },
  { name: 'To Be Assessed', color: '#5A6474' },
  { name: 'Rejected', color: '#B92B27' },
  { name: 'If We Must', color: '#7C3A82' },
  { name: 'Gone But Not Forgotten', color: '#71717A' },
];

const costOptions: { id: CostTier | 'all'; label: string; title: string }[] = [
  { id: 'all', label: 'All', title: 'All price brackets' },
  { id: '£', label: '£', title: '£: Under £10' },
  { id: '££', label: '££', title: '££: Above £10' },
  { id: '£££', label: '£££', title: '£££: Payday treat' },
];

const searchQueryModel = computed({
  get: () => filters.value.searchQuery,
  set: (value: string) => setSearchQuery(value),
});

function handleActionLink() {
  if (window.location.hash === '#suggest-a-venue') openSuggestModal();
  if (window.location.hash === '#where-to-today') openWhereToday();
}

function handleWhereTodayClick(event: MouseEvent) {
  if (!(event.target instanceof Element) || window.location.pathname !== '/') return;

  const trigger = event.target.closest('[data-open-where-today]');
  if (!trigger) return;

  event.preventDefault();
  openWhereToday();
}

function handleSearchShortcut(event: KeyboardEvent) {
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k' || event.altKey || event.shiftKey) {
    return;
  }

  event.preventDefault();
  searchInputRef.value?.focus();
}

onMounted(() => {
  handleActionLink();
  window.addEventListener('hashchange', handleActionLink);
  window.addEventListener('keydown', handleSearchShortcut);
  document.addEventListener('click', handleWhereTodayClick);
});

onUnmounted(() => {
  window.removeEventListener('hashchange', handleActionLink);
  window.removeEventListener('keydown', handleSearchShortcut);
  document.removeEventListener('click', handleWhereTodayClick);
});

const availableCuisines = computed(() => {
  const cuisines = new Set<string>();
  venuesList.value.forEach((venue) => {
    if (venue.cuisine) cuisines.add(venue.cuisine);
  });
  return Array.from(cuisines).sort();
});

function getTierCount(tier: TierStatus) {
  return venuesList.value.filter((venue) => venue.status === tier).length;
}

function onWalkChange(event: Event) {
  const target = event.target as HTMLSelectElement;
  setMaxWalkMinutes(Number(target.value));
}

function onInspectedChange(event: Event) {
  const target = event.target as HTMLSelectElement;
  setInspectedDays(target.value === 'all' ? 'all' : Number(target.value));
}

function onCuisineChange(event: Event) {
  const target = event.target as HTMLSelectElement;
  setCuisine(target.value);
}

function resetAll() {
  resetFilters();
}
</script>

<style>
.ledger-filters {
  border-bottom: 1px solid #D9CFB8;
  background: #F3ECDB;
  box-shadow: 0 2px 8px rgb(22 19 15 / 5%);
}

.ledger-filters-inner {
  width: min(100% - 40px, 1440px);
  margin-inline: auto;
  padding-block: 11px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-family: "Plus Jakarta Sans", sans-serif;
}

.ledger-search-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.ledger-search-input {
  width: 100%;
  min-height: 39px;
  padding: 9px 68px 9px 39px;
  border: 1px solid #D9CFB8;
  border-radius: 8px;
  background: #fff;
  box-shadow: inset 0 1px 2px rgb(22 19 15 / 4%);
  color: #1e1b17;
  font: 400 12px/1.45 "Plus Jakarta Sans", sans-serif;
}

.ledger-search-input::placeholder {
  color: #757681;
  opacity: 1;
}

.ledger-search-input:focus {
  border-color: #1B2F6B;
  outline: 1px solid #1B2F6B;
  outline-offset: 0;
}

.ledger-search-input::-webkit-search-cancel-button {
  cursor: pointer;
}

.ledger-search-icon {
  position: absolute;
  left: 12px;
  width: 16px;
  height: 16px;
  stroke: #454650;
  stroke-width: 2;
  pointer-events: none;
}

.ledger-search-shortcut {
  position: absolute;
  right: 10px;
  padding: 3px 6px;
  border: 1px solid #D9CFB8;
  border-radius: 4px;
  background: #F3ECDB;
  color: #757681;
  font-size: 12px;
}

.ledger-tier-filters {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 7px;
  overflow-x: auto;
  padding-block: 1px 3px;
  scrollbar-width: none;
}

.ledger-tier-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.ledger-secondary-toggle {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 38px;
  height: 32px;
  padding: 0 4px;
  border: 1px solid #D9CFB8;
  border-radius: 7px;
  background: #F7F0DF;
  color: #454650;
  cursor: pointer;
}

.ledger-secondary-toggle:hover,
.ledger-secondary-toggle[aria-expanded="true"] {
  border-color: #1B2F6B;
  background: #fff8f3;
  color: #1B2F6B;
}

.ledger-secondary-toggle:focus-visible {
  outline: 2px solid #1B2F6B;
  outline-offset: 2px;
}

.ledger-secondary-toggle-icon {
  width: 17px;
  height: 17px;
}

.ledger-secondary-chevron {
  width: 11px;
  height: 11px;
  transition: transform 140ms ease;
}

.ledger-secondary-chevron.is-open {
  transform: rotate(180deg);
}

.ledger-secondary-filter-count {
  position: absolute;
  top: -5px;
  right: -5px;
  display: grid;
  min-width: 15px;
  height: 15px;
  place-items: center;
  padding-inline: 3px;
  border-radius: 999px;
  background: #1B2F6B;
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
}

.ledger-tier-filters::-webkit-scrollbar {
  display: none;
}

.ledger-tier-chip {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 7px;
  min-height: 27px;
  padding: 5px 10px;
  border: 1px solid #D9CFB8;
  border-radius: 999px;
  background: #F7F0DF;
  color: #1e1b17;
  font: 600 12px/1.2 "Plus Jakarta Sans", sans-serif;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease;
}

.ledger-tier-chip:hover:not(.is-selected) {
  background: #fff8f3;
  border-color: #b9ae94;
}

.ledger-tier-chip.is-selected {
  color: white;
}

.ledger-tier-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 50%;
}

.ledger-tier-dot.is-selected {
  background: white !important;
}

.ledger-tier-check {
  font-size: 12px;
  line-height: 1;
}

.ledger-secondary-filters {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 7px;
  border-top: 1px solid rgb(217 207 184 / 70%);
}

.ledger-filter-groups,
.ledger-filter-group,
.ledger-filter-actions {
  display: flex;
  align-items: center;
}

.ledger-filter-groups {
  flex-wrap: wrap;
  gap: 10px 13px;
}

.ledger-filter-group {
  gap: 6px;
  min-width: 0;
}

.ledger-filter-label {
  color: #454650;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .06em;
  text-transform: uppercase;
  white-space: nowrap;
}

.ledger-cost-selector {
  display: inline-flex;
  gap: 1px;
  padding: 2px;
  border: 1px solid #D9CFB8;
  border-radius: 6px;
  background: #F7F0DF;
}

.ledger-cost-button {
  min-width: 24px;
  padding: 3px 6px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #454650;
  font: 600 12px/1.2 "Plus Jakarta Sans", sans-serif;
  cursor: pointer;
}

.ledger-cost-button:hover:not(.is-selected) {
  color: #1e1b17;
  background: #efe7d8;
}

.ledger-cost-button.is-selected {
  background: #001854;
  color: white;
}

.ledger-select {
  max-width: 225px;
  min-height: 26px;
  padding: 4px 21px 4px 7px;
  border: 1px solid #D9CFB8;
  border-radius: 5px;
  background-color: #F7F0DF;
  color: #1e1b17;
  font: 500 12px/1.2 "Plus Jakarta Sans", sans-serif;
}

.cuisine-select {
  max-width: 180px;
}

.ledger-select:focus-visible,
.ledger-cost-button:focus-visible,
.ledger-tier-chip:focus-visible,
.ledger-secondary-toggle:focus-visible,
.ledger-reset-button:focus-visible {
  outline: 2px solid #1B2F6B;
  outline-offset: 2px;
}

.ledger-filter-actions {
  flex: 0 0 auto;
  gap: 6px;
}

.ledger-reset-button {
  padding: 4px 0 4px 5px;
  border: 0;
  background: none;
  color: #8a5100;
  font: 700 12px/1.2 "Plus Jakarta Sans", sans-serif;
  text-decoration: underline;
  text-decoration-style: dotted;
  white-space: nowrap;
  cursor: pointer;
}

.ledger-reset-button:hover {
  color: #454650;
}

@media (max-width: 1050px) {
  .ledger-secondary-filters {
    align-items: flex-start;
    flex-direction: column;
  }

  .ledger-filter-actions {
    width: 100%;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
}

@media (max-width: 720px) {
  .ledger-filters-inner {
    width: min(100% - 24px, 1440px);
    padding-block: 9px;
    gap: 7px;
  }

  .ledger-search-input {
    min-height: 38px;
    font-size: 12px;
  }

  .ledger-tier-filters {
    margin-inline: -1px;
  }

  .ledger-tier-chip {
    min-height: 28px;
    font-size: 12px;
  }

  .ledger-filter-groups {
    width: 100%;
    gap: 8px 10px;
  }

  .ledger-filter-group {
    flex-wrap: wrap;
  }

  .ledger-filter-label {
    font-size: 12px;
  }

  .ledger-select {
    max-width: min(58vw, 225px);
  }

  .ledger-filter-actions {
    justify-content: flex-start;
  }
}

@media (max-width: 420px) {
  .ledger-filter-actions {
    gap: 5px;
  }

}
</style>
