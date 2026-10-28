<template>
  <!-- The venue picked on the map or in the list, above the rest -->
  <div v-if="selection" class="near-me-list-section near-me-selection">
    <div class="near-me-list-header">
      <span class="near-me-list-title">Your selection</span>
      <button type="button" class="near-me-clear-selection" @click="emit('clearSelection')">
        Clear
      </button>
    </div>
    <BenchPillar
      :venue="selection.venue"
      :inspections="inspections"
      :rank="selection.rank"
      :walk-label="selection.rv ? rowWalkLabel(selection.rv) : undefined"
      :walk-url="selection.rv ? rowWalkUrl(selection.rv) : undefined"
      show-tier
    />
  </div>

  <!-- Nearest venue -->
  <div v-if="nearest" class="near-me-list-section">
    <div class="near-me-list-header">
      <span class="near-me-list-title">
        {{
          farFromManchester
            ? 'Closest to Spinningfields'
            : nearest.isFarAway
              ? 'Nearest available'
              : 'Nearest'
        }}
      </span>
      <span v-if="farFromManchester" class="near-me-far-note">You are outside Manchester</span>
      <span v-else-if="nearest.isFarAway" class="near-me-far-note">None nearby</span>
    </div>
    <BenchPillar
      :id="`near-me-row-${nearest.venue.id}`"
      :venue="nearest.venue"
      :inspections="inspections"
      :rank="1"
      :walk-label="rowWalkLabel(nearest)"
      :walk-url="rowWalkUrl(nearest)"
      selectable
      show-tier
      :selected="selectedVenueId === nearest.venue.id"
      @select="emit('select', nearest.venue)"
      @details="emit('details', nearest.venue)"
    />
  </div>

  <!-- Ranked Venue List Section -->
  <div class="near-me-list-section">
    <div class="near-me-list-header">
      <span class="near-me-list-title"
        >{{ nearest ? 'Also nearby' : 'Nearby targets' }} ({{ others.length }})</span
      >
      <div class="near-me-cost-filter" role="group" aria-label="Filter by price">
        <button
          v-for="cost in COST_BANDS"
          :key="cost"
          type="button"
          class="near-me-cost-chip"
          :class="{ 'is-selected': selectedCosts.includes(cost) }"
          :aria-pressed="selectedCosts.includes(cost)"
          @click="emit('toggleCost', cost)"
        >
          {{ cost }}
        </button>
      </div>
    </div>

    <div class="near-me-list-rows" role="list">
      <BenchPillar
        v-for="(rv, index) in others"
        :id="`near-me-row-${rv.venue.id}`"
        :key="rv.venue.id"
        role="listitem"
        :venue="rv.venue"
        :inspections="inspections"
        :rank="index + 2"
        :walk-label="rowWalkLabel(rv)"
        :walk-url="rowWalkUrl(rv)"
        selectable
        show-tier
        :selected="selectedVenueId === rv.venue.id"
        @select="emit('select', rv.venue)"
        @details="emit('details', rv.venue)"
      />
    </div>

    <!-- Empty state when no venues match -->
    <div v-if="!nearest" class="near-me-empty-state">
      <span class="near-me-empty-icon" aria-hidden="true"><Icon name="landmark" /></span>
      <h4 class="near-me-empty-title">No venues match</h4>
      <p class="near-me-empty-text">
        No venues in the selected verdicts match your current criteria. Enable additional verdicts
        above, or clear the price filter.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import Icon from '@/components/Icon.vue';
import BenchPillar from '@/components/BenchPillar.vue';
import { estimateWalkMinutes, getWalkingDirectionsUrl, type RankedVenue } from '@/lib/map';
import { COST_BANDS } from '@/lib/near-me/filters';
import type { CostTier, Inspection, Venue } from '@/types';

const props = defineProps<{
  /** The nearest venue, shown on its own; null when nothing matches. */
  nearest: RankedVenue | null;
  /** The rest, nearest first. */
  others: RankedVenue[];
  inspections: Inspection[];
  /** The selected venue and its place in the ranking; null when nothing is selected. */
  selection: { venue: Venue; rv: RankedVenue | null; rank?: number } | null;
  selectedVenueId: string | null;
  selectedCosts: CostTier[];
  /** The user is too far from Manchester, so distances are from Spinningfields. */
  farFromManchester: boolean;
  /** Distances are measured from Spinningfields rather than the user. */
  fromBase: boolean;
}>();

