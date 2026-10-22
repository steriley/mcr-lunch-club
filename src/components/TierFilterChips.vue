<template>
  <div class="tier-filter-chips" role="group" :aria-label="label">
    <TierChip
      v-for="tier in tiers"
      :key="tier"
      :name="tier"
      :color="TIER_COLORS[tier]"
      :count="counts[tier] ?? 0"
      :selected="selected.includes(tier)"
      :disabled="disabled.includes(tier)"
      :disabled-reason="disabledReason"
      show-check
      @click="emit('toggle', tier)"
    />
  </div>
</template>

<script setup lang="ts">
import TierChip from '@/components/TierChip.vue';
import { TIER_COLORS } from '@/lib/tier-display';
import type { TierStatus } from '@/types';

withDefaults(
  defineProps<{
    /** Tiers to show, in display order. */
    tiers: readonly TierStatus[];
    selected: readonly TierStatus[];
    counts: Partial<Record<TierStatus, number>>;
    /** Tiers shown as unavailable (still clickable; the parent decides what a click does). */
    disabled?: readonly TierStatus[];
    disabledReason?: string;
    label?: string;
  }>(),
  { disabled: () => [], disabledReason: undefined, label: 'Filter by verdict' },
);

const emit = defineEmits<{ toggle: [tier: TierStatus] }>();
</script>

<style>
.tier-filter-chips {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  align-items: center;
  gap: 7px;
  overflow-x: auto;
  padding-block: 1px 3px;
  scrollbar-width: none;
}

.tier-filter-chips::-webkit-scrollbar {
  display: none;
}
</style>
