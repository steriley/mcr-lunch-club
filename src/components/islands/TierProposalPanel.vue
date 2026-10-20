<script setup lang="ts">
import { computed, ref } from 'vue';
import ProposalActions from './ProposalActions.vue';
import TierBadge from './TierBadge.vue';
import { TIERS, isTierValue, tierLabel } from '@/lib/tiers';

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
  /** e.g. "21 Oct 2026, verified by Sam and Alex", or null when there is none. */
  latestVerifiedInspection: string | null;
  activeAdmins: number;
}>();

const label = (tier: string | null) => (isTierValue(tier) ? tierLabel(tier) : 'No approved tier');
const choices = computed(() => TIERS.filter((tier) => tier.value !== props.currentTier));
const proposedTier = ref('');
const busy = ref(false);
const errorMessage = ref('');
const canPropose = computed(() => !props.pending || props.pending.proposedBy === props.currentUserId);
const proposedWhen = computed(() =>
  props.pending ? new Date(props.pending.proposedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London' }) : ''
);

async function propose() {
  errorMessage.value = '';
  if (!proposedTier.value) {
    errorMessage.value = 'Choose a tier to propose.';
    return;
  }
  busy.value = true;
  try {
    const response = await fetch(`/api/admin/venues/${props.venueId}/proposals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposedTier: proposedTier.value }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      errorMessage.value = result.error ?? 'Could not propose that change.';
      return;
    }
    window.location.reload();
  } catch {
    errorMessage.value = 'Could not propose that change.';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="space-y-4 rounded-2xl border border-[#d9cfb8] bg-[#f9f7f1] p-5 shadow-sm" aria-labelledby="tier-heading">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 id="tier-heading" class="text-lg font-bold text-[#1a1e24]">Tier</h2>
        <p class="mt-1 flex items-center gap-2 text-sm text-[#1a1e24]">Current approved tier: <TierBadge :tier="currentTier" /></p>
      </div>
      <p class="text-xs text-[#535353]">
        Latest verified inspection: {{ latestVerifiedInspection ?? 'No verified inspection' }}
      </p>
    </div>

    <div v-if="pending" role="status" class="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4">
      <p class="text-sm font-semibold text-amber-900">
        Tier change to {{ label(pending.proposedTier) }} proposed by {{ pending.proposedByName ?? 'a former admin' }}. Awaiting a different admin.
      </p>
      <p class="text-xs text-amber-900">{{ label(pending.fromTier) }} → {{ label(pending.proposedTier) }} · {{ proposedWhen }}</p>
      <ProposalActions :proposal-id="pending.id" :proposed-by="pending.proposedBy" :current-user-id="currentUserId" :can-decide="activeAdmins >= 2" />
    </div>

    <p v-if="activeAdmins < 2" class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
      Only one active admin exists. A second active admin is required before any tier change can be approved.
    </p>

    <div v-if="canPropose" class="flex flex-wrap items-end gap-3">
      <label class="block text-sm font-semibold text-[#1a1e24]">
        <span class="mb-2 block">{{ pending ? 'Replace your proposal with' : 'Propose tier change' }}</span>
        <select v-model="proposedTier" class="rounded-lg border border-[#d9cfb8] bg-white px-3 py-2.5 text-base text-[#1a1e24]">
          <option value="" disabled>Choose a tier…</option>
          <option v-for="tier in choices" :key="tier.value" :value="tier.value">{{ tier.label }}</option>
        </select>
      </label>
      <button type="button" :disabled="busy" class="rounded-lg bg-[#1B2F6B] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#111E47] disabled:opacity-60" @click="propose">
        {{ busy ? 'Proposing…' : 'Propose' }}
      </button>
    </div>
    <p v-if="canPropose" class="text-xs text-[#535353]">
      Nothing changes publicly until a different admin approves. Moving into Approved needs a dual-verified inspection (“Visited today”).
    </p>
    <p v-if="errorMessage" role="alert" class="text-sm text-red-700">{{ errorMessage }}</p>
  </section>
</template>
