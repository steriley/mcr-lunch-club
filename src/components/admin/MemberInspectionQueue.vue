<script setup lang="ts">
import { computed, ref } from 'vue';
import { apiFetch } from '@/lib/api-fetch';
import { formatDate, formatDateTime } from '@/lib/dates';
import { HOLD_REASON_LABELS, VERDICT_VOTE_LABELS } from '@/lib/member-inspection-display';
import type { HeldLogView } from '@/lib/member-inspections';

/**
 * The Chairs' review queue for People's Inspections (#137): logs the anti-gaming checks held,
 * grouped by venue. Approve releases a log; remove takes it down with an internal reason; a
 * confirmed stuffing attempt removes the chosen logs and opens a bribery record for the venue.
 */
const props = defineProps<{ logs: HeldLogView[] }>();

const rows = ref<HeldLogView[]>(props.logs.map((log) => ({ ...log })));
const busy = ref<string | null>(null);
const removing = ref<{ id: string; reason: string } | null>(null);
const stuffing = ref<{
  venueId: string;
  ids: string[];
  title: string;
  description: string;
  published: boolean;
} | null>(null);
const message = ref('');
const errorMessage = ref('');
const fieldErrors = ref<Record<string, string>>({});

const groups = computed(() => {
  const byVenue = new Map<string, { venue: HeldLogView['venue']; logs: HeldLogView[] }>();
  for (const log of rows.value) {
    const group = byVenue.get(log.venue.id) ?? { venue: log.venue, logs: [] };
    group.logs.push(log);
    byVenue.set(log.venue.id, group);
  }
  return [...byVenue.values()];
});

function start() {
  message.value = '';
  errorMessage.value = '';
  fieldErrors.value = {};
}

function drop(ids: string[]) {
  rows.value = rows.value.filter((row) => !ids.includes(row.id));
}

async function approve(log: HeldLogView) {
  start();
  busy.value = log.id;
  const result = await apiFetch(
    `/api/admin/member-inspections/${encodeURIComponent(log.id)}/approve`,
    { method: 'POST', fallback: 'Unable to approve this log.' }
  );
  busy.value = null;
  if (!result.ok) {
    errorMessage.value = result.error;
    return;
  }
  drop([log.id]);
  message.value = `The log at ${log.venue.name} is visible again.`;
}

async function remove() {
  const target = removing.value;
  if (!target) return;
  start();
  busy.value = target.id;
  const result = await apiFetch(
    `/api/admin/member-inspections/${encodeURIComponent(target.id)}/remove`,
    { method: 'POST', body: { reason: target.reason }, fallback: 'Unable to remove this log.' }
  );
  busy.value = null;
  if (!result.ok) {
    errorMessage.value = result.error;
    fieldErrors.value = result.fields;
    return;
  }
  removing.value = null;
  drop([target.id]);
  message.value = 'Log removed. The reason stays with the Chairs.';
}

function openStuffing(group: { venue: HeldLogView['venue']; logs: HeldLogView[] }) {
  start();
  stuffing.value = {
    venueId: group.venue.id,
    ids: group.logs.map((log) => log.id),
    title: `Ledger stuffing at ${group.venue.name}`,
    description: '',
    published: false,
  };
}

async function recordStuffing() {
  const form = stuffing.value;
  if (!form) return;
  start();
  busy.value = form.venueId;
  const result = await apiFetch<{ briberyRecordId: string; removed: number }>(
    '/api/admin/member-inspections/stuffing',
    {
      method: 'POST',
      body: {
        venueId: form.venueId,
        inspectionIds: form.ids,
        title: form.title,
        description: form.description,
        published: form.published,
      },
      fallback: 'Unable to record the stuffing attempt.',
    }
  );
  busy.value = null;
  if (!result.ok) {
    errorMessage.value = result.error;
    fieldErrors.value = result.fields;
    return;
  }
  drop(form.ids);
  stuffing.value = null;
  message.value = `${result.data.removed === 1 ? 'One log' : `${result.data.removed} logs`} removed and a bribery record opened. Review it on the Bribery Records page.`;
}

const accountAge = (log: HeldLogView) => {
  const days = Math.floor(
    (new Date(log.createdAt).getTime() - new Date(log.memberJoinedAt).getTime()) / 86_400_000
  );
  return days < 1 ? 'joined that day' : `joined ${days} ${days === 1 ? 'day' : 'days'} before`;
};
const buttonClass =
  'whitespace-nowrap rounded-lg border border-hairline bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-linen disabled:opacity-60';
const inputClass =
  'w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-navy';
</script>

