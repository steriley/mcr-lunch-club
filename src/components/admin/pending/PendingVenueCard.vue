<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import TierBadge from '../TierBadge.vue';
import ConcordSignatures from '../dossier/ConcordSignatures.vue';
import DossierIcon from '../dossier/DossierIcon.vue';
import VenueVisits from '../dossier/VenueVisits.vue';
import { apiFetch } from '@/lib/api-fetch';
import { formatDateTime } from '@/lib/dates';
import {
  INSPECTION_OUTCOME_LABELS,
  verifiedVisitSummary,
  visitStatusLabel,
} from '@/lib/inspection-display';
import type { VisitStatus } from '@/lib/inspections';
import { entryNeedsUser, type PendingEntry } from '@/lib/pending-docket';

/**
 * One venue on the Pending page: today's inspection to cosign and the verdict motion to decide,
 * side by side. When the Chair can do both, one button does both: cosign first, then approve, so
 * a failed cosign never leaves a verdict approved on its own. The server enforces every rule; this
 * only saves a trip to the venue page.
 */
const props = defineProps<{
  entry: PendingEntry;
  currentUserId: string;
  activeAdmins: number;
  /** London today (YYYY-MM-DD), for the field notes list. */
  today: string;
}>();
const emit = defineEmits<{ (event: 'needs-me', needsMe: boolean): void }>();

type Decision = 'approve' | 'decline' | 'withdraw';
const DECIDED_TEXT: Record<Decision, string> = {
  approve: 'Verdict approved. It goes public with the next publish.',
  decline: 'Motion declined. Your reason is kept internal.',
  withdraw: 'Motion withdrawn.',
};

const visit = ref<VisitStatus | null>(props.entry.inspection);
const latest = ref(props.entry.latestVerifiedInspection);
const decided = ref<Decision | null>(null);
const cosignBusy = ref(false);
const decideBusy = ref(false);
const cosignError = ref('');
const decideError = ref('');
const declining = ref(false);
const reason = ref('');

const proposal = computed(() => (decided.value ? null : props.entry.proposal));
const canCosign = computed(() => Boolean(visit.value?.pending && !visit.value.pending.byMe));
const myMotion = computed(() => props.entry.proposal?.proposedBy === props.currentUserId);
const canDecide = computed(
  () => Boolean(proposal.value) && !myMotion.value && props.activeAdmins >= 2
);
const canDoBoth = computed(() => canCosign.value && canDecide.value && !declining.value);
const busy = computed(() => cosignBusy.value || decideBusy.value);

const recordedOutcome = computed(() => {
  const outcome = (visit.value?.confirmed ?? visit.value?.pending)?.outcome;
  return outcome ? INSPECTION_OUTCOME_LABELS[outcome].toLowerCase() : null;
});
const needsMe = computed(() =>
  entryNeedsUser({ inspection: visit.value, proposal: proposal.value }, props.currentUserId)
);
watch(needsMe, (value) => emit('needs-me', value));

const tag = computed(() => {
  if (needsMe.value) return 'Needs your signature';
  if (visit.value?.pending || proposal.value) return 'Waiting on another Chair';
  return 'Signed';
});

async function cosign(): Promise<boolean> {
  cosignError.value = '';
  cosignBusy.value = true;
  const result = await apiFetch<{ status: VisitStatus; confirmedNow?: boolean }>(
    `/api/admin/venues/${props.entry.venueId}/visited-today`,
    // A cosigner sends no outcome: they affirm the one the first Chair recorded.
    { method: 'POST', body: {}, fallback: 'Could not record your visit. Try again.' }
  );
  cosignBusy.value = false;
  if (!result.ok) {
    // With no outcome sent, an outcome error means there was nothing left to cosign: the first
    // Chair's press was from an earlier day and has lapsed.
    cosignError.value = result.fields.outcome
      ? 'This visit lapsed at midnight before anyone cosigned it. Reload to see what is still pending.'
      : result.error;
    return false;
  }
  visit.value = result.data.status;
  if (result.data.status.confirmed)
    latest.value = verifiedVisitSummary(result.data.status.today, result.data.status.confirmed);
  return true;
}

async function decide(action: Decision): Promise<boolean> {
  const motion = props.entry.proposal;
  if (!motion) return false;
  decideError.value = '';
  if (action === 'decline' && !reason.value.trim()) {
    decideError.value =
      'Give a reason for declining. It is kept internal and never shown publicly.';
    return false;
  }
  decideBusy.value = true;
  const result = await apiFetch(`/api/admin/proposals/${motion.id}/${action}`, {
    method: 'POST',
    body: action === 'decline' ? { reason: reason.value } : {},
    fallback: 'That did not work. Try again.',
  });
  decideBusy.value = false;
  if (!result.ok) {
    decideError.value = result.fields.reason ?? result.error;
    return false;
  }
  decided.value = action;
  declining.value = false;
  return true;
}

