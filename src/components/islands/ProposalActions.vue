<script setup lang="ts">
import { computed, ref } from 'vue';
import { apiFetch } from '@/lib/api-fetch';

/**
 * Approve / Decline (with a required, internal reason) for admins other than
 * the proposer; Withdraw for the proposer. The server enforces all of this.
 */
const props = defineProps<{ proposalId: string; proposedBy: string | null; currentUserId: string; canDecide: boolean }>();

const isMine = computed(() => props.proposedBy === props.currentUserId);
const declining = ref(false);
const reason = ref('');
const busy = ref(false);
const errorMessage = ref('');

async function act(action: 'approve' | 'decline' | 'withdraw') {
  errorMessage.value = '';
  if (action === 'decline' && !reason.value.trim()) {
    errorMessage.value = 'Give a reason for declining. It is kept internal and never shown publicly.';
    return;
  }
  busy.value = true;
  const result = await apiFetch(`/api/admin/proposals/${props.proposalId}/${action}`, {
    method: 'POST',
    body: action === 'decline' ? { reason: reason.value } : {},
    fallback: 'That did not work. Try again.',
  });
  busy.value = false;
  if (!result.ok) {
    errorMessage.value = result.fields.reason ?? result.error;
    return;
  }
  window.location.reload();
}

const primary = 'rounded-lg bg-[#1E7A4E] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#17603d] disabled:opacity-60';
const secondary = 'rounded-lg border border-hairline bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:bg-linen disabled:opacity-60';
const danger = 'rounded-lg bg-[#B92B27] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#8e201d] disabled:opacity-60';
</script>

<template>
  <div class="space-y-2">
    <div v-if="isMine" class="flex flex-wrap items-center gap-2">
      <span class="text-xs text-graphite">You proposed this. A different admin must approve or decline it.</span>
      <button type="button" :class="secondary" :disabled="busy" @click="act('withdraw')">Withdraw</button>
    </div>
    <template v-else-if="canDecide">
      <div v-if="!declining" class="flex flex-wrap gap-2">
        <button type="button" :class="primary" :disabled="busy" @click="act('approve')">Approve</button>
        <button type="button" :class="secondary" :disabled="busy" @click="declining = true">Decline…</button>
      </div>
      <div v-else class="space-y-2">
        <label class="block text-xs font-semibold text-ink">
          Reason for declining (internal, never shown publicly)
          <textarea v-model="reason" rows="2" maxlength="1000" required class="mt-1 w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm"></textarea>
        </label>
        <div class="flex gap-2">
          <button type="button" :class="danger" :disabled="busy" @click="act('decline')">Decline</button>
          <button type="button" :class="secondary" :disabled="busy" @click="declining = false">Cancel</button>
        </div>
      </div>
    </template>
    <p v-else class="text-xs text-graphite">A second active admin is needed to decide this.</p>
    <p v-if="errorMessage" role="alert" class="text-xs text-red-700">{{ errorMessage }}</p>
  </div>
</template>
