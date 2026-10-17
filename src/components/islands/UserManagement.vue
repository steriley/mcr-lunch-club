<script setup lang="ts">
import { reactive, ref } from 'vue';
import ConfirmDialog from './ConfirmDialog.vue';

const props = defineProps<{
  users: Array<{
    id: string;
    email: string;
    name: string;
    role: string;
    banned: boolean;
    createdAt: string | null;
  }>;
}>();

const form = reactive({
  email: '',
  name: '',
  password: '',
  role: 'admin',
});

const fieldErrors = reactive<Record<string, string>>({});
const pendingUserId = ref<string | null>(null);
const pendingAction = ref<'ban' | 'unban' | null>(null);
const busyUserId = ref<string | null>(null);

function clearErrors() {
  Object.keys(fieldErrors).forEach((key) => {
    delete fieldErrors[key];
  });
}

async function createChair() {
  clearErrors();

  try {
    const response = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (data.fields) {
        Object.entries(data.fields).forEach(([key, value]) => {
          fieldErrors[key] = String(value);
        });
      }
      if (data.error && !Object.keys(data.fields ?? {}).length) {
        fieldErrors.form = data.error;
      }
      return;
    }

    window.location.reload();
  } catch (error) {
    fieldErrors.form = 'Something went wrong while creating this chair account.';
  }
}

function confirmAction(userId: string, action: 'ban' | 'unban') {
  pendingUserId.value = userId;
  pendingAction.value = action;
}

async function performAction() {
  const userId = pendingUserId.value;
  const action = pendingAction.value;
  if (!userId || !action) return;

  busyUserId.value = userId;
  pendingUserId.value = null;
  pendingAction.value = null;

  try {
    const endpoint = action === 'ban' ? `/api/admin/users/${userId}/ban` : `/api/admin/users/${userId}/unban`;
    const response = await fetch(endpoint, { method: 'POST' });
    if (!response.ok) {
      throw new Error('Unable to update this chair account');
    }
    window.location.reload();
  } finally {
    busyUserId.value = null;
  }
}

