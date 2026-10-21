<script lang="ts">
/** A timeline entry as serialised for the browser (see src/lib/venue-history.ts). */
export interface AuditEntry {
  id: string;
  kind: 'amendment' | 'motion' | 'inspection' | 'event';
  when: string;
  text: string;
  note?: string;
}
</script>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import DossierIcon from './DossierIcon.vue';

/** Side drawer with the venue's audit trail: inspections, tier motions, amendments and closures. */
const props = defineProps<{ open: boolean; entries: AuditEntry[]; historyUrl: string }>();
const emit = defineEmits<{ (event: 'close'): void }>();

const KIND_LABELS: Record<AuditEntry['kind'], string> = { inspection: 'Inspection', motion: 'Motion', amendment: 'Amendment', event: 'Action' };
const KIND_TONES: Record<AuditEntry['kind'], string> = {
  inspection: 'bg-[#E8F5EE] text-[#1E7A4E]',
  motion: 'bg-[#FEF5E7] text-[#C27803]',
  amendment: 'bg-[#F0F2F5] text-[#5A6474]',
  event: 'bg-[#FDF0F0] text-[#B92B27]',
};

const closeButton = ref<HTMLButtonElement | null>(null);
let previouslyFocused: HTMLElement | null = null;

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close');
}

watch(
  () => props.open,
  async (open) => {
    if (typeof window === 'undefined') return;
    if (open) {
      previouslyFocused = document.activeElement as HTMLElement | null;
      window.addEventListener('keydown', onKeydown);
      await nextTick();
      closeButton.value?.focus();
    } else {
      window.removeEventListener('keydown', onKeydown);
      previouslyFocused?.focus();
    }
  }
);

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex justify-end bg-[#1E1B17]/35" @click.self="emit('close')">
    <aside
      role="dialog"
      aria-modal="true"
      aria-labelledby="audit-title"
      class="dossier flex h-full w-full max-w-md flex-col border-l border-[var(--dossier-border)] bg-[var(--dossier-canvas)] shadow-2xl"
    >
      <div class="flex items-start justify-between gap-3 border-b border-[var(--dossier-border)] p-5">
        <div>
          <p class="dossier-overline">Judicial inspection log</p>
          <h2 id="audit-title" class="mt-1 text-2xl font-bold text-[var(--dossier-primary)]">Audit history</h2>
        </div>
        <button ref="closeButton" type="button" class="dossier-btn is-quiet is-small" aria-label="Close audit history" @click="emit('close')">
          <DossierIcon name="x" />
        </button>
      </div>

      <ol v-if="entries.length" class="flex-1 space-y-3 overflow-y-auto p-5">
        <li v-for="entry in entries" :key="entry.id" class="rounded-lg border border-[var(--dossier-border)] bg-[var(--dossier-card)] p-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span :class="['rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]', KIND_TONES[entry.kind]]">{{ KIND_LABELS[entry.kind] }}</span>
            <span class="dossier-mono text-[11px] text-[var(--dossier-muted)]">{{ entry.when }}</span>
          </div>
          <p class="mt-2 text-[13px] leading-[19px]">{{ entry.text }}</p>
          <p v-if="entry.note" class="mt-1 text-[12px] italic text-[var(--dossier-muted)]">Reason: {{ entry.note }}</p>
        </li>
      </ol>
      <p v-else class="flex-1 p-5 text-sm text-[var(--dossier-muted)]">Nothing on record yet.</p>

      <div class="border-t border-[var(--dossier-border)] p-5">
        <a :href="historyUrl" class="dossier-btn w-full">
          <DossierIcon name="history" :size="16" />
          Full history with field changes and snapshots
        </a>
      </div>
    </aside>
  </div>
</template>
