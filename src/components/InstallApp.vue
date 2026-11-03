<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useStore } from '@nanostores/vue';
import { installOffer, type InstallOffer } from '@/lib/pwa/install';
import { $installPrompt } from '@/stores/pwa';

/**
 * "Install app" in the footer. Never a pop-up: Chrome-family browsers get the real prompt when the
 * visitor presses the button; iOS Safari, which has no prompt API, gets a "Share → Add to Home
 * Screen" hint. Both are hidden once the app is installed.
 */
const prompt = useStore($installPrompt);
const offer = ref<InstallOffer>(null);

function refresh() {
  offer.value = installOffer(
    {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      maxTouchPoints: navigator.maxTouchPoints,
      displayModeStandalone: window.matchMedia('(display-mode: standalone)').matches,
      navigatorStandalone: (navigator as Navigator & { standalone?: boolean }).standalone === true,
    },
    prompt.value !== null
  );
}

onMounted(() => {
  refresh();
  $installPrompt.listen(refresh);
  window.addEventListener('appinstalled', refresh);
});

async function install() {
  const event = prompt.value;
  if (!event) return;
  await event.prompt();
  await event.userChoice.catch(() => null);
  $installPrompt.set(null); // a prompt can be used once
  refresh();
}
</script>

<template>
  <button v-if="offer === 'prompt'" type="button" class="install-app" @click="install">
    <span aria-hidden="true">⬇</span> Install app
  </button>
  <p v-else-if="offer === 'ios-hint'" class="install-app-hint">
    Install: tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
  </p>
</template>

<style scoped>
.install-app {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.75rem;
  padding: 0 0.25rem;
  font: inherit;
  font-weight: 600;
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 3px;
  background: none;
  cursor: pointer;
}

.install-app-hint {
  margin: 0;
  max-width: 16rem;
  font-size: 0.8125rem;
  line-height: 1.4;
  opacity: 0.85;
}
</style>
