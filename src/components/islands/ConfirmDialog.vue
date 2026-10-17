<script setup lang="ts">
const props = defineProps<{
  open: boolean;
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}>();

const emit = defineEmits<{ (event: 'confirm'): void; (event: 'cancel'): void }>();
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-[#1a1e24]/40 px-4">
    <div class="w-full max-w-md rounded-2xl border border-[#d9cfb8] bg-[#f9f7f1] p-6 shadow-xl">
      <p class="text-xs font-bold uppercase tracking-[0.2em] text-[#8a5100]">Confirm</p>
      <h3 class="mt-2 text-2xl font-bold text-[#1a1e24]">{{ title || 'Are you sure?' }}</h3>
      <p class="mt-3 text-sm text-[#3d3d3d]">{{ message || 'This action cannot be undone.' }}</p>
      <div class="mt-6 flex justify-end gap-3">
        <button
          type="button"
          class="rounded-lg border border-[#d9cfb8] bg-white px-4 py-2 text-sm font-semibold text-[#1a1e24] hover:bg-[#f5efe5]"
          @click="emit('cancel')"
        >
          {{ cancelLabel || 'Cancel' }}
        </button>
        <button
          type="button"
          class="rounded-lg bg-[#B92B27] px-4 py-2 text-sm font-semibold text-white hover:bg-[#8e201d]"
          @click="emit('confirm')"
        >
          {{ confirmLabel || 'Confirm' }}
        </button>
      </div>
    </div>
  </div>
</template>
