<template>
  <!-- One notification at a time: geolocation state, manual position or picking mode. -->
  <div class="near-me-status-bar">
    <div class="near-me-status-pill" :class="banner.type">
      <span class="near-me-status-icon" aria-hidden="true">{{ banner.icon }}</span>
      <span class="near-me-status-text">{{ banner.text }}</span>
      <button
        v-if="banner.action"
        type="button"
        id="btn-status-banner-action"
        class="near-me-status-action"
        @click="banner.action.handler"
      >
        {{ banner.action.label }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { StatusBanner } from '@/lib/near-me/status-banner';

defineProps<{ banner: StatusBanner }>();
</script>

<style scoped>
/* Status Notification Banner */
.near-me-status-bar {
  display: flex;
  justify-content: center;
  width: 100%;
  pointer-events: none;
  margin-top: 6px;
  z-index: 1250;
}

.near-me-status-pill {
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background-color: rgba(26, 30, 36, 0.95);
  backdrop-filter: blur(8px);
  color: #f9f7f1;
  padding: 6px 14px;
  border-radius: 9999px;
  border: 1px solid var(--near-me-gold);
  font-size: 0.75rem;
  box-shadow: var(--near-me-shadow);
  max-width: calc(100vw - 32px);
}

.near-me-status-pill.warning {
  border-color: #d97706;
  background-color: rgba(69, 26, 3, 0.95);
  color: #fef3c7;
}

.near-me-status-pill.error {
  border-color: #dc2626;
  background-color: rgba(69, 10, 10, 0.95);
  color: #fee2e2;
}

.near-me-status-pill.manual {
  border-color: #a855f7;
  background-color: rgba(59, 7, 100, 0.95);
  color: #f3e8ff;
}

.near-me-status-action {
  background-color: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: #ffffff;
  padding: 2px 8px;
  border-radius: 9999px;
  font-weight: 600;
  font-size: 0.72rem;
  cursor: pointer;
  transition: all 0.15s ease;
  margin-left: 4px;
}

.near-me-status-action:hover {
  background-color: var(--near-me-gold);
  color: #1a1e24;
}

.near-me-status-pill {
  background-color: var(--ledger-card);
  color: var(--ledger-deep);
  border-color: var(--ledger-border);
}

.near-me-status-pill.warning {
  background-color: var(--near-me-warning-bg);
  color: var(--near-me-warning-ink);
  border-color: var(--ledger-gold);
}

.near-me-status-pill.error {
  background-color: var(--near-me-error-bg);
  color: var(--near-me-error-ink);
  border-color: #b92b27;
}

.near-me-status-pill.manual {
  background-color: var(--near-me-manual-bg);
  color: var(--near-me-manual-ink);
  border-color: #7c3a82;
}

.near-me-status-action {
  background-color: var(--ledger-deep);
  border-color: var(--ledger-deep);
  color: var(--ledger-parchment);
}

.near-me-status-action:hover {
  background-color: var(--ledger-navy);
  color: #ffffff;
}

.near-me-status-action {
  flex-shrink: 0;
  white-space: nowrap;
  min-height: 32px;
  padding-inline: 12px;
}
</style>
