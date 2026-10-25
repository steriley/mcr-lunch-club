<script setup lang="ts">
import { computed, ref } from 'vue';
import type { InspectionOutcome } from '@/types';
import type { VisitStatus } from '@/lib/inspections';
import DossierCard from './DossierCard.vue';
import DossierIcon from './DossierIcon.vue';
import { formatDate, formatDateTime } from '@/lib/dates';
import { INSPECTION_OUTCOMES, INSPECTION_OUTCOME_LABELS } from '@/lib/inspection-display';
import { apiFetch } from '@/lib/api-fetch';

/**
 * "Visited today" as a two-signature concord. A press records this Chair's
 * signature; only a different Chair's press on the same UK day completes it.
 * The first Chair also says how the inspection went; the cosigner affirms
 * that outcome rather than choosing their own.
 */
const props = defineProps<{ venueId: string; initialStatus: VisitStatus; latestVerifiedInspection: string | null }>();
const emit = defineEmits<{ (event: 'confirmed', status: VisitStatus): void }>();

const status = ref<VisitStatus>(props.initialStatus);
const latest = ref(props.latestVerifiedInspection);
const busy = ref(false);
const errorMessage = ref('');
const justConfirmed = ref(false);
// No default: the Chair must say how the inspection went before signing.
const chosenOutcome = ref<InspectionOutcome | null>(null);

const state = computed(() => {
  if (status.value.confirmed) return 'confirmed';
  if (status.value.pending?.byMe) return 'waiting_for_other';
  if (status.value.pending) return 'confirm_other';
  return 'none';
});
const signatures = computed(() => (status.value.confirmed ? 2 : status.value.pending ? 1 : 0));
const first = computed(() => status.value.confirmed ?? status.value.pending);
const recordedOutcome = computed(() => (first.value?.outcome ? INSPECTION_OUTCOME_LABELS[first.value.outcome] : null));
const canPress = computed(() => !busy.value && (state.value === 'confirm_other' || chosenOutcome.value !== null));

async function press() {
  errorMessage.value = '';
  busy.value = true;
  const result = await apiFetch<{ status: VisitStatus; confirmedNow?: boolean }>(`/api/admin/venues/${props.venueId}/visited-today`, {
    method: 'POST',
    // A cosigner sends nothing: they affirm the outcome the first Chair recorded.
    body: state.value === 'none' ? { outcome: chosenOutcome.value } : {},
    fallback: 'Could not record your visit. Try again.',
  });
  busy.value = false;
  if (!result.ok) {
    errorMessage.value = result.error;
    return;
  }
  const { status: visit, confirmedNow } = result.data;
  status.value = visit;
  justConfirmed.value = Boolean(confirmedNow);
  if (confirmedNow && visit.confirmed) {
    const { firstAdminName, secondAdminName } = visit.confirmed;
    const outcomeLabel = visit.confirmed.outcome ? `, ${INSPECTION_OUTCOME_LABELS[visit.confirmed.outcome as InspectionOutcome].toLowerCase()}` : '';
    latest.value = `${formatDate(visit.today)}, verified by ${firstAdminName} and ${secondAdminName}${outcomeLabel}`;
    emit('confirmed', visit);
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
        <span :class="['dossier-figures text-xs font-bold', signatures === 2 ? 'text-[var(--dossier-green)]' : 'text-[var(--dossier-secondary)]']">
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
          <span v-if="first" class="dossier-figures shrink-0 text-[11px] text-[var(--dossier-muted)]">{{ formatDateTime(first.firstAt) }}</span>
        </li>
        <li class="flex items-center justify-between gap-2">
          <span class="flex min-w-0 items-center gap-2">
            <DossierIcon :name="status.confirmed ? 'checkCircle' : 'circle'" :size="16" :class="status.confirmed ? 'text-[var(--dossier-green)]' : 'text-[var(--dossier-border)]'" />
            <span :class="status.confirmed ? 'font-semibold' : 'text-[var(--dossier-muted)]'">
              {{ status.confirmed?.secondAdminName ?? 'Awaiting second Chair cosigner' }}
            </span>
          </span>
          <span v-if="status.confirmed?.confirmedAt" class="dossier-figures shrink-0 text-[11px] text-[var(--dossier-muted)]">
            {{ formatDateTime(status.confirmed.confirmedAt) }}
          </span>
          <span v-else-if="status.pending" class="shrink-0 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--dossier-amber)]">Pending</span>
        </li>
      </ul>
    </div>

    <fieldset v-if="state === 'none'" class="space-y-2" :disabled="busy">
      <legend class="dossier-overline mb-1">How did the inspection go?</legend>
      <div class="grid grid-cols-2 gap-2">
        <label
          v-for="option in INSPECTION_OUTCOMES"
          :key="option"
          :class="[
            'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-[13px] font-semibold',
            chosenOutcome === option
              ? option === 'below_par'
                ? 'border-[var(--dossier-danger)] text-[var(--dossier-danger)]'
                : 'border-[var(--dossier-green)] text-[var(--dossier-green)]'
              : 'border-[var(--dossier-border)] text-[var(--dossier-ink)]',
          ]"
        >
          <input v-model="chosenOutcome" type="radio" name="inspection-outcome" :value="option" class="accent-current" />
          {{ INSPECTION_OUTCOME_LABELS[option] }}
        </label>
      </div>
    </fieldset>
    <p v-else-if="state === 'confirm_other' && recordedOutcome" class="dossier-inset text-[13px] text-[var(--dossier-ink)]">
      {{ status.pending!.firstAdminName }} recorded this inspection as <strong>{{ recordedOutcome.toLowerCase() }}</strong>. Cosigning affirms that.
    </p>

    <button
      v-if="state === 'none' || state === 'confirm_other'"
      type="button"
      class="dossier-btn is-primary w-full py-3 text-sm"
      :disabled="!canPress"
      @click="press"
    >
      <DossierIcon :name="busy ? 'refresh' : 'check'" :size="16" :class="busy && 'dossier-spin'" />
      {{ busy ? 'Recording…' : state === 'none' ? 'Affirm inspection (visited today)' : `Cosign ${status.pending!.firstAdminName}'s inspection` }}
    </button>
    <p v-else-if="state === 'waiting_for_other'" class="dossier-inset text-[13px] text-[var(--dossier-ink)]">
      You've signed today's visit<template v-if="recordedOutcome"> as {{ recordedOutcome.toLowerCase() }}</template>. Waiting for a different Chair to cosign before midnight.
    </p>
    <p v-else class="flex items-center gap-2 rounded-lg border border-[var(--dossier-green)]/40 bg-[#E8F5EE] px-3 py-2.5 text-[13px] font-semibold text-[var(--dossier-green)]">
      <DossierIcon name="checkCircle" :size="16" />
      {{ justConfirmed ? 'Inspection verified. Concord complete.' : 'Inspected and verified today.' }}
      <template v-if="recordedOutcome">Outcome: {{ recordedOutcome.toLowerCase() }}.</template>
    </p>

    <p v-if="errorMessage" role="alert" class="dossier-error mt-0">{{ errorMessage }}</p>

    <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-[var(--dossier-border)] pt-3 text-[12px]">
      <span class="text-[var(--dossier-muted)]">Latest verified inspection</span>
      <span :class="['italic', latest ? 'text-[var(--dossier-ink)]' : 'text-[var(--dossier-danger)]']">{{ latest ?? 'None on record' }}</span>
    </div>
  </DossierCard>
</template>
