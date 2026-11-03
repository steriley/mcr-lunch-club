<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { signOut } from '@/components/admin/sign-out';

defineProps<{
  items: readonly { href: string; label: string; active: boolean }[];
  userName?: string;
  ariaLabel: string;
}>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);

function onPointerDown(event: PointerEvent) {
  if (open.value && root.value && !root.value.contains(event.target as Node)) open.value = false;
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) {
    open.value = false;
    trigger.value?.focus();
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('keydown', onKeydown);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDown);
  document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div ref="root" class="lg:hidden">
    <button
      ref="trigger"
      type="button"
      class="mobile-menu-trigger"
      aria-controls="admin-mobile-menu"
      :aria-expanded="open"
      aria-label="Menu"
      @click="open = !open"
    >
      <span class="mobile-menu-bars" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </span>
    </button>

    <div
      v-if="open"
      id="admin-mobile-menu"
      class="absolute inset-x-0 top-full z-40 border-b border-hairline bg-parchment px-4 pb-4 pt-2 shadow-lg sm:px-6"
    >
      <nav :aria-label="ariaLabel">
        <ul class="flex flex-col gap-1">
          <li v-for="item in items" :key="item.href">
            <a
              :href="item.href"
              :aria-current="item.active ? 'page' : undefined"
              :class="[
                'block rounded-lg px-3 py-2.5 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-navy',
                item.active ? 'bg-surface text-navy shadow-sm' : 'text-ink hover:bg-card',
              ]"
              @click="open = false"
            >
              {{ item.label }}
            </a>
          </li>
        </ul>
      </nav>
      <div class="mt-3 flex items-center justify-between gap-3 border-t border-hairline pt-3">
        <span class="min-w-0 truncate text-sm font-semibold text-soot">
          {{ userName || 'Chair' }}
        </span>
        <button
          type="button"
          class="shrink-0 rounded-full border border-hairline bg-parchment px-3 py-1.5 text-sm font-semibold text-ink transition hover:bg-card"
          @click="signOut"
        >
          Sign out
        </button>
      </div>
    </div>
  </div>
</template>
