<script setup lang="ts">
import { computed } from 'vue';
import TierChip from '@/components/TierChip.vue';
import { isTierValue, tierInfo } from '@/lib/tiers';

const props = defineProps<{ tier?: string | null }>();

const label = computed(() =>
  isTierValue(props.tier)
    ? tierInfo(props.tier).label
    : props.tier == null
      ? 'No approved verdict'
      : 'Unknown'
);

// The same chip as a chosen homepage filter. Without a tier it is the neutral grey, with no mark.
const info = computed(() =>
  tierInfo(isTierValue(props.tier) ? props.tier : 'gone_but_not_forgotten')
);
const glyph = computed(() => (isTierValue(props.tier) ? info.value.glyph : undefined));
</script>

<template>
  <TierChip :name="label" :color="info.color" :glyph="glyph" selected is-static />
</template>
