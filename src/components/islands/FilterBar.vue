<template>
  <section class="ledger-filters" aria-label="Search and filter the venue ledger">
    <div class="ledger-filters-inner">
      <div class="ledger-tier-row">
        <TierFilterChips
          :tiers="ALL_TIERS"
          :selected="filters.tiers"
          :counts="tierCounts"
          @toggle="toggleTier"
        />

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

      <Transition name="ledger-panel">
        <div id="ledger-secondary-filters" v-show="isSecondaryFiltersOpen" class="ledger-secondary-filters">
          <div class="ledger-panel-head">
            <h2 class="ledger-panel-title">
              <svg class="ledger-panel-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M4 7h9m4 0h3M4 17h3m4 0h9" />
                <circle cx="15" cy="7" r="2" />
                <circle cx="9" cy="17" r="2" />
              </svg>
              Refine the Ledger
            </h2>
            <button type="button" class="ledger-reset-button" @click="resetAll">Reset filters</button>
          </div>

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
              placeholder="Search by name, street or dish (e.g. Bada Bing, Bundobust, Salt Beef)…"
              class="ledger-search-input"
            />
            <kbd class="ledger-search-shortcut" aria-hidden="true">⌘ K</kbd>
          </div>

          <div class="ledger-filter-groups">
            <div class="ledger-filter-group">
              <span class="ledger-filter-label">Cost</span>
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
              <span class="ledger-filter-label">Max Walk</span>
              <select
                :value="filters.maxWalkMinutes"
                aria-label="Maximum walking time"
                :class="['ledger-select', filters.maxWalkMinutes !== initialFilterState.maxWalkMinutes && 'is-active']"
                @change="onWalkChange"
              >
                <option :value="60">🗺 All within 2.5 mi</option>
                <option :value="25">🚶 25 min (1.25 mi)</option>
                <option :value="20">🚶 20 min (1.00 mi)</option>
                <option :value="15">🚶 15 min (0.75 mi)</option>
                <option :value="10">🏃 10 min (0.50 mi)</option>
                <option :value="5">⚡ 5 min (0.25 mi)</option>
              </select>
            </label>

            <label class="ledger-filter-group">
              <span class="ledger-filter-label">Inspected</span>
              <select
                :value="filters.inspectedDays"
                aria-label="Filter by inspection date"
                :class="['ledger-select', filters.inspectedDays !== 'all' && 'is-active']"
                @change="onInspectedChange"
              >
                <option value="all">Any time</option>
                <option :value="30">Last 30 days</option>
                <option :value="90">Last 90 days</option>
                <option :value="180">Last 180 days</option>
              </select>
            </label>
          </div>
        </div>
      </Transition>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { useStore } from '@nanostores/vue';
import {
  $filters,
  initialFilterState,
  toggleTier,
  setCost,
  setMaxWalkMinutes,
  setInspectedDays,
  setSearchQuery,
  resetFilters,
  openWhereToday,
  openSuggestModal,
} from '@/stores/filters';
import { $venuesList } from '@/stores/ledger';
import { TIERS, countVenuesByTier } from '@/lib/tiers';
import TierFilterChips from '@/components/TierFilterChips.vue';
import type { CostTier } from '@/types';

const filters = useStore($filters);
const venuesList = useStore($venuesList);
const searchInputRef = ref<HTMLInputElement | null>(null);
const isSecondaryFiltersOpen = ref(false);

const activeSecondaryFilterCount = computed(() => {
  const current = filters.value;
  return Number(current.cost !== 'all')
    + Number(current.maxWalkMinutes !== initialFilterState.maxWalkMinutes)
    + Number(current.inspectedDays !== 'all')
    + Number(current.searchQuery.trim() !== '');
});

const ALL_TIERS = TIERS.map((tier) => tier.value);
const tierCounts = computed(() => countVenuesByTier(venuesList.value));

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
  // The search box lives in the filters panel, so open it before moving focus there.
  isSecondaryFiltersOpen.value = true;
  nextTick(() => searchInputRef.value?.focus());
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

function onWalkChange(event: Event) {
  const target = event.target as HTMLSelectElement;
  setMaxWalkMinutes(Number(target.value));
}

