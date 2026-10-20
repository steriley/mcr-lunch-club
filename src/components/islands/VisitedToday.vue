<script setup lang="ts">
import { computed, ref } from 'vue';

/** Mirrors VisitStatus in src/lib/inspections.ts. */
interface VisitStatus {
  today: string;
  pending: { firstAdminName: string; byMe: boolean } | null;
  confirmed: { firstAdminName: string; secondAdminName: string } | null;
}

const props = defineProps<{ venueId: string; initialStatus: VisitStatus }>();

const status = ref<VisitStatus>(props.initialStatus);
const busy = ref(false);
const errorMessage = ref('');
const justConfirmed = ref(false);

const state = computed(() => {
  if (status.value.confirmed) return 'confirmed';
  if (status.value.pending?.byMe) return 'waiting_for_other';
  if (status.value.pending) return 'confirm_other';
  return 'none';
});

async function press() {
  errorMessage.value = '';
  busy.value = true;
  try {
    const response = await fetch(`/api/admin/venues/${props.venueId}/visited-today`, { method: 'POST' });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      errorMessage.value = result.error ?? 'Could not record your visit. Try again.';
      return;
    }
    status.value = result.status;
    justConfirmed.value = Boolean(result.confirmedNow);
  } catch {
    errorMessage.value = 'Could not record your visit. Try again.';
  } finally {
    busy.value = false;
  }
}

const buttonClass =
  'rounded-lg bg-[#1B2F6B] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#111E47] disabled:cursor-not-allowed disabled:opacity-70';
</script>

<template>
  <section class="rounded-2xl border border-[#d9cfb8] bg-[#f9f7f1] p-5 shadow-sm" aria-labelledby="visited-today-heading">
    <h2 id="visited-today-heading" class="text-lg font-bold text-[#1a1e24]">Visited today</h2>
    <p class="mt-1 text-xs text-[#535353]">
      An inspection counts when two different Chairs each press this on the same day (UK time). It feeds the venue's “last inspected” date.
    </p>

    <div class="mt-3 flex flex-wrap items-center gap-3" role="status">
      <template v-if="state === 'none'">
        <button type="button" :class="buttonClass" :disabled="busy" @click="press">{{ busy ? 'Recording…' : 'Visited today' }}</button>
      </template>
      <template v-else-if="state === 'waiting_for_other'">
        <p class="text-sm text-[#1a1e24]">You've recorded your visit. Waiting for another admin. Lapses at midnight.</p>
      </template>
      <template v-else-if="state === 'confirm_other'">
        <p class="text-sm text-[#1a1e24]">{{ status.pending!.firstAdminName }} has recorded a visit today. Press to confirm.</p>
        <button type="button" :class="buttonClass" :disabled="busy" @click="press">{{ busy ? 'Confirming…' : 'Visited today' }}</button>
      </template>
      <template v-else>
        <p class="text-sm text-emerald-800">
          {{ justConfirmed ? 'Inspection confirmed.' : 'Inspected today.' }} Verified by {{ status.confirmed!.firstAdminName }} and {{ status.confirmed!.secondAdminName }}.
        </p>
      </template>
    </div>
    <p v-if="errorMessage" role="alert" class="mt-2 text-sm text-red-700">{{ errorMessage }}</p>
  </section>
</template>
