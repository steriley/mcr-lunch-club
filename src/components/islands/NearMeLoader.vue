<template>
  <NearMeMap v-if="requested" :map-api-key="mapApiKey" />
</template>

<script setup lang="ts">
import { defineAsyncComponent, onMounted, onUnmounted, ref } from 'vue';
import { whenIdle } from '@/lib/idle';
import { $isNearMeOpen } from '@/stores/filters';

defineProps<{
  mapApiKey?: string;
}>();

// Near Me stays hidden until someone opens it, so its code and styles load then
// instead of with the page. They are also fetched in the background once the
// page is idle, so opening it is usually instant.
const loadNearMeMap = () => import('./NearMeMap.vue');
const NearMeMap = defineAsyncComponent(loadNearMeMap);
const requested = ref(false);

let unsubscribe: (() => void) | null = null;
let cancelPrefetch: (() => void) | null = null;

/** A #near-me link, or back/forward onto one, opens Near Me; NearMeMap takes this over once loaded. */
function openFromHash() {
  if (window.location.hash === '#near-me') $isNearMeOpen.set(true);
}

function stopWatching() {
  window.removeEventListener('hashchange', openFromHash);
  window.removeEventListener('popstate', openFromHash);
  unsubscribe?.();
  unsubscribe = null;
}

function request() {
  requested.value = true;
  stopWatching();
  cancelPrefetch?.();
}

onMounted(() => {
  // subscribe() also reports the current value, in case Near Me opened before this mounted.
  unsubscribe = $isNearMeOpen.subscribe((open) => {
    if (open) request();
  });
  if (requested.value) {
    // Already open: subscribe() called request() before it returned, so unsubscribe here.
    stopWatching();
    return;
  }
  window.addEventListener('hashchange', openFromHash);
  window.addEventListener('popstate', openFromHash);
  openFromHash();
  if (!requested.value) cancelPrefetch = whenIdle(() => void loadNearMeMap().catch(() => {}), 5000);
});

onUnmounted(() => {
  stopWatching();
  cancelPrefetch?.();
});
</script>
