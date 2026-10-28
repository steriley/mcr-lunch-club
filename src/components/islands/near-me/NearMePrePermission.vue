<template>
  <!-- Shown for a beat before the browser's location prompt, so the prompt isn't a surprise. -->
  <transition name="nm-fade">
    <div
      v-if="visible"
      class="near-me-prepermission"
      role="status"
      aria-live="polite"
      id="near-me-prepermission"
    >
      <div class="near-me-prepermission-inner">
        <span class="near-me-prepermission-icon" aria-hidden="true"><Icon name="pin" /></span>
        <div class="near-me-prepermission-body">
          <h3 class="near-me-prepermission-title">Location Required</h3>
          <p class="near-me-prepermission-text">
            Used to rank nearby venues. Never sent or stored.
          </p>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import Icon from '@/components/Icon.vue';
defineProps<{ visible: boolean }>();
</script>

<style scoped>
/* =====================================================   Phase 5: Pre-Permission Modal
   ============================================================ */
.near-me-prepermission {
  pointer-events: auto;
  position: absolute;
  /* Sits above status bar, centred horizontally, below the top bar */
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(480px, calc(100vw - 48px));
  z-index: 1300;
}

.near-me-prepermission-inner {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  background: rgba(22, 26, 32, 0.97);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1.5px solid var(--near-me-gold);
  border-radius: 16px;
  padding: 20px;
  box-shadow:
    0 20px 40px -8px rgba(0, 0, 0, 0.6),
    0 0 0 1px rgba(197, 155, 39, 0.15);
}

.near-me-prepermission-icon {
  font-size: 2rem;
  flex-shrink: 0;
  line-height: 1;
  margin-top: 2px;
}

.near-me-prepermission-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.near-me-prepermission-title {
  font-family: 'Playfair Display', 'Playfair Display Fallback', Georgia, serif;
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-white);
  margin: 0;
}

.near-me-prepermission-text {
  font-size: 0.78rem;
  color: var(--color-on-dark-grey);
  line-height: 1.5;
  margin: 0;
}

/* =====================================================   Phase 5: Fade transition for pre-permission modal
   ============================================================ */
.nm-fade-enter-active,
.nm-fade-leave-active {
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}

.nm-fade-enter-from,
.nm-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, calc(-50% + 8px));
}
</style>
