<template>
  <div class="ledger-search-wrap">
    <svg
      class="ledger-search-icon"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7.5" />
      <path d="m16.5 16.5 4 4" />
    </svg>
    <input
      ref="inputRef"
      :id="inputId"
      v-model="searchQueryModel"
      type="search"
      autocomplete="off"
      aria-label="Search the venue ledger"
      :placeholder="
        placeholder ?? 'Search by name, street or dish (e.g. Bada Bing, Bundobust, Salt Beef)…'
      "
      class="ledger-search-input"
    />
    <kbd v-if="shortcut" class="ledger-search-shortcut" aria-hidden="true">⌘ K</kbd>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useStore } from '@nanostores/vue';
import { $filters, setSearchQuery } from '@/stores/filters';

defineProps<{ inputId: string; shortcut?: boolean; placeholder?: string }>();

const filters = useStore($filters);
const inputRef = ref<HTMLInputElement | null>(null);

const searchQueryModel = computed({
  get: () => filters.value.searchQuery,
  set: (value: string) => setSearchQuery(value),
});

defineExpose({
  focus: () => inputRef.value?.focus(),
  /** False while CSS hides this copy of the field (the bar has one for phones and one in the panel). */
  isVisible: () => inputRef.value !== null && inputRef.value.offsetParent !== null,
});
</script>
