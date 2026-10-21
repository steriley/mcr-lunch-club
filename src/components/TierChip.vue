<template>
  <component
    :is="href ? 'a' : 'button'"
    :href="href"
    :type="href ? undefined : 'button'"
    :aria-pressed="href ? undefined : selected"
    :aria-current="href && selected ? 'page' : undefined"
    :class="['ledger-tier-chip', selected && 'is-selected']"
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
  border: 1px solid #D9CFB8;
  border-radius: 999px;
  background: #F7F0DF;
  color: #1e1b17;
  font: 600 12px/1.2 "Plus Jakarta Sans", sans-serif;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease;
}

.ledger-tier-chip:hover:not(.is-selected) {
  background: #fff8f3;
  border-color: #b9ae94;
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
  outline: 2px solid #1B2F6B;
  outline-offset: 2px;
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
