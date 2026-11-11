<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { VERDICT_VOTE_LABELS, VERDICT_VOTE_TIERS } from '@/lib/member-inspection-display';
import {
  SWING_BANDS,
  SWING_HISTORY_DAYS,
  bandCentre,
  bandLabel,
  STRAW_POLL_ANCHOR,
  type SwingBand,
  type VenueSwing,
} from '@/lib/swing';
import { tierInfo } from '@/lib/tiers';

/**
 * The People's Verdict on a venue page (#138): a compact row of the three tier colours with a
 * sliding bar that moves from the Chairs' band to the People's score. The segments use the tier
 * colours the verdict filter chips use. The page is prerendered, so this fetches the meter when it
 * scrolls into view. Only rendered while the `members` flag is on, for venues that get a meter.
 */
const props = defineProps<{ slug: string; venueName: string; canLog: boolean }>();

const swing = ref<VenueSwing | null>(null);
const state = ref<'loading' | 'ready' | 'failed'>('loading');
/** Where the bar is drawn: starts at the Chairs' band and moves to the score. */
const shown = ref<number>(STRAW_POLL_ANCHOR);

const BAND_TIERS = {
  rejected: 'rejected',
  if_we_must: 'if_we_must',
  approved: 'approved',
} as const;
const segments = SWING_BANDS.map(({ band, min, max }) => ({
  band,
  width: max - min,
  label: bandLabel(band),
  color: tierInfo(BAND_TIERS[band]).color,
  glyph: tierInfo(BAND_TIERS[band]).glyph,
}));

