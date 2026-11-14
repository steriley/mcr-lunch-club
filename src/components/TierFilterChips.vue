<template>
  <div ref="strip" class="tier-filter-chips" role="group" :aria-label="label">
    <TierChip
      v-for="tier in tiers"
      :key="tier"
      :name="tierInfo(tier).label"
      :color="tierInfo(tier).color"
      :glyph="tierInfo(tier).glyph"
      :count="counts[tier] ?? 0"
      :selected="selected.includes(tier)"
      :disabled="disabled.includes(tier)"
      :disabled-reason="disabledReason"
      show-check
      @click="emit('toggle', tier)"
    />
    <!-- Zero width, stuck to the strip's right edge: it adds nothing to the scroll length. -->
    <span v-if="showMore" class="tier-more-anchor">
      <button
        type="button"
        class="tier-more"
        :class="{ 'is-hidden': moreCount === 0 }"
        :tabindex="moreCount === 0 ? -1 : undefined"
        :aria-hidden="moreCount === 0 ? 'true' : undefined"
        :aria-label="`+${moreCount} more verdicts`"
        @click="scrollMore"
      >
        +{{ moreCount }}
      </button>
    </span>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import TierChip from '@/components/TierChip.vue';
import { enableHorizontalScroll } from '@/lib/horizontal-scroll';
import { tierInfo, type TierValue } from '@/lib/tiers';

const props = withDefaults(
  defineProps<{
    /** Tiers to show, in display order. */
    tiers: readonly TierValue[];
    selected: readonly TierValue[];
    counts: Partial<Record<TierValue, number>>;
    /** Tiers shown as unavailable (still clickable; the parent decides what a click does). */
    disabled?: readonly TierValue[];
    disabledReason?: string;
    label?: string;
    /** A "+N" button over the right edge while chips sit out of view; it scrolls the row along. */
    showMore?: boolean;
  }>(),
  { disabled: () => [], disabledReason: undefined, label: 'Filter by verdict', showMore: false }
);

const emit = defineEmits<{ toggle: [tier: TierValue] }>();

// The scrollbar is hidden, so give a mouse the wheel and drag to reach chips off the edge.
const strip = ref<HTMLElement | null>(null);
// How many chips are wholly past the right edge.
const moreCount = ref(0);
const FADE_PX = 24;
let resizeObserver: ResizeObserver | null = null;

function updateMore() {
  const el = strip.value;
  if (!el || !props.showMore) return;
  const edge = el.getBoundingClientRect().right - FADE_PX;
  moreCount.value = [...el.querySelectorAll('.ledger-tier-chip')].filter(
    (chip) => chip.getBoundingClientRect().left >= edge
  ).length;
  // The button sits over the right fade, so the fade steps aside while it shows.
  el.style.setProperty('--fade-right', moreCount.value > 0 ? '0px' : `${FADE_PX}px`);
}

function scrollMore() {
  const el = strip.value;
  if (!el) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollBy({ left: el.clientWidth * 0.75, behavior: reduced ? 'auto' : 'smooth' });
}

onMounted(() => {
  const el = strip.value;
  if (!el) return;
  enableHorizontalScroll(el);
  // The left fade only shows once chips have scrolled out of view, so the first chip stays
  // flush with the search box at rest.
  const updateLeftFade = () =>
    el.style.setProperty('--fade-left', el.scrollLeft > 1 ? '24px' : '0px');
  el.addEventListener('scroll', updateLeftFade, { passive: true });
  updateLeftFade();

  if (props.showMore) {
    el.addEventListener('scroll', updateMore, { passive: true });
    // Resizing the strip or any chip (a web font arriving, a count changing) moves the edge.
    resizeObserver = new ResizeObserver(updateMore);
    resizeObserver.observe(el);
    el.querySelectorAll('.ledger-tier-chip').forEach((chip) => resizeObserver?.observe(chip));
    updateMore();
  }
});

onBeforeUnmount(() => resizeObserver?.disconnect());
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
  mask-image: linear-gradient(
    to right,
    transparent,
    var(--color-black) var(--fade-left, 0px),
    var(--color-black) calc(100% - var(--fade-right, 24px)),
    transparent
  );
  -webkit-mask-image: linear-gradient(
    to right,
    transparent,
    var(--color-black) var(--fade-left, 0px),
    var(--color-black) calc(100% - var(--fade-right, 24px)),
    transparent
  );
}

/* The strip's 24px right padding counts against sticky insets, so a negative inset puts the button on the edge. */
.tier-more-anchor {
  position: sticky;
  right: -20px;
  z-index: 1;
  flex: none;
  align-self: stretch;
  width: 0;
}

.tier-more {
  position: absolute;
  top: 50%;
  right: 0;
  min-width: 38px;
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--color-hairline);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-ink);
  box-shadow: 0 2px 8px rgb(17 30 71 / 22%);
  font:
    700 12px/1 'Plus Jakarta Sans',
    'Plus Jakarta Sans Fallback',
    sans-serif;
  cursor: pointer;
  transform: translateY(-50%);
}

.tier-more.is-hidden {
  visibility: hidden;
}

/* A 44px hit area around the 30px pill. */
.tier-more::before {
  content: '';
  position: absolute;
  inset: -7px -4px;
}

.tier-more:focus-visible {
  outline: 2px solid var(--color-gold);
  outline-offset: 2px;
}

.tier-filter-chips::-webkit-scrollbar {
  display: none;
}

.tier-filter-chips.is-dragging {
  cursor: grabbing;
  user-select: none;
}

/* Touch: the chips' hit extension reaches 7px above and below, so the scrolling row (which clips what
   overflows it) needs that much room. The negative margin gives the room back, so the layout is unchanged. */
@media (pointer: coarse) {
  .tier-filter-chips {
    padding-block: 8px 10px;
    margin-block: -7px;
  }
}
</style>
