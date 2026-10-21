<script setup lang="ts">
import { computed } from 'vue';
import { isTierValue, tierLabel } from '@/lib/tiers';

const props = defineProps<{ tier?: string | null }>();

const label = computed(() => (isTierValue(props.tier) ? tierLabel(props.tier) : props.tier == null ? 'No approved tier' : 'Unknown'));

// Semantic tier colours from the Sovereign Food Ledger palette.
const tone = computed(() => {
  switch (props.tier) {
    case 'approved':
      return 'bg-[#E8F5EE] text-[#1E7A4E] border-[#1E7A4E]/50';
    case 'under_consideration':
      return 'bg-[#FEF5E7] text-[#C27803] border-[#C27803]/50';
    case 'to_be_assessed':
      return 'bg-[#F0F2F5] text-[#5A6474] border-[#5A6474]/50';
    case 'if_we_must':
      return 'bg-[#F7EEF8] text-[#7C3A82] border-[#7C3A82]/50';
    case 'rejected':
      return 'bg-[#FDF0F0] text-[#B92B27] border-[#B92B27]/50';
    default:
      return 'bg-[#F4F4F5] text-[#71717A] border-[#71717A]/50';
  }
});
</script>

<template>
  <span :class="['inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]', tone]">
    <span class="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
    {{ label }}
  </span>
</template>
