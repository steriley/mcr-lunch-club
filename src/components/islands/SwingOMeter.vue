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
 * colours the verdict filter chips use. The page is prerendered with this section hidden, so the
 * island fetches the meter and reveals the section only once the venue has a quorum
 * (`SWING_QUORUM` members). Until then nothing shows here; "Recent inspections from the public"
 * carries the note that explains why. Only rendered while the `members` flag is on, for venues
 * that get a meter.
 */
const props = defineProps<{ slug: string }>();

const root = ref<HTMLElement | null>(null);

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
      // A quorum: reveal the section (the page renders it hidden).
      root.value?.closest('section')?.removeAttribute('hidden');
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

const SPARK_W = 200;
const SPARK_H = 40;
const sparkline = computed(() => {
  const body = swing.value;
  if (!body || body.history.length < 2) return null;
  // Anchored to today, so a history that has stopped growing drifts left instead of looking current.
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`).getTime();
  const points = body.history.map((point) => {
    const age = (today - new Date(`${point.day}T00:00:00Z`).getTime()) / 86_400_000;
    const x = Math.min(SPARK_W, Math.max(0, SPARK_W - (age / SWING_HISTORY_DAYS) * SPARK_W));
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
  <div ref="root" class="swing" data-testid="swing-o-meter" :data-state="state">
    <div
      v-if="swing?.quorate"
      class="swing-card rounded-xl border border-hairline bg-surface shadow-xs font-sans"
    >
      <div class="swing-head">
        <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p class="swing-headline text-ink" data-testid="swing-headline">
            {{ swing.headline?.text }}
          </p>
          <span
            class="rounded-full border border-hairline-strong px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-dim"
            >Unofficial</span
          >
        </div>
        <p class="mt-1 text-sm leading-snug text-graphite" data-testid="swing-explanation">
          {{ explanation }}
        </p>
      </div>

      <div class="swing-body">
        <div class="swing-captions" aria-hidden="true">
          <span
            v-for="segment in segments"
            :key="segment.band"
            class="swing-caption"
            :style="{ flexGrow: segment.width }"
          >
            <template v-if="isChairs(segment.band)"
              ><span class="swing-seal">C</span>Chairs’ verdict</template
            >
          </span>
        </div>
        <div class="swing-lane" :class="{ 'has-bar': swing.position !== null }">
          <div class="swing-track" role="img" :aria-label="swing.description ?? ''">
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
            </div>
          </div>
          <div
            v-if="swing.position !== null"
            class="swing-pin"
            :style="{ left: `${shown}%` }"
            data-testid="swing-bar"
            aria-hidden="true"
          >
            <span class="swing-bar"></span>
          </div>
          <span
            v-if="swing.position !== null"
            class="swing-pin-label"
            :style="{
              left: `clamp(1.75rem, ${shown}cqw, calc(100cqw - 1.75rem))`,
            }"
            aria-hidden="true"
            >People</span
          >
        </div>

        <p class="swing-counts text-sm text-graphite" data-testid="swing-counts">
          {{ swing.eligibleMembers }} members · {{ swing.eligibleLogs }}
          {{ swing.eligibleLogs === 1 ? 'log' : 'logs' }}{{ costNote }}
        </p>

        <div
          v-if="swing.eligibleLogs > 0"
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
      </div>

      <details v-if="sparkline" class="swing-history text-sm text-graphite">
        <summary>Last 90 days</summary>
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

      <p class="swing-foot text-xs text-dim">
        Unofficial: it takes no part in the Chairs’ verdict.
        <a class="swing-link" href="/the-count">See The Count</a>.
      </p>
    </div>
  </div>
</template>

<style scoped>
.swing-head {
  padding: 0.875rem 1rem 0.75rem;
}
.swing-headline {
  font-size: 1.0625rem;
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.01em;
}
.swing-body {
  padding: 0.25rem 1rem 0.875rem;
}
.swing-captions {
  display: flex;
  height: 1.25rem;
}
.swing-caption {
  flex-basis: 0;
  min-width: 0;
  display: flex;
  justify-content: center;
  align-items: flex-end;
  gap: 0.3rem;
  padding-bottom: 0.25rem;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1;
  color: var(--color-ink-soft);
  white-space: nowrap;
}
.swing-lane {
  position: relative;
  container-type: inline-size;
  margin-bottom: 0.25rem;
}
.swing-lane.has-bar {
  margin-bottom: 1.6rem;
}
.swing-track {
  position: relative;
  display: flex;
  height: 2.75rem;
  border-radius: 0.625rem;
  overflow: hidden;
  border: 1px solid var(--color-hairline-strong);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.12);
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
  box-shadow: inset 0 -3px 0 rgb(0 0 0 / 0.16);
}
.swing-segment + .swing-segment {
  border-left: 2px solid var(--color-surface);
}
.swing-segment.is-chairs {
  box-shadow:
    inset 0 0 0 2px var(--color-ink),
    inset 0 0 0 3px var(--color-surface),
    inset 0 -3px 0 3px rgb(0 0 0 / 0.16);
}
.swing-glyph {
  width: 0.9rem;
  height: 0.9rem;
  flex: none;
}
.swing-label {
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-right: 0.125rem;
}
.swing-seal {
  flex: none;
  width: 0.875rem;
  height: 0.875rem;
  border-radius: 9999px;
  background: var(--color-ink);
  color: var(--color-surface);
  font-size: 0.5625rem;
  font-weight: 800;
  line-height: 0.875rem;
  text-align: center;
  letter-spacing: 0;
}
.swing-pin {
  position: absolute;
  top: 0;
  bottom: -0.25rem;
  width: 0;
  display: flex;
  justify-content: center;
  pointer-events: none;
  transition: left 900ms cubic-bezier(0.22, 1, 0.36, 1);
}
.swing-bar {
  flex: none;
  width: 6px;
  border-radius: 3px;
  background: var(--color-ink);
  box-shadow:
    0 0 0 2px var(--color-surface),
    0 1px 4px rgb(0 0 0 / 0.4);
}
.swing-pin-label {
  position: absolute;
  top: calc(100% + 0.4rem);
  transform: translateX(-50%);
  padding: 0.125rem 0.45rem;
  border-radius: 9999px;
  background: var(--color-ink);
  color: var(--color-surface);
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  line-height: 1.2;
  white-space: nowrap;
  pointer-events: none;
  transition: left 900ms cubic-bezier(0.22, 1, 0.36, 1);
}
.swing-counts {
  margin-top: 0.125rem;
}
.swing-split {
  display: flex;
  gap: 2px;
  height: 0.375rem;
  margin-top: 0.625rem;
  border-radius: 9999px;
  overflow: hidden;
  background: var(--color-hairline);
}
.swing-split > span {
  display: block;
  height: 100%;
}
.swing-history {
  border-top: 1px solid var(--color-hairline);
  padding: 0.5rem 1rem;
}
.swing-history summary {
  cursor: pointer;
  border-radius: 0.25rem;
  font-weight: 600;
}
.swing-foot {
  border-top: 1px solid var(--color-hairline);
  padding: 0.625rem 1rem;
}
.swing-link {
  text-decoration: underline;
  text-underline-offset: 2px;
}
.swing-link:hover {
  color: var(--color-ink);
}
.swing-link:focus-visible,
.swing-history summary:focus-visible {
  outline: 2px solid var(--ledger-gold, var(--color-navy));
  outline-offset: 2px;
  border-radius: 0.25rem;
}
.swing-spark-band {
  fill: var(--color-hairline);
  opacity: 0.6;
}
@media (prefers-reduced-motion: reduce) {
  .swing-pin,
  .swing-pin-label {
    transition: none;
  }
}
</style>