onMounted(async () => {
  try {
    const response = await fetch(`/api/public/venues/${encodeURIComponent(props.slug)}/swing`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(String(response.status));
    const body = (await response.json()) as VenueSwing;
    const start = body.chairsBand ? bandCentre(body.chairsBand) : STRAW_POLL_ANCHOR;
    shown.value = start;
    swing.value = body;
    state.value = 'ready';
    if (body.position !== null) {
      // Draw the bar at the Chairs' band first, then let the CSS transition slide it across.
      // Under prefers-reduced-motion the transition is off, so it simply appears there.
      await nextTick();
      requestAnimationFrame(() => {
        shown.value = body.position!;
      });
    }
  } catch {
    state.value = 'failed';
  }
});

const isChairs = (band: SwingBand) => swing.value?.chairsBand === band;

const verdictShares = computed(() => {
  const body = swing.value;
  if (!body) return [];
  const total = body.eligibleLogs || 1;
  return (['approve', 'if_we_must', 'reject'] as const).map((vote) => ({
    vote,
    count: body.verdictCounts[vote],
    percent: (body.verdictCounts[vote] / total) * 100,
    label: VERDICT_VOTE_LABELS[vote],
    color: tierInfo(VERDICT_VOTE_TIERS[vote]).color,
  }));
});

const dots = computed(() =>
  Array.from({ length: swing.value?.quorum ?? 0 }, (_, index) => ({
    on: index < (swing.value?.eligibleMembers ?? 0),
  }))
);

const SPARK_W = 200;
const SPARK_H = 40;
const sparkline = computed(() => {
  const body = swing.value;
  if (!body || body.history.length < 2) return null;
  const last = new Date(`${body.history[body.history.length - 1].day}T00:00:00Z`).getTime();
  const points = body.history.map((point) => {
    const age = (last - new Date(`${point.day}T00:00:00Z`).getTime()) / 86_400_000;
    const x = SPARK_W - (age / SWING_HISTORY_DAYS) * SPARK_W;
    const y = SPARK_H - (point.position / 100) * SPARK_H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const band = SWING_BANDS.find((entry) => entry.band === body.chairsBand);
  return {
    line: points.join(' '),
    band: band
      ? {
          y: SPARK_H - (band.max / 100) * SPARK_H,
          height: ((band.max - band.min) / 100) * SPARK_H,
        }
      : null,
  };
});

/** One line under the headline: what the meter indicates, and that the Chairs still decide. */
const explanation = computed(() => {
  const body = swing.value;
  if (!body) return '';
  if (!body.quorate) {
    return `Shown once ${body.quorum} members have each logged a lunch here on two different days. It sets what members think against the Chairs’ verdict.`;
  }
  if (body.chairsBand === null) {
    return 'Where members’ own lunch logs would put this venue. The Chairs haven’t decided it yet.';
  }
  return 'Where members’ own lunch logs put this venue, set against the Chairs’ verdict. A guide, not a ruling: the Chairs decide.';
});

const costNote = computed(() =>
  swing.value?.typicalCost ? ` · typically ${swing.value.typicalCost}` : ''
);
</script>

<template>
  <div class="swing" data-testid="swing-o-meter" :data-state="state">
    <p v-if="state === 'loading'" class="text-sm text-dim font-sans">Counting the votes…</p>
    <p v-else-if="state === 'failed'" class="text-sm text-dim font-sans">
      The People’s Verdict couldn’t be read just now.
    </p>
    <div v-else-if="swing" class="space-y-3 font-sans">
      <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p class="text-base font-bold text-ink" data-testid="swing-headline">
          <template v-if="swing.headline">{{ swing.headline.text }}</template>
          <template v-else>Polls Open</template>
        </p>
        <span
          class="rounded-full border border-hairline px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-dim"
          >Unofficial</span
        >
      </div>
      <p class="text-sm text-graphite" data-testid="swing-explanation">{{ explanation }}</p>

      <div class="py-0.5">
        <div
          class="swing-track"
          :class="{ 'is-muted': !swing.quorate }"
          role="img"
          :aria-label="
            swing.description ??
            `Polls open at ${venueName}: ${swing.eligibleMembers} of ${swing.quorum} members needed.`
          "
        >
          <div
            v-for="segment in segments"
            :key="segment.band"
            class="swing-segment"
            :class="{ 'is-chairs': isChairs(segment.band) }"
            :style="{ flexGrow: segment.width, '--band': segment.color }"
          >
            <svg
              class="swing-glyph"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path :d="segment.glyph" />
            </svg>
            <span class="swing-label">{{ segment.label }}</span>
            <span v-if="isChairs(segment.band)" class="swing-seal" title="The Chairs’ verdict"
              >C</span
            >
          </div>
          <div
            v-if="swing.position !== null"
            class="swing-bar"
            :style="{ left: `${shown}%` }"
            data-testid="swing-bar"
          ></div>
        </div>
      </div>

      <p class="text-sm text-graphite" data-testid="swing-counts">
        <template v-if="swing.quorate">
          {{ swing.eligibleMembers }} members · {{ swing.eligibleLogs }}
          {{ swing.eligibleLogs === 1 ? 'log' : 'logs' }}{{ costNote }}
        </template>
        <template v-else>
          <span class="inline-flex items-center gap-1 align-middle" aria-hidden="true">
            <span
              v-for="(dot, index) in dots"
              :key="index"
              class="size-2 rounded-full border border-dim"
              :class="dot.on ? 'bg-ink' : 'bg-transparent'"
            ></span>
          </span>
          {{ swing.eligibleMembers }} of {{ swing.quorum }} members so far.
          <a v-if="canLog" class="underline" :href="`/log/${encodeURIComponent(slug)}`"
            >Log a visit</a
          >
        </template>
      </p>

      <div
        v-if="swing.quorate && swing.eligibleLogs > 0"
        class="swing-split"
        role="img"
        :aria-label="
          verdictShares.map((share) => `${share.count} ${share.label.toLowerCase()}`).join(', ')
        "
      >
        <span
          v-for="share in verdictShares"
          :key="share.vote"
          :style="{ width: `${share.percent}%`, background: share.color }"
        ></span>
      </div>

      <details v-if="sparkline" class="text-sm text-graphite">
        <summary class="cursor-pointer">Last 90 days</summary>
        <svg
          class="mt-2 w-full h-10"
          :viewBox="`0 0 ${SPARK_W} ${SPARK_H}`"
          preserveAspectRatio="none"
          role="img"
          aria-label="The People’s score over the last 90 days"
        >
          <rect
            v-if="sparkline.band"
            x="0"
            :y="sparkline.band.y"
            :width="SPARK_W"
            :height="sparkline.band.height"
            class="swing-spark-band"
          />
          <polyline
            :points="sparkline.line"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            vector-effect="non-scaling-stroke"
          />
        </svg>
      </details>

      <p class="text-xs text-dim">
        Unofficial: it takes no part in the Chairs’ verdict.
        <a class="underline" href="/the-count">See The Count</a>.
      </p>
    </div>
  </div>
</template>

<style scoped>
.swing-track {
  position: relative;
  display: flex;
  height: 2.5rem;
  border-radius: 0.5rem;
  border: 1px solid var(--color-hairline);
}
.swing-segment:first-child {
  border-radius: 0.5rem 0 0 0.5rem;
}
.swing-segment:last-child {
  border-radius: 0 0.5rem 0.5rem 0;
}
.swing-track.is-muted {
  opacity: 0.55;
}
.swing-segment {
  flex-basis: 0;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  gap: 0.3rem;
  background: var(--band);
  color: var(--color-parchment-fixed);
}
.swing-segment + .swing-segment {
  border-left: 1px solid var(--color-hairline);
}
.swing-segment.is-chairs {
  box-shadow: inset 0 0 0 2px var(--color-ink);
}
.swing-glyph {
  width: 0.85rem;
  height: 0.85rem;
  flex: none;
}
.swing-label {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0 0.25rem;
}
.swing-seal {
  position: absolute;
  top: 2px;
  left: 3px;
  width: 1rem;
  height: 1rem;
  border-radius: 9999px;
  background: var(--color-surface);
  color: var(--color-ink);
  font-size: 0.6rem;
  font-weight: 800;
  line-height: 1rem;
  text-align: center;
}
.swing-bar {
  position: absolute;
  top: -2px;
  bottom: -2px;
  width: 6px;
  margin-left: -3px;
  border-radius: 3px;
  background: var(--color-ink);
  box-shadow:
    0 0 0 2px var(--color-surface),
    0 1px 4px rgb(0 0 0 / 0.4);
  transition: left 900ms cubic-bezier(0.22, 1, 0.36, 1);
}
.swing-split {
  display: flex;
  height: 0.375rem;
  border-radius: 9999px;
  overflow: hidden;
  background: var(--color-hairline);
}
.swing-split > span {
  display: block;
  height: 100%;
}
.swing-spark-band {
  fill: var(--color-hairline);
  opacity: 0.6;
}
@media (prefers-reduced-motion: reduce) {
  .swing-bar {
    transition: none;
  }
}
</style>
