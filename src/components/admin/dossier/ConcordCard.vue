<script setup lang="ts">
import { computed, ref } from 'vue';
import type { InspectionOutcome } from '@/types';
import type { VisitStatus } from '@/lib/inspections';
import type { AuditEntry } from './AuditHistoryDrawer.vue';
import DossierCard from './DossierCard.vue';
import ConcordSignatures from './ConcordSignatures.vue';
import DossierIcon from './DossierIcon.vue';
import {
  INSPECTION_OUTCOMES,
  INSPECTION_OUTCOME_LABELS,
  verifiedVisitSummary,
} from '@/lib/inspection-display';
import { apiFetch } from '@/lib/api-fetch';
import { useOnline } from '@/lib/pwa/useOnline';

/**
 * "Visited today" as a two-signature concord. A press records this Chair's
 * signature; only a different Chair's press on the same UK day completes it.
 * The first Chair also says how the inspection went; the cosigner affirms
 * that outcome rather than choosing their own.
 */
const props = defineProps<{
  venueId: string;
  initialStatus: VisitStatus;
  latestVerifiedInspection: string | null;
}>();
/** The presser's visit as the route returns it; the dossier's Visits section reads the rest. */
interface PressedVisit {
  id: string;
}
const emit = defineEmits<{
  (event: 'confirmed', status: VisitStatus, timelineEntry: AuditEntry | null): void;
  (event: 'visited', visit: PressedVisit): void;
  (event: 'add-note', visit: PressedVisit): void;
}>();

const status = ref<VisitStatus>(props.initialStatus);
const latest = ref(props.latestVerifiedInspection);
const online = useOnline();
const busy = ref(false);
const errorMessage = ref('');
const justConfirmed = ref(false);
// After a press: offer (never require) a field note about the visit.
const notePrompt = ref<PressedVisit | null>(null);
// No default: the Chair must say how the inspection went before signing.
const chosenOutcome = ref<InspectionOutcome | null>(null);

const state = computed(() => {
  if (status.value.confirmed) return 'confirmed';
  if (status.value.pending?.byMe) return 'waiting_for_other';
  if (status.value.pending) return 'confirm_other';
  return 'none';
});
const first = computed(() => status.value.confirmed ?? status.value.pending);
const recordedOutcome = computed(() =>
  first.value?.outcome ? INSPECTION_OUTCOME_LABELS[first.value.outcome] : null
);
const canPress = computed(
  () =>
    online.value && !busy.value && (state.value === 'confirm_other' || chosenOutcome.value !== null)
);

function addNoteFromPrompt() {
  if (notePrompt.value) emit('add-note', notePrompt.value);
  notePrompt.value = null;
}

async function press() {
  errorMessage.value = '';
  busy.value = true;
  const result = await apiFetch<{
    status: VisitStatus;
    confirmedNow?: boolean;
    timelineEntry?: AuditEntry | null;
    visit?: PressedVisit;
  }>(`/api/admin/venues/${props.venueId}/visited-today`, {
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
  const { status: visit, confirmedNow, visit: pressed, timelineEntry } = result.data;
  status.value = visit;
  if (pressed) {
    emit('visited', pressed);
    notePrompt.value = pressed;
  }
  justConfirmed.value = Boolean(confirmedNow);
  if (confirmedNow && visit.confirmed) {
    latest.value = verifiedVisitSummary(visit.today, visit.confirmed);
    emit('confirmed', visit, timelineEntry ?? null);
  }
}
</script>

<template>
  <DossierCard
    id="concord"
    title="Dual-Chair Concord"
    tag="Daily quorum"
    icon="badge"
    tone="accent"
  >
    <p class="text-[13px] leading-[19px] text-[var(--dossier-muted)]">
      An inspection is verified only when
      <strong class="text-[var(--dossier-ink)]">two different Chairs</strong> each declare a visit
      on the same calendar day (UK time). A lone declaration lapses at midnight.
    </p>

    <ConcordSignatures :status="status" />

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
                ? 'border-[var(--dossier-danger)] text-danger-ink'
                : 'border-[var(--dossier-green)] text-success-ink'
              : 'border-[var(--dossier-border)] text-[var(--dossier-ink)]',
          ]"
        >
          <input
            v-model="chosenOutcome"
            type="radio"
            name="inspection-outcome"
            :value="option"
            class="accent-current"
          />
          {{ INSPECTION_OUTCOME_LABELS[option] }}
        </label>
      </div>
    </fieldset>
    <p
      v-else-if="state === 'confirm_other' && recordedOutcome"
      class="dossier-inset text-[13px] text-[var(--dossier-ink)]"
    >
      {{ status.pending!.firstAdminName }} recorded this inspection as
      <strong>{{ recordedOutcome.toLowerCase() }}</strong
      >. Cosigning affirms that.
    </p>

    <button
      v-if="state === 'none' || state === 'confirm_other'"
      type="button"
      class="dossier-btn is-primary w-full py-3 text-sm"
      :disabled="!canPress"
      @click="press"
    >
      <DossierIcon :name="busy ? 'refresh' : 'check'" :size="16" :class="busy && 'dossier-spin'" />
      {{
        busy
          ? 'Recording…'
          : state === 'none'
            ? 'Affirm inspection (visited today)'
            : `Cosign ${status.pending!.firstAdminName}'s inspection`
      }}
    </button>
    <p
      v-if="!online && (state === 'none' || state === 'confirm_other')"
      class="dossier-hint"
      role="status"
    >
      You're offline. Visits are recorded by the server, so this waits for a connection.
    </p>
    <p
      v-else-if="state === 'waiting_for_other'"
      class="dossier-inset text-[13px] text-[var(--dossier-ink)]"
    >
      You've signed today's visit<template v-if="recordedOutcome">
        as {{ recordedOutcome.toLowerCase() }}</template
      >. Waiting for a different Chair to cosign before midnight.
    </p>
    <p
      v-else
      class="flex items-center gap-2 rounded-lg border border-[var(--dossier-green)]/40 bg-success-tint px-3 py-2.5 text-[13px] font-semibold text-success-ink"
    >
      <DossierIcon name="checkCircle" :size="16" />
      {{
        justConfirmed ? 'Inspection verified. Concord complete.' : 'Inspected and verified today.'
      }}
      <template v-if="recordedOutcome">Outcome: {{ recordedOutcome.toLowerCase() }}.</template>
    </p>

    <div
      v-if="notePrompt"
      role="status"
      class="dossier-inset flex items-center gap-2 bg-[var(--dossier-field)] text-[13px]"
    >
      <DossierIcon name="feather" :size="16" class="shrink-0 text-[var(--dossier-secondary)]" />
      <span class="min-w-0 flex-1">Add a field note about this visit?</span>
      <button type="button" class="dossier-link" @click="addNoteFromPrompt">Add field note</button>
      <button
        type="button"
        class="dossier-link"
        aria-label="Dismiss the field note prompt"
        @click="notePrompt = null"
      >
        <DossierIcon name="x" :size="14" />
      </button>
    </div>

    <p v-if="errorMessage" role="alert" class="dossier-error mt-0">{{ errorMessage }}</p>

    <div
      class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-[var(--dossier-border)] pt-3 text-[12px]"
    >
      <span class="text-[var(--dossier-muted)]">Latest verified inspection</span>
      <span :class="['italic', latest ? 'text-[var(--dossier-ink)]' : 'text-danger-ink']">{{
        latest ?? 'None on record'
      }}</span>
    </div>
  </DossierCard>
</template>
