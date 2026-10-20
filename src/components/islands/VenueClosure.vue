<script setup lang="ts">
import { ref } from 'vue';
import ConfirmDialog from './ConfirmDialog.vue';

/** "Mark permanently closed" / "Reopen". Any admin, no countersign; the server logs who and when. */
const props = defineProps<{ venueId: string; venueName: string; closed: boolean; isGoneButNotForgotten: boolean }>();

const showConfirm = ref(false);
const busy = ref(false);
const errorMessage = ref('');

async function submit(action: 'close' | 'reopen') {
  showConfirm.value = false;
  errorMessage.value = '';
  busy.value = true;
  try {
    const response = await fetch(`/api/admin/venues/${props.venueId}/${action}`, { method: 'POST' });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      errorMessage.value = result.error ?? 'That did not work. Try again.';
      return;
    }
    window.location.reload();
  } catch {
    errorMessage.value = 'That did not work. Try again.';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col items-start gap-2">
    <button
      v-if="!closed"
      type="button"
      :disabled="busy"
      class="rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
      @click="showConfirm = true"
    >
      Mark permanently closed
    </button>
    <button
      v-else
      type="button"
      :disabled="busy"
      class="rounded-lg border border-[#1B2F6B] bg-white px-4 py-2.5 text-sm font-semibold text-[#1B2F6B] hover:bg-[#edf3ff] disabled:opacity-60"
      @click="submit('reopen')"
    >
      {{ busy ? 'Reopening…' : 'Reopen' }}
    </button>
    <p v-if="errorMessage" role="alert" class="text-sm text-red-700">{{ errorMessage }}</p>

    <ConfirmDialog
      :open="showConfirm"
      title="Mark permanently closed"
      :message="`Mark “${venueName}” as permanently closed? It comes off the map and Near Me straight away${isGoneButNotForgotten ? ' and stays listed under Gone But Not Forgotten' : ' and is hidden from the public site'}. Its tier does not change, and any admin can reopen it.`"
      confirm-label="Mark closed"
      @cancel="showConfirm = false"
      @confirm="submit('close')"
    />
  </div>
</template>
