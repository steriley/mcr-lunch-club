<script setup lang="ts">
import { computed } from 'vue';
import type { VisitStatus } from '@/lib/inspections';
import DossierIcon from './DossierIcon.vue';
import { formatDateTime } from '@/lib/dates';

/**
 * The two signature lines of a dual-Chair inspection, with the "n / 2 affirmed" bar. Shared by the
 * venue dossier's concord card and the Pending page, so a cosign looks the same in both places.
 */
const props = defineProps<{ status: VisitStatus }>();

const signatures = computed(() => (props.status.confirmed ? 2 : props.status.pending ? 1 : 0));
const first = computed(() => props.status.confirmed ?? props.status.pending);
</script>

<template>
  <div class="dossier-inset space-y-3 bg-[var(--dossier-field)]" role="status">
    <div class="flex items-center justify-between gap-2">
      <span class="dossier-overline">Quorum concordance</span>
      <span
        :class="[
          'dossier-figures text-xs font-bold',
          signatures === 2 ? 'text-success-ink' : 'text-[var(--dossier-secondary)]',
        ]"
      >
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
          <DossierIcon
            :name="first ? 'checkCircle' : 'circle'"
            :size="16"
            :class="first ? 'text-success-ink' : 'text-[var(--dossier-border)]'"
          />
          <span :class="first ? 'font-semibold' : 'text-[var(--dossier-muted)]'">{{
            first?.firstAdminName ?? 'Awaiting first Chair'
          }}</span>
        </span>
        <span
          v-if="first"
          class="dossier-figures shrink-0 text-[11px] text-[var(--dossier-muted)]"
          >{{ formatDateTime(first.firstAt) }}</span
        >
      </li>
      <li class="flex items-center justify-between gap-2">
        <span class="flex min-w-0 items-center gap-2">
          <DossierIcon
            :name="status.confirmed ? 'checkCircle' : 'circle'"
            :size="16"
            :class="status.confirmed ? 'text-success-ink' : 'text-[var(--dossier-border)]'"
          />
          <span :class="status.confirmed ? 'font-semibold' : 'text-[var(--dossier-muted)]'">
            {{ status.confirmed?.secondAdminName ?? 'Awaiting second Chair cosigner' }}
          </span>
        </span>
        <span
          v-if="status.confirmed?.confirmedAt"
          class="dossier-figures shrink-0 text-[11px] text-[var(--dossier-muted)]"
        >
          {{ formatDateTime(status.confirmed.confirmedAt) }}
        </span>
        <span
          v-else-if="status.pending"
          class="shrink-0 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--dossier-amber)]"
          >Pending</span
        >
      </li>
    </ul>
  </div>
</template>
