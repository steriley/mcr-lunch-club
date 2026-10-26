<template>
  <div class="bench-tabs" role="tablist" aria-label="Bench views" @keydown="onKeydown">
    <button
      v-for="tab in tabs"
      :id="`bench-tab-${tab.id}`"
      :key="tab.id"
      type="button"
      role="tab"
      class="bench-tab"
      :class="{ 'is-selected': selected === tab.id }"
      :aria-selected="selected === tab.id"
      :aria-controls="`bench-panel-${tab.id}`"
      :tabindex="selected === tab.id ? 0 : -1"
      @click="select(tab.id)"
    >
      {{ tab.label }}
      <span v-if="tab.id === 'all'" class="bench-tab-count">{{ count }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useStore } from '@nanostores/vue';
import { $filteredVenues } from '@/stores/filters';

/**
 * The bench panel's two views: the Chairs' Golden Cut (the page's default) and every venue the
 * filters match. The panels are server-rendered beside this; it shows one and hides the other.
 * On a narrow screen the tabs are hidden and the list moves under the map instead (see CSS).
 */
const props = defineProps<{
  /** The venue count the server saw under the default filters, so the tab doesn't jump when this loads. */
  initialCount: number;
}>();

type TabId = 'golden' | 'all';
const tabs: ReadonlyArray<{ id: TabId; label: string }> = [
  { id: 'golden', label: 'The Golden Cut' },
  { id: 'all', label: 'All venues' },
];

const selected = ref<TabId>('golden');
const filtered = useStore($filteredVenues);
const mounted = ref(false);
const count = computed(() => (mounted.value ? filtered.value.length : props.initialCount));

function apply(id: TabId) {
  selected.value = id;
  for (const tab of tabs) {
    const panel = document.getElementById(`bench-panel-${tab.id}`);
    if (panel) panel.hidden = tab.id !== id;
  }
  const bench = document.querySelector<HTMLElement>('.bench');
  if (bench) bench.dataset.tab = id;
}

function select(id: TabId, focus = false) {
  apply(id);
  if (focus) document.getElementById(`bench-tab-${id}`)?.focus();
}

// Arrow keys move between tabs and select as they go, as a tab list should.
function onKeydown(event: KeyboardEvent) {
  const index = tabs.findIndex((tab) => tab.id === selected.value);
  const target =
    event.key === 'ArrowRight' ? (index + 1) % tabs.length
    : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length
    : event.key === 'Home' ? 0
    : event.key === 'End' ? tabs.length - 1
    : null;
  if (target === null) return;
  event.preventDefault();
  select(tabs[target].id, true);
}

// The skip link on the map asks for the list.
const onShowResults = () => select('all');

onMounted(() => {
  mounted.value = true;
  window.addEventListener('mcr:show-results', onShowResults);
});

onUnmounted(() => window.removeEventListener('mcr:show-results', onShowResults));
</script>
