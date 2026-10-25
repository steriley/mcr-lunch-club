<template>
  <!-- Nearest venue -->
  <div v-if="nearest" class="near-me-list-section">
    <div class="near-me-list-header">
      <span class="near-me-list-title">
        {{ farFromManchester ? 'Closest to Spinningfields' : nearest.isFarAway ? 'Nearest available' : 'Nearest' }}
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
      <span class="near-me-list-title">{{ nearest ? 'Also nearby' : 'Nearby targets' }} ({{ others.length }})</span>
      <div class="near-me-cost-filter" role="group" aria-label="Filter by price">
        <button
          v-for="cost in COST_BANDS"
          :key="cost"
          type="button"
          class="near-me-cost-chip"
          :class="{ 'is-selected': selectedCosts.includes(cost) }"
          :aria-pressed="selectedCosts.includes(cost)"
          @click="emit('toggleCost', cost)"
        >{{ cost }}</button>
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
      <span class="near-me-empty-icon" aria-hidden="true">🏛️</span>
      <h4 class="near-me-empty-title">No venues match</h4>
      <p class="near-me-empty-text">
        No venues in the selected tiers match your current criteria. Enable additional tiers above, or clear the price filter.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
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
  selectedVenueId: string | null;
  selectedCosts: CostTier[];
  /** The user is too far from Manchester, so distances are from Spinningfields. */
  farFromManchester: boolean;
  /** Distances are measured from Spinningfields rather than the user. */
  fromBase: boolean;
}>();

const emit = defineEmits<{ select: [venue: Venue]; details: [venue: Venue]; toggleCost: [cost: CostTier] }>();

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
  font-family: "Playfair Display", Georgia, serif;
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
  font-family: "Plus Jakarta Sans", sans-serif;
  font-variant-numeric: tabular-nums;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
}

.near-me-cost-chip.is-selected {
  background: var(--ledger-deep);
  border-color: var(--ledger-deep);
  color: var(--color-parchment-fixed);
}

.near-me-cost-chip:focus-visible {
  outline: 2px solid var(--ledger-navy);
  outline-offset: 2px;
}

.near-me-list-header {
  align-items: center;
}

.near-me-far-note {
  color: var(--color-ochre);
  font-size: 0.8rem;
  font-weight: 600;
}
</style>
