<template>
  <section v-if="active" id="venue-results" class="venue-results" :class="`is-${placement}`" aria-labelledby="venue-results-title">
    <!-- On a phone the list folds away under the map until asked for. -->
    <h2 v-if="placement === 'inline'" id="venue-results-title" class="venue-results-heading">
      <button
        type="button"
        class="venue-results-toggle"
        data-results-heading
        :aria-expanded="open"
        aria-controls="venue-results-body"
        @click="open = !open"
      >
        <span>{{ countLabel }} · {{ open ? 'Hide list' : 'Show list' }}</span>
        <svg class="venue-results-chevron" :class="{ 'is-open': open }" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="m5 8 5 5 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </h2>

    <div v-show="placement === 'rail' || open" id="venue-results-body" class="venue-results-body">
      <div class="venue-results-head">
        <h2 v-if="placement === 'rail'" id="venue-results-title" class="venue-results-title" tabindex="-1" data-results-heading>
          {{ countLabel }}
        </h2>
        <label class="venue-results-sort">
          <span>Sort by</span>
          <select :value="sort" @change="setResultsSort(($event.target as HTMLSelectElement).value as ResultsSort)">
            <option v-for="option in RESULTS_SORTS" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </label>
      </div>

      <ul v-if="venues.length > 0" ref="rowsRef" class="venue-results-rows" role="list">
        <li v-for="venue in venues" :key="venue.id">
          <BenchPillar
            :id="`results-row-${venue.id}`"
            :venue="venue"
            :inspections="inspections"
            selectable
            show-tier
            :details-href="`/venues/${venue.slug}`"
            :selected="selection?.id === venue.id"
            @select="selectMapVenue(venue.id, 'list')"
            @mouseenter="setHoveredVenue(venue.id)"
            @mouseleave="setHoveredVenue(null)"
            @focusin="setHoveredVenue(venue.id)"
            @focusout="setHoveredVenue(null)"
          />
        </li>
      </ul>

      <!-- Nothing matches: the same way out as the map's own empty state. -->
      <div v-else class="venue-results-empty" role="status">
        <p>No venues match these filters</p>
        <button type="button" @click="resetFilters">Reset filters</button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useStore } from '@nanostores/vue';
import BenchPillar from '@/components/BenchPillar.vue';
import { resultsCountLabel, sortResults } from '@/lib/map/results';
import { $filteredVenues, resetFilters } from '@/stores/filters';
import { $inspectionsList } from '@/stores/ledger';
import {
  $mapSelection,
  $resultsSort,
  RESULTS_SORTS,
  selectMapVenue,
  setHoveredVenue,
  setResultsSort,
  type ResultsSort,
} from '@/stores/results';
import type { Inspection } from '@/types';

/**
 * Every venue the filters match, as a list that stays in step with the map: it is the way through
 * the results for anyone who can't use the map, and it works with the map hidden. Beside the map
 * (the "All venues" tab) on wide screens, folded under it on a phone; it renders in one place only.
 */
const props = defineProps<{ placement: 'rail' | 'inline' }>();

/** The width at which the home page's two columns stack (see .home-workspace-grid). */
const WIDE_QUERY = '(min-width: 1001px)';

const filtered = useStore($filteredVenues);
const inspectionsStore = useStore($inspectionsList);
// The store hands back a deep-readonly copy; the cards only read it.
const inspections = computed(() => inspectionsStore.value as Inspection[]);
const sort = useStore($resultsSort);
const selection = useStore($mapSelection);

const venues = computed(() => sortResults(filtered.value, sort.value, inspections.value));
const countLabel = computed(() => resultsCountLabel(venues.value.length));

// The server can't know the screen, so nothing renders until the browser has answered.
const mounted = ref(false);
const wide = ref(true);
const active = computed(() => mounted.value && (props.placement === 'rail') === wide.value);
const open = ref(false);
const rowsRef = ref<HTMLElement | null>(null);

let query: MediaQueryList | null = null;
const onQueryChange = () => {
  wide.value = query?.matches ?? true;
};
// The skip link on the map asks for the list.
const onShowResults = () => {
  open.value = true;
};

onMounted(() => {
  query = window.matchMedia(WIDE_QUERY);
  wide.value = query.matches;
  query.addEventListener('change', onQueryChange);
  window.addEventListener('mcr:show-results', onShowResults);
  mounted.value = true;
});

onUnmounted(() => {
  query?.removeEventListener('change', onQueryChange);
  window.removeEventListener('mcr:show-results', onShowResults);
  setHoveredVenue(null);
});

// A pin picked on the map brings its row into view, inside the list's own scroll (never the page's).
watch(selection, async (current) => {
  if (!current || current.source !== 'map' || props.placement !== 'rail') return;
  await nextTick();
  const container = rowsRef.value;
  const row = document.getElementById(`results-row-${current.id}`);
  if (!container || !row || container.offsetParent === null) return;
  // The list is positioned (see .venue-results-rows), so a row's offsetTop is its place inside it.
  const top = row.offsetTop;
  container.scrollTo({ top: Math.max(top - container.clientHeight / 3, 0), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
});
</script>
