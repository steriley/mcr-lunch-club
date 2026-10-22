<script setup lang="ts">
import { computed, ref } from 'vue';
import ProposalActions from './ProposalActions.vue';
import TierBadge from './TierBadge.vue';
import DossierCard from './dossier/DossierCard.vue';
import DossierIcon from './dossier/DossierIcon.vue';
import { formatDateTime } from '@/lib/dates';
import { TIERS, isTierValue, tierLabel } from '@/lib/tiers';
import { apiFetch } from '@/lib/api-fetch';

interface PendingProposal {
  id: string;
  fromTier: string | null;
  proposedTier: string;
  proposedBy: string | null;
  proposedByName: string | null;
  proposedAt: string;
}

const props = defineProps<{
  venueId: string;
  currentTier: string | null;
  pending: PendingProposal | null;
  currentUserId: string;
  activeAdmins: number;
}>();

const label = (tier: string | null) => (isTierValue(tier) ? tierLabel(tier) : 'No approved tier');
const choices = computed(() => TIERS.filter((tier) => tier.value !== props.currentTier));
const proposedTier = ref('');
const busy = ref(false);
const errorMessage = ref('');
const canPropose = computed(() => !props.pending || props.pending.proposedBy === props.currentUserId);
const proposedWhen = computed(() => (props.pending ? formatDateTime(props.pending.proposedAt) : ''));

async function propose() {
  errorMessage.value = '';
  if (!proposedTier.value) {
    errorMessage.value = 'Choose a tier to propose.';
    return;
  }
  busy.value = true;
  const result = await apiFetch(`/api/admin/venues/${props.venueId}/proposals`, {
    method: 'POST',
    body: { proposedTier: proposedTier.value },
    fallback: 'Could not propose that change.',
  });
  busy.value = false;
  if (!result.ok) {
    errorMessage.value = result.error;
    return;
  }
  window.location.reload();
}
</script>

<template>
  <DossierCard id="tier-decree" title="Tier Decree" tag="Judicial bench" icon="scale">
    <div class="dossier-inset flex flex-wrap items-center justify-between gap-2 bg-[var(--dossier-field)]">
      <span class="text-[13px] font-semibold">Active decree tier</span>
      <TierBadge :tier="currentTier" />
    </div>

    <div v-if="pending" role="status" class="space-y-2 rounded-lg border border-[#C27803]/50 bg-[#FEF5E7] p-3">
      <p class="text-[13px] font-semibold text-[#7a4b02]">
        Motion: {{ label(pending.fromTier) }} → {{ label(pending.proposedTier) }}, tabled by {{ pending.proposedByName ?? 'a former admin' }}.
      </p>
      <p class="text-[12px] text-[#7a4b02]">{{ proposedWhen }} · awaiting a different Chair</p>
      <ProposalActions :proposal-id="pending.id" :proposed-by="pending.proposedBy" :current-user-id="currentUserId" :can-decide="activeAdmins >= 2" />
    </div>

    <p v-if="activeAdmins < 2" class="rounded-lg border border-[#C27803]/40 bg-[#FEF5E7] px-3 py-2 text-[13px] text-[#7a4b02]">
      Only one active Chair exists. A second active Chair is required before any motion can pass.
    </p>

    <div v-if="canPropose">
      <label class="dossier-label" for="propose-tier">{{ pending ? 'Replace your motion with' : 'Propose tier motion' }}</label>
      <div class="flex gap-2">
        <select id="propose-tier" v-model="proposedTier" class="dossier-input min-w-0 flex-1 text-sm">
          <option value="" disabled>Choose a tier…</option>
          <option v-for="tier in choices" :key="tier.value" :value="tier.value">{{ tier.label }}</option>
        </select>
        <button type="button" :disabled="busy" class="dossier-btn is-primary" @click="propose">{{ busy ? 'Proposing…' : 'Propose' }}</button>
      </div>
    </div>
    <p v-if="errorMessage" role="alert" class="dossier-error mt-0">{{ errorMessage }}</p>

    <p class="flex gap-2 rounded-lg border border-[var(--dossier-border)] bg-[var(--dossier-paper)] p-3 text-[12px] leading-[18px] text-[var(--dossier-muted)]">
      <DossierIcon name="info" :size="16" class="mt-px text-[var(--dossier-secondary)]" />
      <span>
        <strong class="text-[var(--dossier-ink)]">Rule 4.B:</strong> nothing changes publicly until a different Chair cosigns the motion. Promotion to
        <em>Approved</em> cannot take effect by motion alone; it needs the dual-verified inspection above.
      </span>
    </p>
  </DossierCard>
</template>
