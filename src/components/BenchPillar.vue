<script setup lang="ts">
import { computed } from 'vue';
import { focalStyle } from '@/lib/image-upload';
import type { PublicVenue } from '@/lib/public-data';
import { toCard } from '@/lib/sovereign-bench';
import { tierInfo } from '@/lib/tiers';
import type { Inspection, Venue } from '@/types';

/**
 * Vue twin of BenchPillar.astro for islands (Near Me): same markup and
 * classes, so the card looks the same as on the tier pages and homepage.
 */
const props = defineProps<{
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
  selected?: boolean;
  /** Names the venue's tier, for lists that mix tiers. */
  showTier?: boolean;
}>();

const emit = defineEmits<{ select: []; details: [] }>();

const card = computed(() =>
  toCard({ venue: { ...props.venue, image: props.venue.image ?? null, closed: false } as PublicVenue }, [...props.inspections]),
);
const tier = computed(() => tierInfo(props.venue.tier));
const walk = computed(() => ({
  label: props.walkLabel ?? card.value.walk.label,
  url: props.walkLabel === undefined ? card.value.walk.directionsUrl : (props.walkUrl ?? null),
}));

function markBroken(event: Event) {
  (event.target as HTMLElement).parentElement?.classList.add('is-placeholder');
}
</script>

<template>
  <article class="bench-pillar" :class="{ 'is-selected': selected }">
    <div class="bench-pillar-main">
      <div class="bench-thumb">
        <span class="bench-placeholder" aria-hidden="true">
          <img src="/brand/approved-sticker-256.webp" alt="" />
        </span>
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
            <button v-if="selectable" type="button" class="bench-pillar-link" @click="emit('select')">{{ card.name }}</button>
            <a v-else class="bench-pillar-link" :href="card.href">{{ card.name }}</a>
          </h3>
          <span class="bench-cost">{{ card.cost }}</span>
        </div>
        <p v-if="showTier" class="bench-tier" :style="{ color: tier.color }">
          <span class="bench-tier-dot" :style="{ backgroundColor: tier.color }" aria-hidden="true"></span>{{ tier.label }}
        </p>
        <p v-if="card.lastInspection" class="bench-last">Last Inspection: {{ card.lastInspection }}</p>
        <p v-if="card.quote" class="bench-pillar-text is-quote">{{ card.quote }}</p>
        <p v-else-if="card.eatLikeUs" class="bench-pillar-text">Eat like us: {{ card.eatLikeUs }}</p>
      </div>
    </div>
    <div class="bench-telemetry">
      <a
        v-if="walk.url"
        class="bench-walk is-link"
        :href="walk.url"
        target="_blank"
        rel="noopener noreferrer"
        :aria-label="`Walking directions to ${card.name}`"
      >
        <span class="material-symbols-outlined" aria-hidden="true">directions_walk</span>
        {{ walk.label }}
      </a>
      <span v-else class="bench-walk">
        <span class="material-symbols-outlined" aria-hidden="true">directions_walk</span>
        {{ walk.label }}
      </span>
      <button v-if="selectable" type="button" class="bench-details" :aria-label="`Details for ${card.name}`" @click="emit('details')">
        Details
      </button>
      <span v-else-if="card.inspectionCount > 0" class="bench-count">
        {{ card.inspectionCount }} {{ card.inspectionCount === 1 ? 'Inspection' : 'Inspections' }}
      </span>
    </div>
  </article>
</template>
