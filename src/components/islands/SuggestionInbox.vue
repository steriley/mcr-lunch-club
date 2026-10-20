<script setup lang="ts">
import { ref } from 'vue';
import ConfirmDialog from './ConfirmDialog.vue';
import type { SuggestionStatus } from '@/lib/suggestion-schema';

interface SuggestionItem {
  id: string;
  name: string;
  address: string;
  cuisine: string | null;
  cost: string | null;
  recommendedOrder: string | null;
  rationale: string;
  submitterName: string | null;
  status: SuggestionStatus;
  venueId: string | null;
  createdAt: string;
}

const props = defineProps<{ suggestions: SuggestionItem[] }>();

const rows = ref<SuggestionItem[]>(props.suggestions.map((suggestion) => ({ ...suggestion })));
const busy = ref<Record<string, boolean>>({});
const pendingDelete = ref<SuggestionItem | null>(null);
const message = ref('');
const errorMessage = ref('');

function formatWhen(value: string) {
  return new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London' });
}

async function run(suggestion: SuggestionItem, action: () => Promise<Response>, failure: string) {
  message.value = '';
  errorMessage.value = '';
  busy.value[suggestion.id] = true;
  try {
    const response = await action();
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      errorMessage.value = body?.error || failure;
      return null;
    }
    return response;
  } catch {
    errorMessage.value = failure;
    return null;
  } finally {
    busy.value[suggestion.id] = false;
  }
}

async function setStatus(suggestion: SuggestionItem, status: 'new' | 'dismissed') {
  const response = await run(
    suggestion,
    () =>
      fetch(`/api/admin/suggestions/${suggestion.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      }),
    'Could not update the suggestion.'
  );
  if (!response) return;
  rows.value = rows.value.filter((row) => row.id !== suggestion.id);
  message.value = status === 'dismissed' ? `“${suggestion.name}” dismissed.` : `“${suggestion.name}” moved back to the inbox.`;
}

async function performDelete() {
  const suggestion = pendingDelete.value;
  pendingDelete.value = null;
  if (!suggestion) return;
  const response = await run(
    suggestion,
    () => fetch(`/api/admin/suggestions/${suggestion.id}`, { method: 'DELETE' }),
    'Could not delete the suggestion.'
  );
  if (!response) return;
  rows.value = rows.value.filter((row) => row.id !== suggestion.id);
  message.value = 'Suggestion deleted.';
}
</script>

<template>
  <div class="space-y-4">
    <p v-if="message" role="status" class="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ message }}</p>
    <p v-if="errorMessage" role="alert" class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{{ errorMessage }}</p>

    <p v-if="!rows.length" class="rounded-2xl border border-[#d9cfb8] bg-[#f9f7f1] px-4 py-10 text-center text-sm text-[#3d3d3d]">
      Nothing here. The petition box is empty.
    </p>

    <ul v-else class="space-y-4">
      <li v-for="suggestion in rows" :key="suggestion.id" class="rounded-2xl border border-[#d9cfb8] bg-[#f9f7f1] p-5 shadow-sm">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div class="min-w-0">
            <h2 class="text-xl font-bold text-[#1a1e24]">{{ suggestion.name }}</h2>
            <p class="mt-1 text-sm text-[#3d3d3d]">
              {{ suggestion.address }}
              <template v-if="suggestion.cuisine"> · {{ suggestion.cuisine }}</template>
              <template v-if="suggestion.cost"> · {{ suggestion.cost }}</template>
            </p>
            <p class="mt-1 text-xs text-[#535353]">
              {{ suggestion.submitterName || 'Anonymous member' }} · {{ formatWhen(suggestion.createdAt) }}
            </p>
          </div>
          <div class="flex shrink-0 flex-wrap gap-2">
            <a
              v-if="suggestion.venueId"
              :href="`/admin/venues/${suggestion.venueId}`"
              class="rounded-lg border border-[#d9cfb8] bg-white px-3 py-1.5 text-xs font-semibold text-[#1a1e24] hover:bg-[#f5efe5]"
            >
              Open venue
            </a>
            <template v-else>
              <!-- Accepting goes through the venue form: a real location must be picked, and the result is a hidden
                   venue with a To Be Assessed proposal for a different admin to approve. Leaving the form changes nothing. -->
              <a
                v-if="suggestion.status !== 'dismissed'"
                :href="`/admin/venues/new?fromSuggestion=${suggestion.id}`"
                class="rounded-lg bg-[#1B2F6B] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#111E47]"
              >
                Accept…
              </a>
              <button
                type="button"
                class="rounded-lg border border-[#d9cfb8] bg-white px-3 py-1.5 text-xs font-semibold text-[#1a1e24] hover:bg-[#f5efe5] disabled:opacity-60"
                :disabled="busy[suggestion.id]"
                @click="setStatus(suggestion, suggestion.status === 'dismissed' ? 'new' : 'dismissed')"
              >
                {{ suggestion.status === 'dismissed' ? 'Restore' : 'Dismiss' }}
              </button>
            </template>
            <button
              type="button"
              class="rounded-lg bg-[#B92B27] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#8e201d] disabled:opacity-60"
              :disabled="busy[suggestion.id]"
              @click="pendingDelete = suggestion"
            >
              Delete
            </button>
          </div>
        </div>

        <dl class="mt-4 space-y-2 text-sm text-[#2d2d2d]">
          <div v-if="suggestion.recommendedOrder">
            <dt class="text-xs font-bold uppercase tracking-[0.14em] text-[#8a5100]">Recommended order</dt>
            <dd class="mt-0.5">{{ suggestion.recommendedOrder }}</dd>
          </div>
          <div>
            <dt class="text-xs font-bold uppercase tracking-[0.14em] text-[#8a5100]">Why</dt>
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
