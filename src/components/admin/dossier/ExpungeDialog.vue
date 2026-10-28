<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

/** Irrevocable delete: the Chair must type EXPUNGE before the button unlocks. */
const props = defineProps<{ open: boolean; venueName: string; busy?: boolean }>();
const emit = defineEmits<{ (event: 'confirm'): void; (event: 'cancel'): void }>();

const WORD = 'EXPUNGE';
const typed = ref('');
const input = ref<HTMLInputElement | null>(null);
const ready = computed(() => typed.value.trim() === WORD);
let previouslyFocused: HTMLElement | null = null;

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('cancel');
}

watch(
  () => props.open,
  async (open) => {
    if (typeof window === 'undefined') return;
    if (open) {
      typed.value = '';
      previouslyFocused = document.activeElement as HTMLElement | null;
      window.addEventListener('keydown', onKeydown);
      await nextTick();
      input.value?.focus();
    } else {
      window.removeEventListener('keydown', onKeydown);
      previouslyFocused?.focus();
    }
  }
);

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-ink-fixed/45 px-4"
    @click.self="emit('cancel')"
  >
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="expunge-title"
      aria-describedby="expunge-message"
      class="dossier w-full max-w-md rounded-2xl border-2 border-[var(--dossier-danger)]/50 bg-[var(--dossier-canvas)] p-6 shadow-xl"
    >
      <p class="dossier-overline text-danger-ink">Irrevocable purge</p>
      <h3 id="expunge-title" class="mt-2 text-2xl font-bold text-danger-ink">
        Expunge {{ venueName }}?
      </h3>
      <p id="expunge-message" class="mt-3 text-sm leading-6 text-[var(--dossier-muted)]">
        This deletes the venue and its inspections, verdict motions and history for good. Linked
        Hall of Shame records are kept but unlinked. It cannot be undone. Mark it permanently closed
        instead if it might come back.
      </p>
      <label class="mt-4 block">
        <span class="dossier-label">Type {{ WORD }} to confirm</span>
        <input
          ref="input"
          v-model="typed"
          type="text"
          autocomplete="off"
          spellcheck="false"
          class="dossier-input dossier-figures uppercase"
          :aria-invalid="typed !== '' && !ready"
        />
      </label>
      <div class="mt-6 flex justify-end gap-3">
        <button type="button" class="dossier-btn" @click="emit('cancel')">Cancel</button>
        <button
          type="button"
          class="dossier-btn is-danger-solid"
          :disabled="!ready || busy"
          @click="emit('confirm')"
        >
          {{ busy ? 'Expunging…' : 'Expunge record' }}
        </button>
      </div>
    </div>
  </div>
</template>
