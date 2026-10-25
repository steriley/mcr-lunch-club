<template>
  <!-- Collapsed sheet: one line about the selected (or nearest) venue so the map stays clear. -->
  <div class="near-me-collapsed-summary">
    <button type="button" class="near-me-collapsed-main" @click="emit('expand')">
      <span class="near-me-card-index">#{{ rank }}</span>
      <span class="near-me-collapsed-name">{{ ranked.venue.name }}</span>
      <span class="near-me-collapsed-meta">{{ ranked.formattedDistance }}</span>
    </button>
    <a
      :href="getWalkingDirectionsUrl(ranked.venue.lat!, ranked.venue.lng!)"
      target="_blank"
      rel="noopener noreferrer"
      class="near-me-btn-walk"
      :aria-label="`Get walking directions to ${ranked.venue.name}`"
    >
      <span>Walk</span>
    </a>
  </div>
</template>

<script setup lang="ts">
import { getWalkingDirectionsUrl, type RankedVenue } from '@/lib/map';

defineProps<{ ranked: RankedVenue; rank: number }>();

const emit = defineEmits<{ expand: [] }>();
</script>

<style scoped>
.near-me-card-index {
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--near-me-gold);
  flex-shrink: 0;
}

.near-me-btn-walk {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background-color: var(--near-me-crimson);
  color: var(--color-white);
  font-size: 0.68rem;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 4px;
  text-decoration: none;
  transition: all 0.15s ease;
}

.near-me-btn-walk:hover {
  background-color: var(--color-signal-red);
}

.near-me-card-index {
  color: var(--ledger-gold);
}

.near-me-btn-walk {
  background-color: var(--ledger-gold);
  color: var(--color-deep-ink);
  box-shadow: 0 1px 3px rgb(17 30 71 / 20%);
}

.near-me-btn-walk:hover {
  background-color: var(--color-gold-soft);
  color: var(--color-deep-ink);
}

.near-me-btn-walk {
  min-height: 44px;
  justify-content: center;
  padding-inline: 14px;
  font-size: 0.85rem;
  white-space: nowrap;
}

/* Collapsed sheet summary */
.near-me-collapsed-summary {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 14px 12px;
}

.near-me-collapsed-main {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 44px;
  align-items: center;
  gap: 8px;
  background: none;
  border: none;
  padding: 0;
  color: var(--color-deep-ink);
  text-align: left;
  cursor: pointer;
}

.near-me-collapsed-name {
  overflow: hidden;
  font-family: "Playfair Display", Georgia, serif;
  font-size: 1rem;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.near-me-collapsed-meta {
  flex-shrink: 0;
  font-family: "Plus Jakarta Sans", sans-serif;
  font-variant-numeric: tabular-nums;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--near-me-muted);
}
</style>
