<script setup lang="ts">
import DossierIcon, { type IconName } from './DossierIcon.vue';

/** A dossier section: serif title with an icon, a tracked tag on the right, then the body. */
defineProps<{ id: string; title: string; tag?: string; icon: IconName; tone?: 'accent' | 'danger' }>();
</script>

<template>
  <section :class="['dossier-card', tone && `is-${tone}`]" :aria-labelledby="`${id}-title`">
    <div class="dossier-card-head">
      <h2 :id="`${id}-title`" class="dossier-card-title">
        <DossierIcon :name="icon" :size="20" />
        <span>{{ title }}</span>
      </h2>
      <span v-if="tag" class="dossier-card-tag">{{ tag }}</span>
    </div>
    <slot />
  </section>
</template>
