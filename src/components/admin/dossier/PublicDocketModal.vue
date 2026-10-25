<script lang="ts">
/** What the public dining slip shows, taken from the form as it stands (saved or not). */
export interface DocketPreview {
  name: string;
  tierLabel: string | null;
  cuisineLabel: string;
  cost: string;
  address: string;
  walkingTimeMin: number | null;
  distanceMiles: number | null;
  pullQuote: string;
  lunchSpecial: string;
  /** The primary photo, cropped as the public pages crop it. */
  image: { url: string; alt: string; focalX: number | null; focalY: number | null } | null;
  lastInspection: string;
  /** Public page URL, or null while the venue is hidden. */
  publicUrl: string | null;
  hiddenText: string | null;
}
</script>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import DossierIcon from './DossierIcon.vue';
import { milesText, walkText } from '@/lib/route-display';
import { focalStyle } from '@/lib/image-upload';

/** Ceremonial broadsheet preview of the venue's public docket, with a print button. */
const props = defineProps<{ open: boolean; preview: DocketPreview; unsaved: boolean }>();
const emit = defineEmits<{ (event: 'close'): void }>();

const closeButton = ref<HTMLButtonElement | null>(null);
let previouslyFocused: HTMLElement | null = null;

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close');
}

function print() {
  document.body.classList.add('printing-docket');
  window.addEventListener('afterprint', () => document.body.classList.remove('printing-docket'), { once: true });
  window.print();
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
  <div v-if="open" class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-fixed/45 px-4 py-8" @click.self="emit('close')">
    <article
      role="dialog"
      aria-modal="true"
      aria-labelledby="docket-slip-title"
      class="dossier docket-slip relative w-full max-w-xl overflow-hidden rounded-2xl border-2 border-[var(--dossier-primary-container)] bg-[var(--dossier-canvas)] shadow-2xl"
    >
      <div class="flex items-center justify-between gap-3 bg-[var(--dossier-primary-fill)] px-5 py-3 text-parchment-fixed">
        <span class="text-[11px] font-bold uppercase tracking-[0.16em]">MCR Lunch Club · Public docket</span>
        <span class="docket-slip-actions flex gap-2">
          <button type="button" class="dossier-btn is-small" @click="print"><DossierIcon name="printer" :size="14" /> Print</button>
          <button ref="closeButton" type="button" class="dossier-btn is-small" aria-label="Close preview" @click="emit('close')"><DossierIcon name="x" :size="14" /></button>
        </span>
      </div>

      <p v-if="unsaved || preview.hiddenText" class="docket-slip-actions border-b border-[var(--dossier-border)] bg-warning-tint px-5 py-2 text-[12px] text-warning-ink">
        {{ unsaved ? 'Preview includes unsaved edits. ' : '' }}{{ preview.hiddenText ?? '' }}
      </p>

      <div v-if="preview.image" class="relative aspect-[3/2] bg-[var(--dossier-card)]">
        <img :src="preview.image.url" :alt="preview.image.alt" :style="{ objectPosition: focalStyle(preview.image) }" class="h-full w-full object-cover" decoding="async" />
      </div>

      <div class="space-y-4 p-6">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <p class="dossier-overline">{{ preview.cuisineLabel }} · {{ preview.cost }}</p>
            <h2 id="docket-slip-title" class="mt-1 text-3xl font-bold leading-tight text-[var(--dossier-primary)]">{{ preview.name || 'Unnamed venue' }}</h2>
            <p v-if="preview.address" class="mt-1 text-sm text-[var(--dossier-muted)]">{{ preview.address }}</p>
          </div>
          <div
            class="flex h-20 w-20 shrink-0 rotate-[-8deg] flex-col items-center justify-center rounded-full border-4 border-double border-[var(--dossier-secondary)] bg-peach text-center text-[var(--dossier-secondary)] shadow-inner"
            aria-label="Wax seal"
          >
            <span class="text-[9px] font-bold uppercase tracking-[0.12em]">Sealed</span>
            <span class="dossier-serif px-1 text-[11px] font-bold leading-tight">{{ preview.tierLabel ?? 'No tier' }}</span>
          </div>
        </div>

        <blockquote v-if="preview.pullQuote" class="dossier-serif border-l-2 border-[var(--dossier-secondary)] pl-3 text-lg italic text-[var(--dossier-ink)]">
          “{{ preview.pullQuote }}”
        </blockquote>

        <div class="grid grid-cols-2 gap-3 text-center">
          <div class="dossier-inset">
            <p class="dossier-overline">From Spinningfields</p>
            <p class="dossier-serif mt-1 text-xl font-bold text-[var(--dossier-primary)]">{{ walkText(preview.walkingTimeMin) }}</p>
          </div>
          <div class="dossier-inset">
            <p class="dossier-overline">Distance</p>
            <p class="dossier-serif mt-1 text-xl font-bold text-[var(--dossier-primary)]">{{ milesText(preview.distanceMiles) }}</p>
          </div>
        </div>

        <div v-if="preview.lunchSpecial" class="rounded-lg border border-[var(--dossier-secondary)]/40 bg-warning-tint p-4">
          <p class="dossier-overline text-[var(--dossier-secondary)]">Eat like us</p>
          <p class="dossier-serif mt-1 italic">“{{ preview.lunchSpecial }}”</p>
        </div>

        <p class="border-t border-[var(--dossier-border)] pt-3 text-[12px] text-[var(--dossier-muted)]">Last sovereign audit: {{ preview.lastInspection }}</p>

        <a v-if="preview.publicUrl" :href="preview.publicUrl" target="_blank" rel="noopener" class="docket-slip-actions dossier-btn w-full">
          <DossierIcon name="external" :size="16" /> Open the live public page
        </a>
      </div>
    </article>
  </div>
</template>
