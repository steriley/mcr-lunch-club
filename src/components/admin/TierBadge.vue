<script setup lang="ts">
import { computed } from 'vue';
import { isTierValue, tierInfo } from '@/lib/tiers';

const props = defineProps<{ tier?: string | null }>();

const label = computed(() =>
  isTierValue(props.tier)
    ? tierInfo(props.tier).label
    : props.tier == null
      ? 'No approved verdict'
      : 'Unknown'
);

// Semantic tier colours from the Sovereign Food Ledger palette; grey when there is no tier.
const tone = computed(() => {
  const { color, tint } = tierInfo(isTierValue(props.tier) ? props.tier : 'gone_but_not_forgotten');
  return {
    backgroundColor: tint,
    color,
    borderColor: `color-mix(in srgb, ${color} 50%, transparent)`,
  };
});
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]"
    :style="tone"
  >
    <span class="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
    {{ label }}
  </span>
</template>
