<script setup lang="ts">
import { ref } from 'vue';
import {
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
} from 'reka-ui';
import { CONTENT_CLASS, OVERLAY_CLASS, type DialogVariant } from './dialog-variants';

/**
 * A confirmation on Reka UI's AlertDialog: everything AppDialog gives, plus role="alertdialog",
 * and focus starts on Cancel unless `initialFocus` names another control inside it. Confirming only emits
 * `confirm`: the caller decides when to close (it may stay open while busy). Cancel, Escape and
 * closing any other way emit `cancel`. Clicking the backdrop does not dismiss it, as a deliberate
 * confirmation should not be lost to a stray click.
 */
const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    description: string;
    /** Small label above the title. */
    overline?: string;
    variant?: Exclude<DialogVariant, 'bare'>;
    cancelLabel?: string;
    confirmLabel?: string;
    confirmDisabled?: boolean;
    /** CSS selector, inside the dialog, of the control to focus first instead of Cancel. */
    initialFocus?: string;
  }>(),
  {
    overline: '',
    variant: 'plain',
    cancelLabel: 'Cancel',
    confirmLabel: 'Confirm',
    confirmDisabled: false,
    initialFocus: '',
  }
);
const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();

const content = ref<{ $el: HTMLElement } | null>(null);

// Reka's AlertDialogContent always moves focus to Cancel on the next tick, after any handler of
// ours, and calling preventDefault() does not stop it. So the override has to land after that.
function focusInitial() {
  if (!props.initialFocus) return;
  setTimeout(() => content.value?.$el.querySelector<HTMLElement>(props.initialFocus)?.focus(), 0);
}

const SKIN = {
  plain: {
    overline: 'text-xs font-bold uppercase tracking-[0.2em] text-ochre',
    title: 'mt-2 text-2xl font-bold text-ink',
    description: 'mt-3 text-sm text-soot',
    cancel:
      'rounded-lg border border-hairline bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-linen focus:outline-none focus-visible:ring-2 focus-visible:ring-navy',
    confirm:
      'rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white hover:bg-danger-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2',
  },
  dossier: {
    overline: 'dossier-overline text-danger-ink',
    title: 'mt-2 text-2xl font-bold text-danger-ink',
    description: 'mt-3 text-sm leading-6 text-[var(--dossier-muted)]',
    cancel: 'dossier-btn',
    confirm: 'dossier-btn is-danger-solid',
  },
} as const;
</script>

<template>
  <AlertDialogRoot :open="props.open" @update:open="(open) => !open && emit('cancel')">
    <AlertDialogPortal>
      <AlertDialogOverlay :class="OVERLAY_CLASS[props.variant]" />
      <AlertDialogContent
        ref="content"
        :class="[CONTENT_CLASS[props.variant], 'p-6']"
        @open-auto-focus="focusInitial"
      >
        <p v-if="props.overline" :class="SKIN[props.variant].overline">{{ props.overline }}</p>
        <AlertDialogTitle as="h3" :class="SKIN[props.variant].title">{{
          props.title
        }}</AlertDialogTitle>
        <AlertDialogDescription :class="SKIN[props.variant].description">
          {{ props.description }}
        </AlertDialogDescription>
        <slot />
        <div class="mt-6 flex justify-end gap-3">
          <AlertDialogCancel :class="SKIN[props.variant].cancel">
            {{ props.cancelLabel }}
          </AlertDialogCancel>
          <button
            type="button"
            :class="SKIN[props.variant].confirm"
            :disabled="props.confirmDisabled"
            @click="emit('confirm')"
          >
            {{ props.confirmLabel }}
          </button>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>
