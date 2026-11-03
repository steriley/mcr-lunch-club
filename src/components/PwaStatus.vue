<script setup lang="ts">
import { computed } from 'vue';
import { useStore } from '@nanostores/vue';
import { staleDataLabel } from '@/lib/pwa/offline-label';
import { applyUpdate } from '@/lib/pwa/update';
import { useOnline } from '@/lib/pwa/useOnline';
import { $savedCopy, $updateReady } from '@/stores/pwa';

/**
 * The slim bar at the top of every page while offline, and the "New verdicts published" notice.
 * The bar sits in the page flow above the header, so it never moves the Near Me map, which has
 * its own full-screen layer and its own offline banner.
 */
const props = defineProps<{
  /** The Chairs' Area: needs a connection, and never offers a reload over a form. */
  chairsArea?: boolean;
}>();

const online = useOnline();
const savedCopy = useStore($savedCopy);
const updateReady = useStore($updateReady);

const barText = computed(() => {
  if (props.chairsArea)
    return 'Offline · the Chairs’ Area needs a connection. Nothing is saved until you are back.';
  if (savedCopy.value) return staleDataLabel(savedCopy.value.builtAt);
  return 'Offline · this page may be out of date';
});
const showBar = computed(() => !online.value || (!props.chairsArea && savedCopy.value !== null));
</script>

<template>
  <div v-if="showBar" class="offline-bar" role="status" aria-live="polite" data-offline-bar>
    <span class="offline-bar-dot" aria-hidden="true"></span>
    {{ barText }}
  </div>
  <div v-if="updateReady && !chairsArea" class="update-notice" role="status" data-update-notice>
    <span>New verdicts published</span>
    <button type="button" class="update-notice-button" @click="applyUpdate">Refresh</button>
  </div>
</template>

<style scoped>
.offline-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.35rem 1rem;
  font-family: var(--font-sans, 'Plus Jakarta Sans', sans-serif);
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.3;
  text-align: center;
  color: var(--color-ink);
  background: var(--color-sand);
  border-bottom: 1px solid var(--color-hairline);
}

.offline-bar-dot {
  width: 0.5rem;
  height: 0.5rem;
  flex: none;
  border-radius: 9999px;
  background: var(--color-ochre);
}

.update-notice {
  position: fixed;
  left: 50%;
  bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
  z-index: 60;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.5rem 0.5rem 1rem;
  transform: translateX(-50%);
  font-family: var(--font-sans, 'Plus Jakarta Sans', sans-serif);
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-ink);
  background: var(--color-surface);
  border: 1px solid var(--color-hairline);
  border-radius: 9999px;
  box-shadow: 0 4px 16px rgb(0 0 0 / 0.18);
}

.update-notice-button {
  min-height: 2.25rem;
  padding: 0 1rem;
  border-radius: 9999px;
  font-weight: 700;
  color: white;
  background: var(--color-navy-fixed);
  cursor: pointer;
}
</style>