async function doBoth() {
  if (await cosign()) await decide('approve');
}

// Today's visit always has the first Chair's visit; show it only once someone has written a note.
const inspectionHasNotes = computed(() =>
  props.entry.inspectionVisits.some((visit) => visit.notes.length > 0)
);
// The list is drawn from the page load; once this Chair cosigns, relabel the visits to match.
const inspectionVisits = computed(() => {
  const confirmed = visit.value?.confirmed;
  if (!confirmed) return props.entry.inspectionVisits;
  const statusLabel = visitStatusLabel({ status: 'confirmed', outcome: confirmed.outcome });
  return props.entry.inspectionVisits.map((item) => ({ ...item, statusLabel }));
});

const proposedWhen = computed(() =>
  props.entry.proposal ? formatDateTime(props.entry.proposal.proposedAt) : ''
);
</script>

<template>
  <section
    :class="['dossier-card', needsMe && 'is-accent']"
    :aria-labelledby="`pending-${entry.venueId}-title`"
  >
    <div class="dossier-card-head">
      <h3 :id="`pending-${entry.venueId}-title`" class="dossier-card-title">
        <DossierIcon name="building" :size="20" />
        <a :href="`/admin/venues/${entry.venueId}`" class="hover:underline">{{
          entry.venueName
        }}</a>
      </h3>
      <span class="dossier-card-tag">{{ tag }}</span>
    </div>

    <div :class="['grid gap-5', entry.inspection && entry.proposal && 'lg:grid-cols-2']">
      <!-- Today's inspection -->
      <div v-if="visit" class="space-y-3">
        <p class="dossier-overline flex items-center gap-1.5 text-[var(--dossier-secondary)]">
          <DossierIcon name="badge" :size="14" />
          Inspection · visited today
        </p>
        <ConcordSignatures :status="visit" />
        <div v-if="inspectionHasNotes" class="space-y-2">
          <p class="dossier-overline">Field notes from today's visit</p>
          <VenueVisits
            read-only
            :venue-id="entry.venueId"
            :key="visit.confirmed ? 'confirmed' : 'pending'"
            :visits="inspectionVisits"
            :current-user-id="null"
            :today="today"
          />
        </div>

        <template v-if="visit.confirmed">
          <p
            role="status"
            class="flex items-center gap-2 rounded-lg border border-[var(--dossier-green)]/40 bg-success-tint px-3 py-2.5 text-[13px] font-semibold text-success-ink"
          >
            <DossierIcon name="checkCircle" :size="16" />
            Inspection verified.
            <template v-if="recordedOutcome">Outcome: {{ recordedOutcome }}.</template>
          </p>
          <a
            :href="`/admin/venues/${entry.venueId}#visits`"
            class="dossier-link inline-flex items-center gap-1 px-0"
          >
            <DossierIcon name="feather" :size="14" />
            Add a field note about your visit
          </a>
        </template>
        <template v-else-if="visit.pending?.byMe">
          <p class="dossier-inset text-[13px] text-[var(--dossier-ink)]">
            You've signed today's visit<template v-if="recordedOutcome">
              as {{ recordedOutcome }}</template
            >. Waiting for a different Chair to cosign before midnight.
          </p>
        </template>
        <template v-else-if="visit.pending">
          <p class="dossier-inset text-[13px] text-[var(--dossier-ink)]">
            {{ visit.pending.firstAdminName }} recorded this inspection<template
              v-if="recordedOutcome"
            >
              as <strong>{{ recordedOutcome }}</strong></template
            >. Cosigning says you visited today too and affirms that outcome. It lapses at midnight.
          </p>
          <button
            type="button"
            :class="['dossier-btn w-full', !canDoBoth && 'is-primary py-3 text-sm']"
            :disabled="busy"
            @click="cosign"
          >
            <DossierIcon
              :name="cosignBusy ? 'refresh' : 'check'"
              :size="16"
              :class="cosignBusy && 'dossier-spin'"
            />
            {{
              cosignBusy
                ? 'Recording…'
                : canDoBoth
                  ? 'Cosign inspection only'
                  : `Cosign ${visit.pending.firstAdminName}'s inspection`
            }}
          </button>
        </template>
        <p v-if="cosignError" role="alert" class="dossier-error mt-0">{{ cosignError }}</p>
      </div>

      <!-- Verdict motion -->
      <div v-if="entry.proposal" class="space-y-3">
        <p class="dossier-overline flex items-center gap-1.5 text-[var(--dossier-secondary)]">
          <DossierIcon name="scale" :size="14" />
          Verdict motion
        </p>
        <div class="dossier-inset space-y-3 bg-[var(--dossier-field)]">
          <div class="flex flex-wrap items-center gap-2">
            <TierBadge :tier="entry.proposal.fromTier" />
            <DossierIcon
              name="arrowLeft"
              :size="16"
              class="rotate-180 text-[var(--dossier-muted)]"
            />
            <span class="sr-only">to</span>
            <TierBadge :tier="entry.proposal.proposedTier" />
          </div>
          <p class="text-[13px] text-[var(--dossier-ink)]">
            Tabled by
            <strong>{{
              myMotion ? 'you' : (entry.proposal.proposedByName ?? 'a former admin')
            }}</strong>
            <span class="dossier-figures text-[12px] text-[var(--dossier-muted)]">
              · {{ proposedWhen }}</span
            >
          </p>
          <p
            class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-[var(--dossier-border)] pt-3 text-[12px]"
          >
            <span class="text-[var(--dossier-muted)]">Latest verified inspection</span>
            <span :class="['italic', latest ? 'text-[var(--dossier-ink)]' : 'text-danger-ink']">{{
              latest ?? 'None on record'
            }}</span>
          </p>
        </div>

        <p
          v-if="decided"
          role="status"
          :class="[
            'flex items-center gap-2 rounded-lg border px-3 py-2.5 text-[13px] font-semibold',
            decided === 'approve'
              ? 'border-[var(--dossier-green)]/40 bg-success-tint text-success-ink'
              : 'border-[var(--dossier-border)] bg-[var(--dossier-paper)] text-[var(--dossier-ink)]',
          ]"
        >
          <DossierIcon :name="decided === 'approve' ? 'checkCircle' : 'info'" :size="16" />
          {{ DECIDED_TEXT[decided] }}
        </p>
        <div v-else-if="myMotion" class="space-y-2">
          <p class="dossier-inset text-[13px] text-[var(--dossier-ink)]">
            You tabled this motion. A different Chair must approve or decline it.
          </p>
          <button type="button" class="dossier-btn" :disabled="busy" @click="decide('withdraw')">
            Withdraw motion
          </button>
        </div>
        <p
          v-else-if="activeAdmins < 2"
          class="rounded-lg border border-warning/40 bg-warning-tint px-3 py-2 text-[13px] text-warning-ink"
        >
          A second active Chair is needed before this can be decided.
        </p>
        <div v-else-if="declining" class="space-y-2">
          <label class="dossier-label" :for="`decline-${entry.proposal.id}`"
            >Reason for declining (internal, never shown publicly)</label
          >
          <textarea
            :id="`decline-${entry.proposal.id}`"
            v-model="reason"
            rows="2"
            maxlength="1000"
            required
            class="dossier-input text-sm"
          ></textarea>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="dossier-btn is-danger-solid"
              :disabled="busy"
              @click="decide('decline')"
            >
              {{ decideBusy ? 'Declining…' : 'Decline motion' }}
            </button>
            <button
              type="button"
              class="dossier-btn is-quiet"
              :disabled="busy"
              @click="declining = false"
            >
              Cancel
            </button>
          </div>
        </div>
        <div v-else class="flex flex-wrap gap-2">
          <button
            type="button"
            :class="['dossier-btn', !canDoBoth && 'is-primary']"
            :disabled="busy"
            @click="decide('approve')"
          >
            <DossierIcon
              :name="decideBusy ? 'refresh' : 'check'"
              :size="16"
              :class="decideBusy && 'dossier-spin'"
            />
            {{ decideBusy ? 'Approving…' : canDoBoth ? 'Approve verdict only' : 'Approve verdict' }}
          </button>
          <button
            type="button"
            class="dossier-btn is-danger"
            :disabled="busy"
            @click="declining = true"
          >
            Decline…
          </button>
        </div>
        <p v-if="decideError" role="alert" class="dossier-error mt-0">{{ decideError }}</p>
        <div v-if="entry.proposal.inspectionId" class="space-y-2">
          <p class="dossier-overline flex flex-wrap items-baseline gap-x-2">
            Field notes from the cited inspection
            <a
              :href="`/admin/venues/${entry.venueId}#visits`"
              class="font-semibold normal-case tracking-normal text-[var(--dossier-primary)] underline"
              >All visits</a
            >
          </p>
          <VenueVisits
            read-only
            :venue-id="entry.venueId"
            :visits="entry.motionVisits"
            :current-user-id="null"
            :today="today"
            empty-text="No visits recorded for that inspection."
          />
        </div>
      </div>
    </div>

    <div v-if="canDoBoth" class="border-t border-[var(--dossier-border)] pt-4">
      <button
        type="button"
        class="dossier-btn is-primary w-full py-3 text-sm"
        :disabled="busy"
        @click="doBoth"
      >
        <DossierIcon
          :name="busy ? 'refresh' : 'check'"
          :size="16"
          :class="busy && 'dossier-spin'"
        />
        {{
          cosignBusy
            ? 'Cosigning inspection…'
            : decideBusy
              ? 'Approving verdict…'
              : `Cosign inspection and approve verdict`
        }}
      </button>
      <p class="dossier-hint text-center">
        Cosigns {{ visit?.pending?.firstAdminName }}'s inspection first, then approves the verdict.
      </p>
    </div>
  </section>
</template>
