<template>
  <component
    :is="href ? 'a' : 'button'"
    :href="href"
    :type="href ? undefined : 'button'"
    :aria-pressed="href ? undefined : selected"
    :aria-current="href && selected ? 'page' : undefined"
    :aria-disabled="disabled ? 'true' : undefined"
    :title="disabled ? disabledReason : undefined"
    :class="['ledger-tier-chip', selected && 'is-selected', disabled && 'is-disabled']"
    :style="selected ? { backgroundColor: color, borderColor: color } : undefined"
  >
    <span
      :class="['ledger-tier-dot', selected && 'is-selected']"
      :style="!selected ? { backgroundColor: color } : undefined"
      aria-hidden="true"
    ></span>
    <span>{{ name }}</span>
    <span class="nav-count ledger-tier-count">{{ count }}</span>
    <span v-if="selected && showCheck" class="ledger-tier-check" aria-hidden="true">✓</span>
  </component>
</template>

<script setup lang="ts">
defineProps<{
  name: string;
  color: string;
  count: number;
  selected: boolean;
  /** Render as a link (page navigation) instead of a toggle button. */
  href?: string;
  showCheck?: boolean;
  /**
   * Shown as unavailable but kept focusable (aria-disabled), so the click
   * still reaches the parent, which decides to ignore it.
   */
  disabled?: boolean;
  disabledReason?: string;
}>();
</script>

<style>
.ledger-tier-chip {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 7px;
  min-height: 27px;
  padding: 5px 10px;
  border: 1px solid var(--color-hairline);
  border-radius: 999px;
  background: var(--color-paper);
  color: var(--color-ink);
  font: 600 12px/1.2 "Plus Jakarta Sans", sans-serif;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease;
}

.ledger-tier-chip.is-disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.ledger-tier-chip:hover:not(.is-selected):not(.is-disabled) {
  background: var(--color-on-dark);
  border-color: var(--color-hairline-strong);
}

.ledger-tier-chip.is-selected {
  color: white;
}

.ledger-tier-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 50%;
}

.ledger-tier-dot.is-selected {
  background: white !important;
}

.ledger-tier-chip:focus-visible {
  outline: 2px solid var(--color-navy);
  outline-offset: 2px;
}

/* The count: a pill a shade off the chip it sits in, so it reads as part of the chip. */
.ledger-tier-chip .ledger-tier-count {
  display: inline-flex;
  min-width: 22px;
  height: 18px;
  align-items: center;
  justify-content: center;
  padding: 0 7px;
  border-radius: 999px;
  background: rgb(30 27 23 / 7%);
  color: rgb(30 27 23 / 70%);
  font: 700 11px/1 "Plus Jakarta Sans", sans-serif;
  font-variant-numeric: tabular-nums;
}

/* A darker pill rather than a lighter one: white on a lightened tier colour fell below 4.5:1. */
.ledger-tier-chip.is-selected .ledger-tier-count {
  background: rgb(0 0 0 / 22%);
  color: var(--color-white);
}

.ledger-tier-check {
  font-size: 12px;
  line-height: 1;
}

@media (max-width: 720px) {
  .ledger-tier-chip {
    min-height: 28px;
  }
}
</style>
