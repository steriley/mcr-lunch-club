<script setup lang="ts">
import { computed } from 'vue';
import { isTierValue, tierLabel } from '@/lib/tiers';

const props = defineProps<{ tier?: string | null }>();

const label = computed(() => (isTierValue(props.tier) ? tierLabel(props.tier) : props.tier == null ? 'No approved tier' : 'Unknown'));

const tone = computed(() => {
  switch (props.tier) {
    case 'approved':
      return 'bg-emerald-100 text-emerald-800';
    case 'under_consideration':
      return 'bg-amber-100 text-amber-800';
    case 'to_be_assessed':
      return 'bg-sky-100 text-sky-800';
    case 'rejected':
      return 'bg-rose-100 text-rose-800';
    case 'if_we_must':
      return 'bg-purple-100 text-purple-800';
    default:
      return 'bg-stone-200 text-stone-700';
  }
});
</script>

<template>
  <span :class="['inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]', tone]">
    {{ label }}
  </span>
</template>
