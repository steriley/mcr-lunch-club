<script setup lang="ts">
import { computed } from 'vue';
import { authClient } from '@/lib/auth-client';

const props = defineProps<{ userName?: string }>();

const displayName = computed(() => props.userName || 'Chair');

async function signOut() {
  try {
    await authClient.signOut();
  } catch (error) {
    console.error('Failed to sign out.', error);
  } finally {
    window.location.assign('/admin/login');
  }
}
</script>

<template>
  <div class="flex items-center gap-3">
    <span class="rounded-full bg-card px-3 py-1.5 text-sm font-semibold text-ink">{{ displayName }}</span>
    <button type="button" class="rounded-full border border-hairline bg-parchment px-3 py-1.5 text-sm font-semibold text-ink transition hover:bg-card" @click="signOut">
      Sign out
    </button>
  </div>
</template>
