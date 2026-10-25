<template>
  <div ref="strip" class="tier-filter-chips" role="group" :aria-label="label">
    <TierChip
      v-for="tier in tiers"
      :key="tier"
      :name="tierInfo(tier).label"
      :color="tierInfo(tier).color"
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
import { onMounted, ref } from 'vue';
import TierChip from '@/components/TierChip.vue';
import { enableHorizontalScroll } from '@/lib/horizontal-scroll';
import { tierInfo, type TierValue } from '@/lib/tiers';

withDefaults(
  defineProps<{
    /** Tiers to show, in display order. */
    tiers: readonly TierValue[];
    selected: readonly TierValue[];
    counts: Partial<Record<TierValue, number>>;
    /** Tiers shown as unavailable (still clickable; the parent decides what a click does). */
    disabled?: readonly TierValue[];
    disabledReason?: string;
    label?: string;
  }>(),
  { disabled: () => [], disabledReason: undefined, label: 'Filter by verdict' },
);

const emit = defineEmits<{ toggle: [tier: TierValue] }>();

// The scrollbar is hidden, so give a mouse the wheel and drag to reach chips off the edge.
const strip = ref<HTMLElement | null>(null);
onMounted(() => {
  const el = strip.value;
  if (!el) return;
  enableHorizontalScroll(el);
  // The left fade only shows once chips have scrolled out of view, so the first chip stays
  // flush with the search box at rest.
  const updateLeftFade = () => el.style.setProperty('--fade-left', el.scrollLeft > 1 ? '24px' : '0px');
  el.addEventListener('scroll', updateLeftFade, { passive: true });
  updateLeftFade();
});
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
  /* The fades hint that more tiers sit off-screen; the padding keeps it over empty space when every chip fits. */
  padding-right: 24px;
  mask-image: linear-gradient(to right, transparent, var(--color-black) var(--fade-left, 0px), var(--color-black) calc(100% - 24px), transparent);
  -webkit-mask-image: linear-gradient(to right, transparent, var(--color-black) var(--fade-left, 0px), var(--color-black) calc(100% - 24px), transparent);
}

.tier-filter-chips::-webkit-scrollbar {
  display: none;
}

.tier-filter-chips.is-dragging {
  cursor: grabbing;
  user-select: none;
}
</style>
