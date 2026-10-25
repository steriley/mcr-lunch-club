<template>
  <div class="near-me-controls-cluster" :class="{ 'is-hidden-on-mobile': hiddenOnMobile }">
    <!-- Recentre on me -->
    <button
      type="button"
      id="btn-near-me-recenter"
      class="near-me-control-btn"
      :class="{ 'is-active': following }"
      :disabled="!hasPosition"
      aria-label="Recentre on me"
      title="Recentre on me"
      @click="emit('recenter')"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>
      </svg>
    </button>

    <!-- Home (Spinningfields view) -->
    <button
      type="button"
      id="btn-near-me-home"
      class="near-me-control-btn"
      aria-label="Return to Spinningfields Base"
      title="Return to Spinningfields Base"
      @click="emit('home')"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    </button>

    <!-- Set location manually -->
    <button
      type="button"
      id="btn-near-me-manual"
      class="near-me-control-btn"
      :class="{ 'is-active': picking }"
      aria-label="Set location manually"
      title="Set location manually on map"
      @click="emit('pick')"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
        <circle cx="12" cy="10" r="3"/>
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  /** A position is known, so Recentre has somewhere to go. */
  hasPosition: boolean;
  /** The map is following the user's position. */
  following: boolean;
  /** Picking a position on the map, or one was picked by hand. */
  picking: boolean;
  /** The phone's sheet is full height and covers the controls. */
  hiddenOnMobile: boolean;
}>();

const emit = defineEmits<{ recenter: []; home: []; pick: [] }>();
</script>

<style scoped>
/* Floating Controls Cluster */
.near-me-controls-cluster {
  pointer-events: auto;
  position: absolute;
  right: var(--near-me-safe-right);
  display: flex;
  flex-direction: column;
  gap: 10px;
  z-index: 1200;
  transition: bottom 0.3s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.2s ease, transform 0.2s ease;
}

@media (min-width: 1024px) {
  .near-me-controls-cluster {
    bottom: calc(var(--near-me-safe-bottom) + 16px);
  
  }
}

@media (max-width: 1023px) {
  .near-me-controls-cluster {
    bottom: calc(var(--sheet-current-height, 140px) + 14px);
  
  }

  .near-me-controls-cluster.is-hidden-on-mobile {
    opacity: 0;
    pointer-events: none;
    transform: translateY(20px);
  
  }
}

.near-me-control-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 9999px;
  background-color: rgba(26, 30, 36, 0.95);
  backdrop-filter: blur(8px);
  color: var(--color-cream);
  border: 1px solid rgba(197, 155, 39, 0.6);
  box-shadow: var(--near-me-shadow);
  cursor: pointer;
  transition: all 0.15s ease-in-out;
}

.near-me-control-btn:hover:not(:disabled) {
  background-color: var(--near-me-crimson);
  border-color: var(--color-cream);
  color: var(--color-white);
  transform: scale(1.05);
}

.near-me-control-btn.is-active {
  background-color: var(--color-control-active);
  border-color: var(--color-control-active-edge);
  color: var(--color-white);
  box-shadow: 0 0 12px rgba(37, 99, 235, 0.6);
}

.near-me-control-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
}

.near-me-control-btn:focus-visible {
  outline: 2px solid var(--near-me-gold);
  outline-offset: 2px;
}

.near-me-control-btn {
  background-color: var(--ledger-deep);
  color: var(--ledger-parchment);
  border-color: var(--ledger-gold);
}

.near-me-control-btn:hover:not(:disabled) {
  background-color: var(--ledger-navy);
  border-color: var(--ledger-gold);
  color: var(--ledger-parchment);
}

.near-me-control-btn.is-active {
  background-color: var(--ledger-green);
  border-color: var(--ledger-parchment);
  color: var(--color-white);
  box-shadow: 0 0 0 2px rgb(30 122 78 / 22%);
}

.near-me-control-btn:focus-visible {
  outline-color: var(--ledger-gold);
}

@media (prefers-reduced-motion: reduce) {
  .near-me-controls-cluster,
  .near-me-control-btn {
    transition-duration: 0.01ms !important;
  
  }
}

.near-me-control-btn {
  width: 44px;
  height: 44px;
}
</style>