function onInspectedChange(event: Event) {
  const target = event.target as HTMLSelectElement;
  setInspectedDays(target.value === 'all' ? 'all' : Number(target.value));
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
  gap: 10px;
  font-family: "Plus Jakarta Sans", sans-serif;
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

.ledger-secondary-toggle:focus-visible,
.ledger-select:focus-visible,
.ledger-cost-button:focus-visible,
.ledger-reset-button:focus-visible {
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

/* The refine panel: a card, so it reads as its own surface. */
.ledger-secondary-filters {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 14px 14px;
  border: 1px solid #D9CFB8;
  border-radius: 12px;
  background: #FBF6EA;
  box-shadow: 0 6px 18px rgb(22 19 15 / 8%);
}

.ledger-panel-enter-active,
.ledger-panel-leave-active {
  transition: opacity 160ms ease, transform 160ms ease;
}

.ledger-panel-enter-from,
.ledger-panel-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (prefers-reduced-motion: reduce) {
  .ledger-panel-enter-active,
  .ledger-panel-leave-active,
  .ledger-secondary-chevron {
    transition: none;
  }
}

.ledger-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgb(213 204 183 / 65%);
}

.ledger-panel-title {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0;
  color: #8a5100;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .055em;
  line-height: 1.35;
  text-transform: uppercase;
}

.ledger-panel-icon {
  flex: 0 0 17px;
  width: 17px;
  height: 17px;
  color: #9a5a00;
}

.ledger-reset-button {
  padding: 4px 11px;
  border: 1px solid #D9CFB8;
  border-radius: 999px;
  background: #fff;
  color: #8a5100;
  font: 700 12px/1.2 "Plus Jakarta Sans", sans-serif;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 140ms ease, border-color 140ms ease;
}

.ledger-reset-button:hover {
  border-color: #8a5100;
  background: #fff4e5;
}

.ledger-search-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.ledger-search-input {
  width: 100%;
  min-height: 44px;
  padding: 10px 76px 10px 42px;
  border: 1px solid #D9CFB8;
  border-radius: 10px;
  background: #fff;
  box-shadow: inset 0 1px 2px rgb(22 19 15 / 5%);
  color: #1e1b17;
  font: 500 13px/1.45 "Plus Jakarta Sans", sans-serif;
  transition: border-color 140ms ease, box-shadow 140ms ease;
}

.ledger-search-input::placeholder {
  color: #757681;
  opacity: 1;
}

.ledger-search-input:hover {
  border-color: #1B2F6B;
}

.ledger-search-input:focus {
  border-color: #1B2F6B;
  outline: none;
  box-shadow: 0 0 0 3px rgb(242 154 46 / 30%);
}

.ledger-search-input::-webkit-search-cancel-button {
  cursor: pointer;
}

.ledger-search-icon {
  position: absolute;
  left: 14px;
  width: 17px;
  height: 17px;
  stroke: #1B2F6B;
  stroke-width: 2;
  pointer-events: none;
}

.ledger-search-shortcut {
  position: absolute;
  right: 10px;
  padding: 2px 7px;
  border: 1px solid #D9CFB8;
  border-bottom-width: 2px;
  border-radius: 5px;
  background: #F7F0DF;
  color: #454650;
  font: 700 11px/1.5 "Plus Jakarta Sans", sans-serif;
}

/* No keyboard shortcut to advertise on touch screens. */
@media (hover: none) {
  .ledger-search-shortcut {
    display: none;
  }

  .ledger-search-input {
    padding-right: 12px;
  }
}

.ledger-filter-groups {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 12px;
}

.ledger-filter-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.ledger-filter-label {
  color: #8a5100;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .09em;
  text-transform: uppercase;
}

/* Cost: one segmented control, the chosen bracket filled in navy like the other primary buttons. */
.ledger-cost-selector {
  display: flex;
  gap: 2px;
  padding: 3px;
  border: 1px solid #D9CFB8;
  border-radius: 10px;
  background: #F3ECDB;
}

.ledger-cost-button {
  flex: 1;
  min-height: 30px;
  padding: 3px 8px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #454650;
  font: 700 13px/1.2 "Plus Jakarta Sans", sans-serif;
  cursor: pointer;
  transition: background-color 140ms ease, color 140ms ease;
}

.ledger-cost-button:hover:not(.is-selected) {
  color: #1e1b17;
  background: #fff;
}

.ledger-cost-button.is-selected {
  background: #111E47;
  color: #FBF6EA;
  box-shadow: 0 1px 3px rgb(17 30 71 / 35%);
}

.ledger-select {
  width: 100%;
  min-height: 38px;
  padding: 6px 34px 6px 12px;
  border: 1px solid #D9CFB8;
  border-radius: 10px;
  appearance: none;
  background-color: #fff;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%231B2F6B' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m3 6 5 5 5-5'/%3E%3C/svg%3E");
  background-position: right 12px center;
  background-repeat: no-repeat;
  background-size: 12px;
  color: #1e1b17;
  font: 600 13px/1.2 "Plus Jakarta Sans", sans-serif;
  cursor: pointer;
  transition: border-color 140ms ease, background-color 140ms ease;
}

.ledger-select:hover {
  border-color: #1B2F6B;
}

/* A control that has moved off its default is picked out, so active filters are easy to spot. */
.ledger-select.is-active {
  border-color: #1B2F6B;
  background-color: #eef1fa;
  box-shadow: inset 0 0 0 1px #1B2F6B;
}

@media (max-width: 720px) {
  .ledger-filters-inner {
    width: min(100% - 24px, 1440px);
    padding-block: 9px;
    gap: 8px;
  }

  /* 16px stops iOS Safari zooming the page when a field is focused. */
  .ledger-search-input,
  .ledger-select {
    font-size: 16px;
  }

  .ledger-filter-groups {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
