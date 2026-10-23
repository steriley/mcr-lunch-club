<template>
  <article
    class="field-panel"
    @mouseenter="paused = true"
    @mouseleave="paused = false"
    @focusin="paused = true"
    @focusout="paused = false"
  >
    <div class="field-panel-heading">
      <h2>
        <svg class="field-icon is-gold" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 3v17M5 6h14M7 6 3.8 13h6.4L7 6Zm10 0-3.2 7h6.4L17 6ZM7 20h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        Chairs' Deliberation
      </h2>
      <span class="decree-badge" :class="{ 'is-pending': current < 0 }">Decree #{{ DECREES[Math.max(current, 0)].number }}</span>
    </div>
    <!-- Every decree sits in one grid cell, so the panel keeps the height of the longest. -->
    <div class="deliberation-stack" aria-live="off">
      <blockquote
        v-for="(decree, index) in DECREES"
        :key="decree.number"
        class="deliberation-quote"
        :class="{ 'is-active': index === current }"
        :aria-hidden="index === current ? undefined : 'true'"
      >
        “{{ decree.text }}”
      </blockquote>
    </div>
    <div class="field-panel-footer">
      <span>By Order of the Lunch Club Chairs</span>
      <a href="/manifesto">Read Codex <span aria-hidden="true">→</span></a>
    </div>
  </article>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { DECREES } from '@/lib/decrees';

const CYCLE_MS = 60_000;

// -1 until mounted: the page is cached and shared, so the opening decree is picked in the
// browser (not on the server) and the panel fades it in.
const current = ref(-1);
const paused = ref(false);
let timer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  current.value = Math.floor(Math.random() * DECREES.length);
  timer = setInterval(() => {
    if (!paused.value) current.value = (current.value + 1) % DECREES.length;
  }, CYCLE_MS);
});

onUnmounted(() => clearInterval(timer));
</script>
