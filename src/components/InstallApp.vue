<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useStore } from '@nanostores/vue';
import { installOffer, type InstallOffer } from '@/lib/pwa/install';
import { $installPrompt } from '@/stores/pwa';
import Icon from '@/components/Icon.vue';

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
    <Icon name="download" />
    Install app
  </button>
  <p v-else-if="offer === 'ios-hint'" class="install-app-hint">
    <Icon name="download" />
    <span>Install: tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</span>
  </p>
</template>
