<script setup lang="ts">
import { ICON_PATHS, ICON_VIEWBOX, type IconName } from '@/lib/icons';

defineProps<{ name: IconName }>();
</script>

<template>
  <svg class="icon" :viewBox="ICON_VIEWBOX" fill="currentColor" aria-hidden="true" focusable="false">
    <path :d="ICON_PATHS[name]" />
  </svg>
</template>
