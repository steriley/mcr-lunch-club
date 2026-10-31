<script setup lang="ts">
import { useStore } from '@nanostores/vue';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { apiFetch } from '@/lib/api-fetch';
import type { PublishStatus } from '@/lib/publishing';
import { $unpublishedChanges } from '@/stores/publish';

/**
 * The "unpublished changes" bar across the Chairs' Area (#100). Publishing
 * actions queue a change instead of rebuilding; this shows what is waiting and
 * publishes it all in one go. It updates when any admin response reports the
 * count (src/lib/api-fetch.ts), and polls while a publish is under way.
 */
const props = defineProps<{ initial: PublishStatus }>();

const POLL_MS = 15_000;
const POLL_LIMIT_MS = 5 * 60_000;

const status = ref<PublishStatus>(props.initial);
const busy = ref(false);
const errorMessage = ref('');
const open = ref(false);

async function refresh() {
  const result = await apiFetch<PublishStatus>('/api/admin/publish', {
    fallback: 'Could not check the publish status.',
  });
  if (result.ok) status.value = result.data;
}

const reported = useStore($unpublishedChanges);
watch(reported, (value) => {
  if (value) void refresh();
});

async function publish() {
  errorMessage.value = '';
  busy.value = true;
  const result = await apiFetch('/api/admin/publish', {
    method: 'POST',
    fallback: "Vercel didn't confirm the publish. Try again.",
  });
  busy.value = false;
  if (!result.ok) {
    errorMessage.value = result.error;
    return;
  }
  await refresh();
}

let timer: ReturnType<typeof setInterval> | undefined;
function stopPolling() {
  clearInterval(timer);
  timer = undefined;
}

// Poll until the build clears the changes. After five minutes the publish counts as not confirmed.
watch(
  () => status.value.state === 'publishing',
  (publishing) => {
    stopPolling();
    if (!publishing) return;
    const startedAt = Date.now();
    timer = setInterval(() => {
      if (Date.now() - startedAt >= POLL_LIMIT_MS) {
        stopPolling();
        status.value = { ...status.value, state: 'unconfirmed' };
        return;
      }
      void refresh();
    }, POLL_MS);
  },
  { immediate: true }
);
onBeforeUnmount(stopPolling);

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

const summary = computed(() => {
  const { state, count, publishing, newSince } = status.value;
  if (state === 'publishing') {
    return newSince > 0
      ? `Publishing ${publishing} · ${plural(newSince, 'new change')} since`
      : 'Publishing… live in about a minute';
  }
  if (state === 'unconfirmed') return "Vercel didn't confirm the last publish.";
  return `${plural(count, 'unpublished change')}`;
});

function ago(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}
</script>

<template>
  <div
    v-if="status.state !== 'idle'"
    class="sticky top-0 z-40 border-b border-ochre/40 bg-cream text-ink shadow-sm"
    role="region"
    aria-label="Unpublished changes"
  >
    <div
      class="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 text-sm sm:px-6 lg:px-8"
    >
      <p class="m-0" role="status">
        <strong class="font-semibold">{{ summary }}</strong>
      </p>
      <button
        v-if="status.state === 'pending'"
        type="button"
        class="rounded-full bg-navy px-3 py-1 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
        :disabled="busy"
        @click="publish"
      >
        {{ busy ? 'Publishing…' : 'Publish now' }}
      </button>
      <button
        v-else-if="status.state === 'unconfirmed'"
        type="button"
        class="rounded-full bg-navy px-3 py-1 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
        :disabled="busy"
        @click="publish"
      >
        {{ busy ? 'Publishing…' : 'Publish again' }}
      </button>
      <button
        v-else
        type="button"
        class="rounded-full bg-navy px-3 py-1 text-sm font-semibold text-white opacity-60"
        disabled
      >
        Publishing…
      </button>
      <button
        type="button"
        class="ml-auto rounded-full px-2 py-1 text-sm font-semibold text-navy underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy"
        :aria-expanded="open"
        aria-controls="publish-bar-changes"
        @click="open = !open"
      >
        {{ open ? 'Hide changes' : 'Show changes' }}
      </button>
      <p v-if="errorMessage" role="alert" class="m-0 w-full font-semibold text-danger-ink">
        {{ errorMessage }}
      </p>
    </div>
    <ul
      v-if="open"
      id="publish-bar-changes"
      class="mx-auto m-0 max-h-60 max-w-7xl list-none overflow-y-auto px-4 pb-3 text-sm sm:px-6 lg:px-8"
    >
      <li
        v-for="change in status.changes"
        :key="change.id"
        class="flex flex-wrap gap-x-2 border-t border-hairline py-1.5"
      >
        <span class="font-semibold">{{ change.action }}</span>
        <span v-if="change.venueName">· {{ change.venueName }}</span>
        <span class="text-ink/70">· {{ change.actorName ?? 'A Chair' }}</span>
        <span class="text-ink/70">· {{ ago(change.createdAt) }}</span>
      </li>
    </ul>
  </div>
</template>
