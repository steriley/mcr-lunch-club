<template>
  <article class="field-panel">
    <div class="field-panel-heading">
      <h2>
        <slot name="icon" />
        {{ title }}
      </h2>
      <slot name="badge" />
    </div>
    <p v-if="description" class="section-purpose">{{ description }}</p>
    <slot />
    <div class="field-panel-footer">
      <slot name="footer" />
    </div>
  </article>
</template>

<script setup lang="ts">
/**
 * The shared frame of the two home page field panels (Chairs' Deliberation and
 * Atmospheric Dispatch): the heading with its icon and optional badge, a line
 * saying what the panel is for, the body, and the footer. Styles are the global
 * `.field-panel*` rules.
 */
defineProps<{ title: string; description?: string }>();
</script>
