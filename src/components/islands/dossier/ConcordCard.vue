<script lang="ts">
/** Mirrors VisitStatus in src/lib/inspections.ts. */
export interface VisitStatus {
  today: string;
  pending: { firstAdminName: string; byMe: boolean; firstAt: string } | null;
  confirmed: { firstAdminName: string; secondAdminName: string; firstAt: string; confirmedAt: string | null } | null;
}
</script>

<script setup lang="ts">
import { computed, ref } from 'vue';
import DossierCard from './DossierCard.vue';
import DossierIcon from './DossierIcon.vue';
import { formatDate, formatDateTime } from '@/lib/dates';

/**
 * "Visited today" as a two-signature concord. A press records this Chair's
 * signature; only a different Chair's press on the same UK day completes it.
 */
const props = defineProps<{ venueId: string; initialStatus: VisitStatus; latestVerifiedInspection: string | null }>();
const emit = defineEmits<{ (event: 'confirmed', status: VisitStatus): void }>();

const status = ref<VisitStatus>(props.initialStatus);
const latest = ref(props.latestVerifiedInspection);
const busy = ref(false);
const errorMessage = ref('');
const justConfirmed = ref(false);

const state = computed(() => {
  if (status.value.confirmed) return 'confirmed';
  if (status.value.pending?.byMe) return 'waiting_for_other';
  if (status.value.pending) return 'confirm_other';
  return 'none';
});
const signatures = computed(() => (status.value.confirmed ? 2 : status.value.pending ? 1 : 0));
const first = computed(() => status.value.confirmed ?? status.value.pending);

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
    if (result.confirmedNow && result.status.confirmed) {
      const { firstAdminName, secondAdminName } = result.status.confirmed;
      latest.value = `${formatDate(result.status.today)}, verified by ${firstAdminName} and ${secondAdminName}`;
      emit('confirmed', result.status);
    }
  } catch {
    errorMessage.value = 'Could not record your visit. Try again.';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <DossierCard id="concord" title="Dual-Chair Concord" tag="Daily quorum" icon="badge" tone="accent">
    <p class="text-[13px] leading-[19px] text-[var(--dossier-muted)]">
      An inspection is verified only when <strong class="text-[var(--dossier-ink)]">two different Chairs</strong> each declare a visit on the same
      calendar day (UK time). A lone declaration lapses at midnight.
    </p>

    <div class="dossier-inset space-y-3 bg-[var(--dossier-field)]" role="status">
      <div class="flex items-center justify-between gap-2">
        <span class="dossier-overline">Quorum concordance</span>
        <span :class="['dossier-mono text-xs font-bold', signatures === 2 ? 'text-[var(--dossier-green)]' : 'text-[var(--dossier-secondary)]']">
          {{ signatures }} / 2 affirmed
        </span>
      </div>
      <div class="h-2 overflow-hidden rounded-full bg-[var(--dossier-border)]" aria-hidden="true">
        <div
          class="h-full rounded-full transition-[width] duration-500"
          :class="signatures === 2 ? 'bg-[var(--dossier-green)]' : 'bg-[var(--dossier-secondary)]'"
          :style="{ width: `${signatures * 50}%` }"
        />
      </div>
      <ul class="space-y-1.5 text-[13px]">
        <li class="flex items-center justify-between gap-2">
          <span class="flex min-w-0 items-center gap-2">
            <DossierIcon :name="first ? 'checkCircle' : 'circle'" :size="16" :class="first ? 'text-[var(--dossier-green)]' : 'text-[var(--dossier-border)]'" />
            <span :class="first ? 'font-semibold' : 'text-[var(--dossier-muted)]'">{{ first?.firstAdminName ?? 'Awaiting first Chair' }}</span>
          </span>
          <span v-if="first" class="dossier-mono shrink-0 text-[11px] text-[var(--dossier-muted)]">{{ formatDateTime(first.firstAt) }}</span>
        </li>
        <li class="flex items-center justify-between gap-2">
          <span class="flex min-w-0 items-center gap-2">
            <DossierIcon :name="status.confirmed ? 'checkCircle' : 'circle'" :size="16" :class="status.confirmed ? 'text-[var(--dossier-green)]' : 'text-[var(--dossier-border)]'" />
            <span :class="status.confirmed ? 'font-semibold' : 'text-[var(--dossier-muted)]'">
              {{ status.confirmed?.secondAdminName ?? 'Awaiting second Chair cosigner' }}
            </span>
          </span>
          <span v-if="status.confirmed?.confirmedAt" class="dossier-mono shrink-0 text-[11px] text-[var(--dossier-muted)]">
            {{ formatDateTime(status.confirmed.confirmedAt) }}
          </span>
          <span v-else-if="status.pending" class="shrink-0 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--dossier-amber)]">Pending</span>
        </li>
      </ul>
    </div>

    <button
      v-if="state === 'none' || state === 'confirm_other'"
      type="button"
      class="dossier-btn is-primary w-full py-3 text-sm"
      :disabled="busy"
      @click="press"
    >
      <DossierIcon :name="busy ? 'refresh' : 'check'" :size="16" :class="busy && 'dossier-spin'" />
      {{ busy ? 'Recording…' : state === 'none' ? 'Affirm inspection (visited today)' : `Cosign ${status.pending!.firstAdminName}'s inspection` }}
    </button>
    <p v-else-if="state === 'waiting_for_other'" class="dossier-inset text-[13px] text-[var(--dossier-ink)]">
      You've signed today's visit. Waiting for a different Chair to cosign before midnight.
    </p>
    <p v-else class="flex items-center gap-2 rounded-lg border border-[var(--dossier-green)]/40 bg-[#E8F5EE] px-3 py-2.5 text-[13px] font-semibold text-[var(--dossier-green)]">
      <DossierIcon name="checkCircle" :size="16" />
      {{ justConfirmed ? 'Inspection verified. Concord complete.' : 'Inspected and verified today.' }}
    </p>

    <p v-if="errorMessage" role="alert" class="dossier-error mt-0">{{ errorMessage }}</p>

    <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-[var(--dossier-border)] pt-3 text-[12px]">
      <span class="text-[var(--dossier-muted)]">Latest verified inspection</span>
      <span :class="['italic', latest ? 'text-[var(--dossier-ink)]' : 'text-[var(--dossier-danger)]']">{{ latest ?? 'None on record' }}</span>
    </div>
  </DossierCard>
</template>
