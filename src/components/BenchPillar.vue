<script setup lang="ts">
import Icon from '@/components/Icon.vue';
import { computed } from 'vue';
import { focalStyle } from '@/lib/image-upload';
import type { PublicVenue } from '@/lib/public-data';
import { cardBlurb, inspectionCountLabel, toCard } from '@/lib/sovereign-bench';
import { COST_LABELS } from '@/lib/cost-display';
import { DEFAULT_CUISINE, cuisineLabel } from '@/lib/cuisines';
import { tierInfo } from '@/lib/tiers';
import type { Inspection, Venue } from '@/types';

/**
 * Island flavour of BenchPillar.astro (Near Me). The two share the card view
 * model (toCard, cardBlurb, inspectionCountLabel in sovereign-bench.ts) and the
 * `.bench-*` class contract in home.css; this one adds the interactive bits.
 */
const props = withDefaults(
  defineProps<{
    venue: Venue;
    inspections: readonly Inspection[];
    /** Position in a ranked list, shown before the name. */
    rank?: number;
    /** Replaces the walk-from-HQ text, e.g. "160 m · 2 min walk from you". */
    walkLabel?: string;
    /** Replaces the walk-from-HQ directions link. */
    walkUrl?: string | null;
    /** The card picks the venue instead of linking to its page, and offers Details. */
    selectable?: boolean;
    /** With `selectable`, set false to leave out the Details button (the whole card already picks the venue). */
    showDetails?: boolean;
    selected?: boolean;
    /** Names the venue's tier, for lists that mix tiers. */
    showTier?: boolean;
    /** With `selectable`, makes Details a link to the venue's page instead of a button. */
    detailsHref?: string;
    /** Adds what you need to decide at a glance: the tier's glyph, the cuisine, and the cost with its meaning. */
    detailed?: boolean;
  }>(),
  { showDetails: true }
);

const emit = defineEmits<{ select: []; details: [] }>();

const card = computed(() =>
  toCard(
    { venue: { ...props.venue, image: props.venue.image ?? null, closed: false } as PublicVenue },
    [...props.inspections]
  )
);
const blurb = computed(() => cardBlurb(card.value));
const countLabel = computed(() => inspectionCountLabel(card.value));
const tier = computed(() => tierInfo(props.venue.tier));
// "Other" is the catch-all, not a cuisine worth saying.
const cuisine = computed(() =>
  props.venue.cuisine && props.venue.cuisine !== cuisineLabel(DEFAULT_CUISINE)
    ? props.venue.cuisine
    : ''
);
// Null while the route is pending: no walk row, rather than a "pending" label on every card.
const walk = computed(() => {
  if (props.walkLabel !== undefined) return { label: props.walkLabel, url: props.walkUrl ?? null };
  const { walk: own } = card.value;
  return own === null ? null : { label: own.label, url: own.directionsUrl };
});

function markBroken(event: Event) {
  (event.target as HTMLElement).parentElement?.classList.add('is-placeholder');
}
</script>

<template>
  <article class="bench-pillar" :class="{ 'is-selected': selected }">
    <div class="bench-pillar-main">
      <div class="bench-thumb">
        <span class="bench-placeholder" aria-hidden="true"></span>
        <img
          v-if="card.image"
          class="bench-image"
          :src="card.image.thumbUrl"
          alt=""
          width="80"
          height="80"
          :style="{ objectPosition: focalStyle(card.image) }"
          loading="lazy"
          decoding="async"
          @error="markBroken"
        />
      </div>
      <div class="bench-pillar-copy">
        <div class="bench-pillar-title-row">
          <h3 class="bench-pillar-name" :class="{ 'has-rank': rank }">
            <span v-if="rank" class="bench-rank">#{{ rank }}</span>
            <button
              v-if="selectable"
              type="button"
              class="bench-pillar-link"
              @click="emit('select')"
            >
              {{ card.name }}
            </button>
            <a v-else class="bench-pillar-link" :href="card.href">{{ card.name }}</a>
          </h3>
          <span class="bench-cost">{{ card.cost }}</span>
        </div>
        <p v-if="showTier" class="bench-tier" :style="{ color: tier.color }">
          <span
            class="bench-tier-glyph"
            :style="{ backgroundColor: tier.color }"
            aria-hidden="true"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              focusable="false"
            >
              <path :d="tier.glyph" />
            </svg> </span
          >{{ tier.label }}
        </p>
        <p v-if="detailed" class="bench-meta">
          <template v-if="cuisine">{{ cuisine }} · </template>{{ venue.cost }} ·
          {{ COST_LABELS[venue.cost] }}
        </p>
        <p v-if="card.lastInspection" class="bench-last">
          Last Inspection: {{ card.lastInspection }}
        </p>
        <p v-if="blurb" class="bench-pillar-text" :class="{ 'is-quote': blurb.kind === 'quote' }">
          {{ blurb.text }}
        </p>
      </div>
    </div>
    <div class="bench-telemetry">
      <a
        v-if="walk && walk.url"
        class="bench-walk is-link"
        :href="walk.url"
        target="_blank"
        rel="noopener noreferrer"
        :aria-label="`Walking directions to ${card.name}`"
      >
        <Icon name="directions_walk" />
        {{ walk.label }}
      </a>
      <span v-else-if="walk" class="bench-walk">
        <Icon name="directions_walk" />
        {{ walk.label }}
      </span>
      <a
        v-if="selectable && showDetails && detailsHref"
        class="bench-details"
        :href="detailsHref"
        :aria-label="`Details for ${card.name}`"
        >Details</a
      >
      <button
        v-else-if="selectable && showDetails"
        type="button"
        class="bench-details"
        :aria-label="`Details for ${card.name}`"
        @click="emit('details')"
      >
        Details
      </button>
      <span v-else class="bench-count">{{ countLabel }}</span>
    </div>
  </article>
</template>
