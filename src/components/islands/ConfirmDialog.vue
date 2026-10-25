<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';

const props = defineProps<{
  open: boolean;
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}>();

const emit = defineEmits<{ (event: 'confirm'): void; (event: 'cancel'): void }>();

const cancelButton = ref<HTMLButtonElement | null>(null);
let previouslyFocused: HTMLElement | null = null;

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('cancel');
}

watch(
  () => props.open,
  async (open) => {
    if (typeof window === 'undefined') return;
    if (open) {
      previouslyFocused = document.activeElement as HTMLElement | null;
      window.addEventListener('keydown', onKeydown);
      await nextTick();
      cancelButton.value?.focus();
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
    class="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/40 px-4"
    @click.self="emit('cancel')"
  >
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
      class="w-full max-w-md rounded-2xl border border-hairline bg-parchment p-6 shadow-xl"
    >
      <p class="text-xs font-bold uppercase tracking-[0.2em] text-ochre">Confirm</p>
      <h3 id="confirm-dialog-title" class="mt-2 text-2xl font-bold text-ink">{{ title || 'Are you sure?' }}</h3>
      <p id="confirm-dialog-message" class="mt-3 text-sm text-soot">{{ message || 'This action cannot be undone.' }}</p>
      <div class="mt-6 flex justify-end gap-3">
        <button
          ref="cancelButton"
          type="button"
          class="rounded-lg border border-hairline bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-linen focus:outline-none focus-visible:ring-2 focus-visible:ring-navy"
          @click="emit('cancel')"
        >
          {{ cancelLabel || 'Cancel' }}
        </button>
        <button
          type="button"
          class="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white hover:bg-[#8e201d] focus:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2"
          @click="emit('confirm')"
        >
          {{ confirmLabel || 'Confirm' }}
        </button>
      </div>
    </div>
  </div>
</template>
