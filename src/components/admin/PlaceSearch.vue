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

function pick(candidate: PlaceCandidate) {
  emit('pick', candidate);
  results.value = [];
  status.value = 'idle';
}

const inputClass =
  'w-full rounded-lg border border-hairline bg-surface px-3 py-2.5 text-base text-ink outline-none focus:border-navy focus-visible:ring-2 focus-visible:ring-navy/30';
</script>

<template>
  <div class="space-y-2">
    <label class="block text-sm font-semibold text-ink">
      <span class="mb-2 block">Find the venue</span>
      <input
        v-model="query"
        type="search"
        autocomplete="off"
        :class="inputClass"
        placeholder="Venue name or address, e.g. Crazy Pedro's Bridge Street"
      />
    </label>
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
    <ul
      v-if="results.length"
      class="divide-y divide-sand overflow-hidden rounded-lg border border-hairline bg-surface"
      aria-label="Search results"
    >
      <li
        v-for="candidate in results"
        :key="`${candidate.lat},${candidate.lng},${candidate.label}`"
      >
        <button
          type="button"
          class="block w-full px-3 py-2 text-left text-sm hover:bg-linen focus:bg-linen focus:outline-none"
          @click="pick(candidate)"
        >
          <span class="block font-semibold text-ink">{{ candidate.label }}</span>
          <span class="block text-xs text-graphite"
            >{{ candidate.address }} · {{ candidate.lat.toFixed(5) }},
            {{ candidate.lng.toFixed(5) }}</span
          >
        </button>
      </li>
    </ul>
  </div>
</template>
