<script setup lang="ts">
import { ref } from 'vue';
import { apiFetch } from '@/lib/api-fetch';
import { formatDate, formatDateTime } from '@/lib/dates';
import { VERDICT_VOTE_LABELS, formatPence } from '@/lib/member-inspection-display';
import type { MemberInspectionView } from '@/lib/member-inspections';

/**
 * The member's own lunch logs (#137), newest first: what the public sees of each, whether it
 * counts yet (the Two-Visit Rule), and edit or delete for 24 hours after saving.
 */
const props = defineProps<{ logs: MemberInspectionView[] }>();

const rows = ref<MemberInspectionView[]>(props.logs.map((log) => ({ ...log })));
const busy = ref<string | null>(null);
const confirming = ref<string | null>(null);
const message = ref('');
const errorMessage = ref('');

async function remove(log: MemberInspectionView) {
  confirming.value = null;
  message.value = '';
  errorMessage.value = '';
  busy.value = log.id;
  const result = await apiFetch(`/api/member/inspections/${encodeURIComponent(log.id)}`, {
    method: 'DELETE',
    fallback: 'Unable to delete this lunch.',
  });
  busy.value = null;
  if (!result.ok) {
    errorMessage.value = result.error;
    return;
  }
  rows.value = rows.value.filter((row) => row.id !== log.id);
  message.value = `Your lunch at ${log.venue.name} is deleted.`;
}

const stars = (count: number) => '★'.repeat(count) + '☆'.repeat(5 - count);
const badgeClass =
  'inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]';
const buttonClass =
  'inline-flex min-h-11 items-center rounded-lg border border-hairline bg-surface px-4 text-sm font-semibold text-ink hover:bg-linen disabled:opacity-60';
</script>

<template>
  <div class="space-y-4" data-testid="member-inspection-history">
    <p
      v-if="message"
      role="status"
      class="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
    >
      {{ message }}
    </p>
    <p
      v-if="errorMessage"
      role="alert"
      class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {{ errorMessage }}
    </p>

    <p
      v-if="!rows.length"
      class="rounded-2xl border border-hairline bg-parchment p-6 text-sm text-soot shadow-sm"
    >
      You haven’t logged a lunch yet.
      <a href="/log" class="font-semibold text-navy hover:underline">Log your first one</a>.
    </p>

    <article
      v-for="log in rows"
      :key="log.id"
      class="space-y-3 rounded-2xl border border-hairline bg-parchment p-5 shadow-sm"
      data-testid="member-inspection"
    >
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 class="text-lg font-bold text-ink">
            <a :href="`/venues/${log.venue.slug}`" class="hover:underline">{{ log.venue.name }}</a>
          </h2>
          <p class="text-sm text-soot">{{ formatDate(log.visitDate) }} · {{ log.dish }}</p>
        </div>
        <div class="flex flex-wrap gap-1.5">
          <span v-if="log.status === 'held'" :class="[badgeClass, 'bg-amber-100 text-amber-900']"
            >Under review</span
          >
          <span v-if="log.status === 'removed'" :class="[badgeClass, 'bg-red-100 text-red-800']"
            >Removed by the Chairs</span
          >
          <span
            v-if="log.provisional"
            :class="[badgeClass, 'bg-neutral-wash text-graphite']"
            title="Log another lunch here on a different day and both count."
            >Provisional</span
          >
          <span v-if="log.verifiedOnSite" :class="[badgeClass, 'bg-emerald-100 text-emerald-800']"
            >Verified on site</span
          >
        </div>
      </div>

      <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
        <div>
          <dt class="text-soot">Food</dt>
          <dd class="text-ochre" :aria-label="`${log.qualityScore} of 5`">
            {{ stars(log.qualityScore) }}
          </dd>
        </div>
        <div>
          <dt class="text-soot">Value</dt>
          <dd class="text-ochre" :aria-label="`${log.valueScore} of 5`">
            {{ stars(log.valueScore) }}
          </dd>
        </div>
        <div>
          <dt class="text-soot">Verdict</dt>
          <dd class="font-semibold text-ink">{{ VERDICT_VOTE_LABELS[log.verdictVote] }}</dd>
        </div>
        <div>
          <dt class="text-soot">Go back?</dt>
          <dd class="font-semibold text-ink">
            {{ log.wouldReturn ? 'Yes' : 'No'
            }}{{ log.pricePaidPence !== null ? ` · ${formatPence(log.pricePaidPence)}` : '' }}
          </dd>
        </div>
      </dl>
      <p v-if="log.pullQuote" class="italic text-ink">“{{ log.pullQuote }}”</p>

      <div
        v-if="log.canEdit"
        class="flex flex-wrap items-center gap-3 border-t border-hairline pt-3"
      >
        <a :href="`/members/me/inspections/${log.id}`" :class="buttonClass">Edit</a>
        <button
          v-if="confirming !== log.id"
          type="button"
          :class="buttonClass"
          :disabled="busy === log.id"
          @click="confirming = log.id"
        >
          Delete
        </button>
        <template v-else>
          <button
            type="button"
            class="inline-flex min-h-11 items-center rounded-lg bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
            :disabled="busy === log.id"
            @click="remove(log)"
          >
            {{ busy === log.id ? 'Deleting…' : 'Yes, delete it' }}
          </button>
          <button type="button" :class="buttonClass" @click="confirming = null">Keep it</button>
        </template>
        <span class="text-xs text-soot">Until {{ formatDateTime(log.editableUntil) }}</span>
      </div>
    </article>
  </div>
</template>
