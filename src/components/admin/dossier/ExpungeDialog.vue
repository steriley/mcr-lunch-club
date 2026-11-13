<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import AppAlertDialog from '@/components/ui/AppAlertDialog.vue';

/** Irrevocable delete: the Chair must type EXPUNGE before the button unlocks. */
const props = defineProps<{ open: boolean; venueName: string; busy?: boolean }>();
defineEmits<{ (event: 'confirm'): void; (event: 'cancel'): void }>();

const WORD = 'EXPUNGE';
const typed = ref('');
const ready = computed(() => typed.value.trim() === WORD);

watch(
  () => props.open,
  (open) => {
    if (open) typed.value = '';
  }
);
</script>

<template>
  <AppAlertDialog
    :open="open"
    variant="dossier"
    overline="Irrevocable purge"
    :title="`Expunge ${venueName}?`"
    description="This deletes the venue and its inspections, verdict motions and history for good. Linked Hall of Shame records are kept but unlinked. It cannot be undone. Mark it permanently closed instead if it might come back."
    :confirm-label="busy ? 'Expunging…' : 'Expunge record'"
    :confirm-disabled="!ready || busy"
    initial-focus="input"
    @confirm="$emit('confirm')"
    @cancel="$emit('cancel')"
  >
    <label class="mt-4 block">
      <span class="dossier-label">Type {{ WORD }} to confirm</span>
      <input
        v-model="typed"
        type="text"
        autocomplete="off"
        spellcheck="false"
        class="dossier-input dossier-figures uppercase"
        :aria-invalid="typed !== '' && !ready"
      />
    </label>
  </AppAlertDialog>
</template>
