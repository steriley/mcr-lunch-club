<script setup lang="ts">
import { ref } from 'vue';
import ConfirmDialog from './ConfirmDialog.vue';
import { formatDateTime } from '@/lib/dates';
import { apiFetch, type ApiFetchOptions } from '@/lib/api-fetch';
import type { SerializedSuggestion } from '@/lib/suggestions';

const props = defineProps<{ suggestions: SerializedSuggestion[] }>();

const rows = ref<SerializedSuggestion[]>(
  props.suggestions.map((suggestion) => ({ ...suggestion }))
);
const busy = ref<Record<string, boolean>>({});
const pendingDelete = ref<SerializedSuggestion | null>(null);
const message = ref('');
const errorMessage = ref('');

async function run(suggestion: SerializedSuggestion, options: ApiFetchOptions): Promise<boolean> {
  message.value = '';
  errorMessage.value = '';
  busy.value[suggestion.id] = true;
  const result = await apiFetch(`/api/admin/suggestions/${suggestion.id}`, options);
  busy.value[suggestion.id] = false;
  if (!result.ok) errorMessage.value = result.error;
  return result.ok;
}

async function setStatus(suggestion: SerializedSuggestion, status: 'new' | 'dismissed') {
  if (
    !(await run(suggestion, {
      method: 'PATCH',
      body: { status },
      fallback: 'Could not update the suggestion.',
    }))
  )
    return;
  rows.value = rows.value.filter((row) => row.id !== suggestion.id);
  message.value =
    status === 'dismissed'
      ? `“${suggestion.name}” dismissed.`
      : `“${suggestion.name}” moved back to the inbox.`;
}

async function performDelete() {
  const suggestion = pendingDelete.value;
  pendingDelete.value = null;
  if (!suggestion) return;
  if (!(await run(suggestion, { method: 'DELETE', fallback: 'Could not delete the suggestion.' })))
    return;
  rows.value = rows.value.filter((row) => row.id !== suggestion.id);
  message.value = 'Suggestion deleted.';
}
</script>

<template>
  <div class="space-y-4">
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
      class="rounded-2xl border border-hairline bg-parchment px-4 py-10 text-center text-sm text-soot"
    >
      Nothing here. The petition box is empty.
    </p>

    <ul v-else class="space-y-4">
      <li
        v-for="suggestion in rows"
        :key="suggestion.id"
        class="rounded-2xl border border-hairline bg-parchment p-5 shadow-sm"
      >
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div class="min-w-0">
            <h2 class="text-xl font-bold text-ink">{{ suggestion.name }}</h2>
            <p class="mt-1 text-sm text-soot">
              {{ suggestion.address }}
              <template v-if="suggestion.cuisine"> · {{ suggestion.cuisine }}</template>
              <template v-if="suggestion.cost"> · {{ suggestion.cost }}</template>
            </p>
            <p class="mt-1 text-xs text-graphite">
              {{ suggestion.submitterName || 'Anonymous member' }} ·
              {{ formatDateTime(suggestion.createdAt) }}
            </p>
          </div>
          <div class="flex shrink-0 flex-wrap gap-2">
            <a
              v-if="suggestion.venueId"
              :href="`/admin/venues/${suggestion.venueId}`"
              class="rounded-lg border border-hairline bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-linen"
            >
              Open venue
            </a>
            <template v-else>
              <!-- Accepting goes through the venue form: a real location must be picked, and the result is a hidden
                   venue with a To Be Assessed proposal for a different admin to approve. Leaving the form changes nothing. -->
              <a
                v-if="suggestion.status !== 'dismissed'"
                :href="`/admin/venues/new?fromSuggestion=${suggestion.id}`"
                class="rounded-lg bg-navy-fixed px-3 py-1.5 text-xs font-semibold text-white hover:bg-deep"
              >
                Accept…
              </a>
              <button
                type="button"
                class="rounded-lg border border-hairline bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-linen disabled:opacity-60"
                :disabled="busy[suggestion.id]"
                @click="
                  setStatus(suggestion, suggestion.status === 'dismissed' ? 'new' : 'dismissed')
                "
              >
                {{ suggestion.status === 'dismissed' ? 'Restore' : 'Dismiss' }}
              </button>
            </template>
            <button
              type="button"
              class="rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-white hover:bg-danger-strong disabled:opacity-60"
              :disabled="busy[suggestion.id]"
              @click="pendingDelete = suggestion"
            >
              Delete
            </button>
          </div>
        </div>

        <dl class="mt-4 space-y-2 text-sm text-coal">
          <div v-if="suggestion.recommendedOrder">
            <dt class="text-xs font-bold uppercase tracking-[0.14em] text-ochre">
              Recommended order
            </dt>
            <dd class="mt-0.5">{{ suggestion.recommendedOrder }}</dd>
          </div>
          <div>
            <dt class="text-xs font-bold uppercase tracking-[0.14em] text-ochre">Why</dt>
            <dd class="mt-0.5 whitespace-pre-line">{{ suggestion.rationale }}</dd>
          </div>
        </dl>
      </li>
    </ul>

    <ConfirmDialog
      :open="Boolean(pendingDelete)"
      title="Delete suggestion"
      :message="`Delete the suggestion for “${pendingDelete?.name || 'this venue'}” permanently?`"
      confirm-label="Delete suggestion"
      @cancel="pendingDelete = null"
      @confirm="performDelete"
    />
  </div>
</template>
