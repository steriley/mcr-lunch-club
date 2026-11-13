<script setup lang="ts">
import AppAlertDialog from '@/components/ui/AppAlertDialog.vue';

defineProps<{
  open: boolean;
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}>();

defineEmits<{ (event: 'confirm'): void; (event: 'cancel'): void }>();
</script>

<template>
  <AppAlertDialog
    :open="open"
    overline="Confirm"
    :title="title || 'Are you sure?'"
    :description="message || 'This action cannot be undone.'"
    :cancel-label="cancelLabel || 'Cancel'"
    :confirm-label="confirmLabel || 'Confirm'"
    @confirm="$emit('confirm')"
    @cancel="$emit('cancel')"
  />
</template>
