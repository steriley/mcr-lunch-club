<script setup lang="ts">
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot } from 'reka-ui';
import { CONTENT_CLASS, OVERLAY_CLASS, type DialogVariant } from './dialog-variants';

/**
 * A modal dialog on Reka UI's Dialog: focus is trapped inside, Escape and the backdrop close it,
 * the page behind is inert and does not scroll, and focus returns to what opened it. The caller
 * puts a `DialogTitle` (from reka-ui) in the slot, which names the dialog.
 */
const props = withDefaults(
  defineProps<{
    open: boolean;
    variant?: DialogVariant;
    /** Added after the variant's classes: spacing, size, stacking. */
    contentClass?: string;
    overlayClass?: string;
  }>(),
  { variant: 'plain', contentClass: '', overlayClass: '' }
);
const emit = defineEmits<{
  'update:open': [open: boolean];
  /** Call `event.preventDefault()` and focus something yourself to choose the first focus. */
  openAutoFocus: [event: Event];
}>();
</script>

<template>
  <DialogRoot :open="props.open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay :class="[OVERLAY_CLASS[props.variant], props.overlayClass]" />
      <!-- No description is wired up: callers that have one pass aria-describedby themselves. -->
      <DialogContent
        :class="[CONTENT_CLASS[props.variant], props.contentClass]"
        :aria-describedby="undefined"
        @open-auto-focus="emit('openAutoFocus', $event)"
      >
        <slot />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
