<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { apiFetch } from '@/lib/api-fetch';
import { devicePushSupport } from '@/pwa/push-client';

/** Shown on the dashboard once, to a Chair with no device subscribed, until they dismiss it. */
const visible = ref(true);
const installFirst = ref(false);

onMounted(() => {
  const support = devicePushSupport();
  // Nothing to offer in a browser that can never receive them.
  if (support === 'unsupported') visible.value = false;
  installFirst.value = support === 'needs-install';
});

async function dismiss() {
  visible.value = false;
  await apiFetch('/api/admin/push/preferences', {
    method: 'PUT',
    body: { promptDismissed: true },
    fallback: 'Could not save that.',
  });
}
</script>

<template>
  <aside
    v-if="visible"
    class="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-hairline bg-navy-tint p-5 shadow-sm"
    aria-labelledby="notification-prompt-heading"
  >
    <div>
      <h2 id="notification-prompt-heading" class="text-base font-bold text-ink">
        Get notified when a verdict needs your countersign
      </h2>
      <p class="mt-1 text-sm text-soot">
        {{
          installFirst
            ? 'Add MCR Lunch Club to your Home Screen first, then switch them on in your account.'
            : 'Switch on notifications for this device in your account.'
        }}
      </p>
    </div>
    <div class="flex gap-2">
      <a
        href="/admin/account#notifications"
        class="rounded-lg bg-navy-fixed px-4 py-2 text-sm font-semibold text-white no-underline transition hover:bg-deep"
      >
        Set up notifications
      </a>
      <button
        type="button"
        class="rounded-lg border border-hairline bg-parchment px-4 py-2 text-sm font-semibold text-ink transition hover:bg-linen"
        @click="dismiss"
      >
        Not now
      </button>
    </div>
  </aside>
</template>