const emit = defineEmits<{
  select: [venue: Venue];
  details: [venue: Venue];
  toggleCost: [cost: CostTier];
  clearSelection: [];
}>();

function rowWalkLabel(rv: RankedVenue): string {
  return `${rv.formattedDistance} · ${estimateWalkMinutes(rv.distanceMetres)} min walk from ${props.fromBase ? 'Base' : 'you'}`;
}

function rowWalkUrl(rv: RankedVenue): string | null {
  const { lat, lng } = rv.venue;
  return lat == null || lng == null ? null : getWalkingDirectionsUrl(lat, lng);
}
</script>

<style scoped>
/* =====================================================   Ranked List Section & Cards
   ============================================================ */
.near-me-list-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.near-me-list-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 2px 4px;
}

.near-me-list-title {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--near-me-gold);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.near-me-list-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.near-me-empty-state {
  text-align: center;
  padding: 24px 12px;
  color: var(--color-rule);
}

.near-me-empty-icon {
  font-size: 1.8rem;
  display: block;
  margin-bottom: 8px;
}

.near-me-empty-title {
  font-family: 'Playfair Display', 'Playfair Display Fallback', Georgia, serif;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--color-white);
  margin: 0 0 4px 0;
}

.near-me-empty-text {
  font-size: 0.72rem;
  color: var(--color-on-dark-dim);
  margin: 0;
  line-height: 1.4;
}

.near-me-list-title {
  color: var(--color-deep-ink);
}

.near-me-empty-state {
  color: var(--ledger-ink);
}

.near-me-empty-title {
  color: var(--color-deep-ink);
}

.near-me-empty-text {
  color: var(--near-me-muted);
}

.near-me-list-title {
  font-size: 0.8rem;
}

/* Price filter in the list header */
.near-me-cost-filter {
  display: flex;
  gap: 4px;
}

.near-me-cost-chip {
  min-width: 36px;
  min-height: 36px;
  padding: 0 8px;
  border: 1px solid var(--ledger-border);
  border-radius: 9999px;
  background: var(--ledger-card);
  color: var(--color-deep-ink);
  font-family: 'Plus Jakarta Sans', 'Plus Jakarta Sans Fallback', sans-serif;
  font-variant-numeric: tabular-nums;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    background-color 140ms ease,
    border-color 140ms ease,
    color 140ms ease;
}

.near-me-cost-chip:hover:not(.is-selected) {
  border-color: var(--color-navy);
  background: var(--color-ivory);
}

.near-me-cost-chip.is-selected {
  background: var(--ledger-deep);
  border-color: var(--ledger-deep);
  color: var(--color-parchment-fixed);
}

.near-me-cost-chip.is-selected:hover {
  background: var(--color-navy-fixed);
  border-color: var(--color-navy-fixed);
}

/* The deep navy fill is nearly the dark panel's own colour, so a chosen chip gets a lighter edge in dark mode. */
:root[data-theme='dark'] .near-me-cost-chip.is-selected {
  border-color: var(--color-navy);
}

.near-me-cost-chip:focus-visible {
  outline: 2px solid var(--color-navy);
  outline-offset: 2px;
}

.near-me-list-header {
  align-items: center;
}

.near-me-clear-selection {
  padding: 2px 4px;
  border: 0;
  background: none;
  color: var(--color-deep-ink);
  font:
    700 0.75rem 'Plus Jakarta Sans',
    'Plus Jakarta Sans Fallback',
    sans-serif;
  text-decoration: underline;
  text-decoration-style: dotted;
  cursor: pointer;
}

.near-me-clear-selection:hover {
  color: var(--ledger-navy);
}

.near-me-clear-selection:focus-visible {
  outline: 2px solid var(--ledger-navy);
  outline-offset: 2px;
}

.near-me-far-note {
  color: var(--color-ochre);
  font-size: 0.8rem;
  font-weight: 600;
}

/* Touch: 44px price chips. */
@media (pointer: coarse) {
  .near-me-cost-chip {
    min-width: 44px;
    min-height: 44px;
  }
}
</style>
