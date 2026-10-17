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
    <span class="rounded-full bg-[#f3ecdb] px-3 py-1.5 text-sm font-semibold text-[#1a1e24]">{{ displayName }}</span>
    <button type="button" class="rounded-full border border-[#d9cfb8] bg-[#f9f7f1] px-3 py-1.5 text-sm font-semibold text-[#1a1e24] transition hover:bg-[#f3ecdb]" @click="signOut">
      Sign out
    </button>
  </div>
</template>
