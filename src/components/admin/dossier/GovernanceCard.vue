<script setup lang="ts">
import { ref } from 'vue';
import ConfirmDialog from '../ConfirmDialog.vue';
import DossierCard from './DossierCard.vue';
import ExpungeDialog from './ExpungeDialog.vue';
import { apiFetch } from '@/lib/api-fetch';

/**
 * Administrative governance: mark permanently closed / reopen (any Chair, no
 * countersign; the server logs who and when) and expunge (delete) the record.
 */
const props = defineProps<{ venueId: string; venueName: string; closed: boolean; isGoneButNotForgotten: boolean }>();
const emit = defineEmits<{ (event: 'expunged'): void }>();

const showClose = ref(false);
const showExpunge = ref(false);
const busy = ref(false);
const errorMessage = ref('');

async function setClosed(action: 'close' | 'reopen') {
  showClose.value = false;
  errorMessage.value = '';
  busy.value = true;
  const result = await apiFetch(`/api/admin/venues/${props.venueId}/${action}`, { method: 'POST', fallback: 'That did not work. Try again.' });
  busy.value = false;
  if (!result.ok) {
    errorMessage.value = result.error;
    return;
  }
  window.location.reload();
}

async function expunge() {
  errorMessage.value = '';
  busy.value = true;
  const result = await apiFetch(`/api/admin/venues/${props.venueId}`, { method: 'DELETE', fallback: 'Unable to expunge this venue right now.' });
  busy.value = false;
  if (!result.ok) {
    errorMessage.value = result.error;
    showExpunge.value = false;
    return;
  }
  emit('expunged');
}

/** The masthead's "Mark permanently closed" opens the same confirmation. */
function openClose() {
  if (props.closed) void setClosed('reopen');
  else showClose.value = true;
}

defineExpose({ openClose });
</script>

<template>
  <DossierCard id="governance" title="Administrative Governance & Danger Zone" tag="High authority area" icon="gavel" tone="danger">
    <p class="text-[13px] leading-[19px] text-[var(--dossier-muted)]">
      These act at once, outside the decree bar below. Closing can be undone; expunging cannot.
    </p>

    <div class="flex flex-col items-start justify-between gap-3 rounded-lg border sm:flex-row sm:items-center border-[var(--dossier-border)] bg-[var(--dossier-field)] p-4">
      <div class="min-w-0 sm:flex-1">
        <p class="text-sm font-semibold">{{ closed ? 'Reopen venue' : 'Mark venue as permanently closed' }}</p>
        <p class="mt-0.5 text-[13px] text-[var(--dossier-muted)]">
          {{
            closed
              ? 'Puts it back on the map and Near Me, if it otherwise qualifies.'
              : isGoneButNotForgotten
                ? 'Comes off the map and Near Me; stays listed under Gone But Not Forgotten. Its tier does not change.'
                : 'Comes off the map, Near Me and the public site. Its tier and history are kept.'
          }}
        </p>
      </div>
      <button type="button" class="dossier-btn" :disabled="busy" @click="openClose">{{ closed ? 'Reopen listing' : 'Decommission listing' }}</button>
    </div>

    <div class="flex flex-col items-start justify-between gap-3 rounded-lg border sm:flex-row sm:items-center border-[var(--dossier-danger)]/30 bg-[var(--dossier-field)] p-4">
      <div class="min-w-0 sm:flex-1">
        <p class="text-sm font-semibold text-danger-ink">Expunge venue record (purge)</p>
        <p class="mt-0.5 text-[13px] text-[var(--dossier-muted)]">Deletes {{ venueName }} and its inspections, motions and history permanently.</p>
      </div>
      <button type="button" class="dossier-btn is-danger-solid" :disabled="busy" @click="showExpunge = true">Expunge record</button>
    </div>

    <p v-if="errorMessage" role="alert" class="dossier-error mt-0">{{ errorMessage }}</p>

    <ConfirmDialog
      :open="showClose"
      title="Confirm decommission"
      :message="`Mark “${venueName}” as permanently closed? It comes off the map and Near Me straight away${isGoneButNotForgotten ? ' and stays listed under Gone But Not Forgotten' : ' and is hidden from the public site'}. Its tier does not change, and any Chair can reopen it.`"
      confirm-label="Confirm closure"
      cancel-label="Abort"
      @cancel="showClose = false"
      @confirm="setClosed('close')"
    />
    <ExpungeDialog :open="showExpunge" :venue-name="venueName" :busy="busy" @cancel="showExpunge = false" @confirm="expunge" />
  </DossierCard>
</template>
