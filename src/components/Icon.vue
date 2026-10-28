<script setup lang="ts">
import { computed } from 'vue';
import { iconShape, type IconName } from '@/lib/icons';

const props = defineProps<{ name: IconName }>();
const shape = computed(() => iconShape(props.name));
</script>

<template>
  <svg :class="['icon', shape.stroke && 'icon-stroke']" :viewBox="shape.viewBox" aria-hidden="true" focusable="false">
    <path :d="shape.d" />
  </svg>
</template>