async function resetPassword(userId: string) {
  const password = window.prompt('Set a new password for this chair (minimum 12 characters):', '');
  if (!password) return;

  const response = await fetch(`/api/admin/users/${userId}/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });

  const data = await response.json().catch(() => ({ error: 'Unable to reset this password.' }));
  if (!response.ok) {
    window.alert(data.error ?? 'Unable to reset this password.');
    return;
  }

  window.alert('Password updated successfully.');
}
</script>

<template>
  <div class="space-y-6">
    <div class="rounded-2xl border border-[#d9cfb8] bg-[#f9f7f1] p-6 shadow-sm">
      <p class="text-xs font-bold uppercase tracking-[0.2em] text-[#8a5100]">Chair access</p>
      <h2 class="mt-2 text-2xl font-bold text-[#1a1e24]">Create a new chair</h2>

      <form class="mt-5 grid gap-4 md:grid-cols-2" @submit.prevent="createChair">
        <label class="block text-sm font-semibold text-[#1a1e24]">
          <span class="mb-2 block">Name</span>
          <input v-model="form.name" class="w-full rounded-lg border border-[#d9cfb8] bg-white px-3 py-2.5 text-base text-[#1a1e24] focus:border-[#1B2F6B] focus:outline-none" placeholder="Chair name" />
        </label>

        <label class="block text-sm font-semibold text-[#1a1e24]">
          <span class="mb-2 block">Role</span>
          <select v-model="form.role" class="w-full rounded-lg border border-[#d9cfb8] bg-white px-3 py-2.5 text-base text-[#1a1e24] focus:border-[#1B2F6B] focus:outline-none">
            <option value="admin">Admin</option>
            <option value="user">User</option>
          </select>
        </label>

        <label class="block text-sm font-semibold text-[#1a1e24] md:col-span-2">
          <span class="mb-2 block">Email</span>
          <input v-model="form.email" type="email" class="w-full rounded-lg border border-[#d9cfb8] bg-white px-3 py-2.5 text-base text-[#1a1e24] focus:border-[#1B2F6B] focus:outline-none" placeholder="chair@example.com" />
        </label>

        <label class="block text-sm font-semibold text-[#1a1e24] md:col-span-2">
          <span class="mb-2 block">Password</span>
          <input v-model="form.password" type="password" class="w-full rounded-lg border border-[#d9cfb8] bg-white px-3 py-2.5 text-base text-[#1a1e24] focus:border-[#1B2F6B] focus:outline-none" placeholder="Minimum 12 characters" />
        </label>

        <div v-if="fieldErrors.form" class="md:col-span-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {{ fieldErrors.form }}
        </div>

        <div class="md:col-span-2 flex justify-end">
          <button type="submit" class="inline-flex items-center justify-center rounded-lg bg-[#1B2F6B] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#111E47]">
            Create chair
          </button>
        </div>
      </form>
    </div>

    <div class="overflow-hidden rounded-2xl border border-[#d9cfb8] bg-[#f9f7f1] shadow-sm">
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-[#d9cfb8] text-left text-sm text-[#2d2d2d]">
          <thead class="bg-[#f3ecdb] text-[#1a1e24]">
            <tr>
              <th class="px-4 py-3 font-semibold">Chair</th>
              <th class="px-4 py-3 font-semibold">Role</th>
              <th class="px-4 py-3 font-semibold">Status</th>
              <th class="px-4 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[#eadfca]">
            <tr v-if="!users.length">
              <td colspan="4" class="px-4 py-10 text-center text-[#3d3d3d]">No chairs have been created yet.</td>
            </tr>
            <tr v-for="user in users" :key="user.id">
              <td class="px-4 py-3">
                <div class="font-semibold text-[#1a1e24]">{{ user.name || user.email }}</div>
                <div class="text-xs text-[#535353]">{{ user.email }}</div>
              </td>
              <td class="px-4 py-3">
                <span class="rounded-full bg-[#f3ecdb] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#1a1e24]">{{ user.role }}</span>
              </td>
              <td class="px-4 py-3">
                <span :class="['inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]', user.banned ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800']">
                  {{ user.banned ? 'Banned' : 'Active' }}
                </span>
              </td>
              <td class="px-4 py-3">
                <div class="flex justify-end gap-2">
                  <button
                    type="button"
                    class="rounded-lg border border-[#d9cfb8] bg-white px-3 py-1.5 text-xs font-semibold text-[#1a1e24] hover:bg-[#f5efe5]"
                    @click="resetPassword(user.id)"
                  >
                    Reset password
                  </button>
                  <button
                    v-if="!user.banned"
                    type="button"
                    class="rounded-lg bg-[#B92B27] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#8e201d]"
                    @click="confirmAction(user.id, 'ban')"
                    :disabled="busyUserId === user.id"
                  >
                    Ban
                  </button>
                  <button
                    v-else
                    type="button"
                    class="rounded-lg border border-[#d9cfb8] bg-white px-3 py-1.5 text-xs font-semibold text-[#1a1e24] hover:bg-[#f5efe5]"
                    @click="confirmAction(user.id, 'unban')"
                    :disabled="busyUserId === user.id"
                  >
                    Unban
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <ConfirmDialog
    :open="Boolean(pendingUserId)"
    :title="pendingAction === 'ban' ? 'Ban chair' : 'Unban chair'"
    :message="pendingAction === 'ban' ? 'This will block sign-ins for this chair until they are explicitly unbanned.' : 'This will allow this chair to sign in again.'"
    :confirm-label="pendingAction === 'ban' ? 'Ban chair' : 'Unban chair'"
    @cancel="pendingUserId = null; pendingAction = null"
    @confirm="performAction"
  />
</template>
