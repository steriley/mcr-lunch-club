<script lang="ts">
/** A place from GET /api/admin/geocode (OpenRouteService, biased to Greater Manchester). */
export interface PlaceCandidate {
  label: string;
  address: string;
  lat: number;
  lng: number;
}
</script>

<script setup lang="ts">
import {
  ComboboxAnchor,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxRoot,
} from 'reka-ui';
import { onBeforeUnmount, ref, watch } from 'vue';
import { apiFetch } from '@/lib/api-fetch';

const props = defineProps<{ initialQuery?: string }>();
const emit = defineEmits<{ pick: [candidate: PlaceCandidate] }>();

const MIN_LENGTH = 3;
const DEBOUNCE_MS = 350;

const query = ref(props.initialQuery ?? '');
const results = ref<PlaceCandidate[]>([]);
const status = ref<'idle' | 'loading' | 'done' | 'error'>('idle');
const errorMessage = ref('');
const open = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;
let controller: AbortController | undefined;

async function search(text: string) {
  controller?.abort();
  controller = new AbortController();
  status.value = 'loading';
  errorMessage.value = '';
  let result;
  try {
    result = await apiFetch<{ results?: PlaceCandidate[] }>(
      `/api/admin/geocode?q=${encodeURIComponent(text)}`,
      {
        signal: controller.signal,
        fallback: 'Location search failed. Enter the location manually instead.',
      }
    );
  } catch {
    return; // Aborted: a newer search replaced this one.
  }
  if (!result.ok) {
    results.value = [];
    status.value = 'error';
    errorMessage.value = result.error;
    return;
  }
  results.value = result.data.results ?? [];
  status.value = 'done';
  open.value = results.value.length > 0;
}

watch(
  query,
  (value) => {
    clearTimeout(timer);
    const text = value.trim();
    if (text.length < MIN_LENGTH) {
      controller?.abort();
      results.value = [];
      status.value = 'idle';
      open.value = false;
      return;
    }
    timer = setTimeout(() => {
      void search(text);
    }, DEBOUNCE_MS);
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  clearTimeout(timer);
  controller?.abort();
});

// The query stays as typed (resetSearchTermOnSelect is off); the list closes and empties.
function pick(candidate: unknown) {
  if (!candidate) return;
  emit('pick', candidate as PlaceCandidate);
  results.value = [];
  status.value = 'idle';
  open.value = false;
}

const inputClass =
  'w-full rounded-lg border border-hairline bg-surface px-3 py-2.5 text-base text-ink outline-none focus:border-navy focus-visible:ring-2 focus-visible:ring-navy/30';
</script>

<template>
  <div class="space-y-2">
    <!-- Plain text, not type=search: Chrome clears a search field on Escape, and here Escape only closes the list.
         The server does the matching (ignore-filter); Reka supplies the combobox roles, arrow keys,
         Enter to pick and Escape to close. The list renders in place, not in a floating layer, and
         without ComboboxViewport, which injects a <style> element that the CSP blocks. -->
    <ComboboxRoot
      :open="open && results.length > 0"
      :model-value="null"
      ignore-filter
      :reset-search-term-on-select="false"
      :reset-search-term-on-blur="false"
      @update:open="open = $event"
      @update:model-value="pick"
    >
      <label class="block text-sm font-semibold text-ink">
        <span class="mb-2 block">Find the venue</span>
        <ComboboxAnchor>
          <ComboboxInput
            v-model="query"
            type="text"
            inputmode="search"
            enterkeyhint="search"
            autocomplete="off"
            :class="inputClass"
            placeholder="Venue name or address, e.g. Crazy Pedro's Bridge Street"
          />
        </ComboboxAnchor>
      </label>
      <ComboboxContent
        class="mt-2 divide-y divide-sand overflow-hidden rounded-lg border border-hairline bg-surface"
        aria-label="Search results"
      >
        <ComboboxItem
          v-for="candidate in results"
          :key="`${candidate.lat},${candidate.lng},${candidate.label}`"
          :value="candidate"
          class="block w-full cursor-pointer px-3 py-2 text-left text-sm outline-none data-[highlighted]:bg-linen"
        >
          <span class="block font-semibold text-ink">{{ candidate.label }}</span>
          <span class="block text-xs text-graphite"
            >{{ candidate.address }} · {{ candidate.lat.toFixed(5) }},
            {{ candidate.lng.toFixed(5) }}</span
          >
        </ComboboxItem>
      </ComboboxContent>
    </ComboboxRoot>
    <p v-if="status === 'idle' && query.trim().length < MIN_LENGTH" class="text-xs text-graphite">
      Type at least {{ MIN_LENGTH }} characters. Results are limited to Greater Manchester.
    </p>
    <p v-if="status === 'loading'" role="status" class="text-xs text-graphite">Searching…</p>
    <p
      v-if="status === 'error'"
      role="alert"
      class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
    >
      {{ errorMessage }}
    </p>
    <p v-if="status === 'done' && !results.length" role="status" class="text-sm text-graphite">
      No matches. Try another spelling, or enter the location manually.
    </p>
  </div>
</template>
