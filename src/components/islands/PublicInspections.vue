<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { formatDate } from '@/lib/dates';
import { VERDICT_VOTE_LABELS, formatPence } from '@/lib/member-inspection-display';
import type { PublicInspectionsFeed } from '@/lib/member-inspections';

/**
 * "Recent inspections from the public" on a venue page (#137). The page is prerendered, so this
 * fetches the last five visible logs when it scrolls into view. Only rendered while the
 * `members` flag is on; the endpoint is public and makes no member or auth request. Names show
 * only for members who opted in.
 */
const props = defineProps<{ slug: string; venueName: string }>();

const feed = ref<PublicInspectionsFeed | null>(null);
const state = ref<'loading' | 'ready' | 'failed'>('loading');

onMounted(async () => {
  try {
    const response = await fetch(
      `/api/venues/${encodeURIComponent(props.slug)}/public-inspections`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!response.ok) throw new Error(String(response.status));
    feed.value = (await response.json()) as PublicInspectionsFeed;
    state.value = 'ready';
  } catch {
    state.value = 'failed';
  }
});

const stars = (count: number) => '★'.repeat(count) + '☆'.repeat(5 - count);
const badgeClass =
  'inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em]';
</script>

<template>
  <div class="space-y-3 font-sans" data-testid="public-inspections" :data-state="state">
    <p v-if="state === 'loading'" class="text-sm text-dim">Reading the public ledger…</p>
    <p v-else-if="state === 'failed'" class="text-sm text-dim">
      The public’s inspections couldn’t be loaded just now.
    </p>
    <template v-else-if="feed">
      <p v-if="feed.score !== null" class="text-sm text-graphite">
        The people’s score:
        <strong class="text-ink">{{ feed.score.toFixed(1) }} / 5</strong>
        from {{ feed.eligibleLogs }} eligible
        {{ feed.eligibleLogs === 1 ? 'inspection' : 'inspections' }}.
      </p>
      <div
        v-if="!feed.recent.length"
        class="p-6 text-center bg-ivory rounded-xl border border-dashed border-hairline text-sm text-dim"
      >
        No member has logged a lunch at {{ venueName }} yet.
      </div>
      <ul v-else class="space-y-3">
        <li
          v-for="(log, index) in feed.recent"
          :key="index"
          class="space-y-1.5 rounded-xl border border-hairline bg-surface px-4 py-3 shadow-xs"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="text-xs font-bold tabular-nums text-ink-soft">
              {{ formatDate(log.visitDate) }} · {{ log.displayName ?? 'A member' }}
            </span>
            <span class="flex flex-wrap gap-1.5">
              <span
                v-if="log.provisional"
                :class="[badgeClass, 'bg-neutral-wash text-graphite']"
                title="Their first visit here: it counts once they come back on another day."
                >Provisional</span
              >
              <span
                v-if="log.verifiedOnSite"
                :class="[badgeClass, 'bg-emerald-100 text-emerald-800']"
                >Verified on site</span
              >
              <span :class="[badgeClass, 'bg-ochre-wash text-navy']">{{
                VERDICT_VOTE_LABELS[log.verdictVote]
              }}</span>
            </span>
          </div>
          <p class="text-sm text-ink">
            {{ log.dish
            }}<template v-if="log.pricePaidPence !== null">
              · {{ formatPence(log.pricePaidPence) }}</template
            >
          </p>
          <p class="text-xs text-graphite">
            Food
            <span class="text-ochre" :aria-label="`${log.qualityScore} of 5`">{{
              stars(log.qualityScore)
            }}</span>
            · Value
            <span class="text-ochre" :aria-label="`${log.valueScore} of 5`">{{
              stars(log.valueScore)
            }}</span>
            · {{ log.wouldReturn ? 'Would go back' : 'Wouldn’t go back' }}
          </p>
          <p v-if="log.pullQuote" class="text-sm italic text-ink">“{{ log.pullQuote }}”</p>
        </li>
      </ul>
    </template>
  </div>
</template>