<template>
  <div class="space-y-6">
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
      v-if="!groups.length"
      class="rounded-2xl border border-hairline bg-parchment p-6 text-sm text-soot shadow-sm"
    >
      Nothing is waiting for review.
    </p>

    <section
      v-for="group in groups"
      :key="group.venue.id"
      class="space-y-4 rounded-2xl border border-hairline bg-parchment p-5 shadow-sm"
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-lg font-bold text-ink">
          <a :href="`/venues/${group.venue.slug}`" class="hover:underline">{{
            group.venue.name
          }}</a>
          <span class="ml-2 text-sm font-normal text-soot">{{ group.logs.length }} held</span>
        </h2>
        <button type="button" :class="buttonClass" @click="openStuffing(group)">
          Record a stuffing attempt
        </button>
      </div>

      <form
        v-if="stuffing?.venueId === group.venue.id"
        class="space-y-3 rounded-xl border border-hairline bg-surface p-4"
        @submit.prevent="recordStuffing"
      >
        <p class="text-sm text-soot">
          Removes the ticked logs and opens a bribery record for {{ group.venue.name }}.
        </p>
        <fieldset class="space-y-1">
          <legend class="text-sm font-semibold text-ink">Logs in the attempt</legend>
          <label v-for="log in group.logs" :key="log.id" class="flex items-center gap-2 text-sm">
            <input v-model="stuffing.ids" type="checkbox" :value="log.id" />
            {{ formatDate(log.visitDate) }} · {{ log.dish }} · {{ log.memberName ?? 'No name' }}
          </label>
        </fieldset>
        <label class="block text-sm font-semibold text-ink">
          Title
          <input v-model="stuffing.title" :class="inputClass" maxlength="200" />
          <span v-if="fieldErrors.title" class="block text-xs text-red-700">{{
            fieldErrors.title
          }}</span>
        </label>
        <label class="block text-sm font-semibold text-ink">
          What happened
          <textarea v-model="stuffing.description" rows="3" :class="inputClass" maxlength="5000" />
          <span v-if="fieldErrors.description" class="block text-xs text-red-700">{{
            fieldErrors.description
          }}</span>
        </label>
        <label class="flex items-center gap-2 text-sm text-ink">
          <input v-model="stuffing.published" type="checkbox" />
          Put it in the Hall of Shame at the next publish
        </label>
        <div class="flex gap-2">
          <button
            type="submit"
            :disabled="busy === group.venue.id || !stuffing.ids.length"
            class="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-60"
          >
            Remove logs and record
          </button>
          <button type="button" :class="buttonClass" @click="stuffing = null">Cancel</button>
        </div>
      </form>

      <article
        v-for="log in group.logs"
        :key="log.id"
        class="space-y-2 border-t border-hairline pt-3"
        data-testid="held-log"
      >
        <div class="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span class="font-semibold text-ink"
            >{{ formatDate(log.visitDate) }} · {{ log.memberName ?? 'No display name' }}</span
          >
          <span class="text-xs text-soot"
            >Saved {{ formatDateTime(log.createdAt) }} · {{ accountAge(log) }}</span
          >
        </div>
        <p v-if="log.heldReason" class="text-xs font-semibold text-amber-900">
          Held: {{ HOLD_REASON_LABELS[log.heldReason] }}
        </p>
        <p class="text-sm text-ink">
          {{ log.dish }} · {{ log.cost }} · {{ VERDICT_VOTE_LABELS[log.verdictVote] }}
          <template v-if="log.verifiedOnSite"> · verified on site</template>
        </p>
        <p v-if="log.pullQuote" class="text-sm italic text-ink">“{{ log.pullQuote }}”</p>

        <form
          v-if="removing?.id === log.id"
          class="flex flex-wrap items-end gap-2"
          @submit.prevent="remove"
        >
          <label class="block min-w-60 flex-1 text-xs font-semibold text-ink">
            Reason (internal)
            <input v-model="removing.reason" :class="inputClass" maxlength="500" />
            <span v-if="fieldErrors.reason" class="block text-xs text-red-700">{{
              fieldErrors.reason
            }}</span>
          </label>
          <button
            type="submit"
            :disabled="busy === log.id"
            class="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-60"
          >
            Remove
          </button>
          <button type="button" :class="buttonClass" @click="removing = null">Cancel</button>
        </form>
        <div v-else class="flex gap-2">
          <button
            type="button"
            :class="buttonClass"
            :disabled="busy === log.id"
            @click="approve(log)"
          >
            Approve
          </button>
          <button
            type="button"
            :class="buttonClass"
            :disabled="busy === log.id"
            @click="removing = { id: log.id, reason: '' }"
          >
            Remove…
          </button>
        </div>
      </article>
    </section>
  </div>
</template>
