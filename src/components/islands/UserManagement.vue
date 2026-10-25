<script setup lang="ts">
import { reactive, ref } from 'vue';
import ConfirmDialog from './ConfirmDialog.vue';
import { MIN_PASSWORD_LENGTH } from '@/lib/password-policy';
import { USER_ROLES, createUserSchema, resetPasswordSchema } from '@/lib/user-schema';
import { apiFetch } from '@/lib/api-fetch';

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  banned: boolean;
  createdAt: string | null;
}

const props = defineProps<{ users: UserRow[]; currentUserId: string }>();

const rows = ref<UserRow[]>(props.users.map((user) => ({ ...user })));
const form = reactive({ name: '', email: '', password: '', role: 'admin' });
const errors = reactive<Record<string, string>>({});
const formError = ref('');
const message = ref('');
const errorMessage = ref('');
const isCreating = ref(false);
const busy = ref<Record<string, boolean>>({});
const pending = ref<{ user: UserRow; action: 'ban' | 'unban' } | null>(null);

const resetTarget = ref<UserRow | null>(null);
const resetPassword = ref('');
const resetError = ref('');

function clearErrors() {
  for (const key of Object.keys(errors)) delete errors[key];
  formError.value = '';
}

function roleLabel(role: string) {
  return USER_ROLES.find((option) => option.value === role)?.label ?? role;
}

async function createUser() {
  clearErrors();
  message.value = '';
  const checked = createUserSchema.safeParse({ ...form });
  if (!checked.success) {
    for (const issue of checked.error.issues) errors[String(issue.path[0] ?? 'form')] ??= issue.message;
    return;
  }

  isCreating.value = true;
  const result = await apiFetch<{ user: { id: string; email: string; name: string; role?: string | null; createdAt?: string | null } }>('/api/admin/users', { method: 'POST', body: checked.data, fallback: 'Unable to create this account.' });
  isCreating.value = false;
  if (!result.ok) {
    Object.assign(errors, result.fields);
    formError.value = result.error;
    return;
  }
  const { user } = result.data;
  rows.value.unshift({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role ?? checked.data.role,
    banned: false,
    createdAt: user.createdAt ?? null,
  });
  message.value = `Account created for ${user.email}. Share the password with them securely; they can change it under Account.`;
  Object.assign(form, { name: '', email: '', password: '', role: 'admin' });
}

async function performAction() {
  const target = pending.value;
  pending.value = null;
  if (!target) return;

  message.value = '';
  errorMessage.value = '';
  busy.value[target.user.id] = true;
  const result = await apiFetch(`/api/admin/users/${encodeURIComponent(target.user.id)}/${target.action}`, {
    method: 'POST',
    fallback: 'Unable to update this account.',
  });
  busy.value[target.user.id] = false;
  if (!result.ok) {
    errorMessage.value = result.error;
    return;
  }
  target.user.banned = target.action === 'ban';
  message.value = `${target.user.email} has been ${target.action === 'ban' ? 'deactivated and signed out' : 'reactivated'}.`;
}

function openReset(user: UserRow) {
  resetTarget.value = user;
  resetPassword.value = '';
  resetError.value = '';
}

async function submitReset() {
  const user = resetTarget.value;
  if (!user) return;
  resetError.value = '';
  const checked = resetPasswordSchema.safeParse({ password: resetPassword.value });
  if (!checked.success) {
    resetError.value = checked.error.issues[0]?.message ?? 'Invalid password.';
    return;
  }

  busy.value[user.id] = true;
  const result = await apiFetch(`/api/admin/users/${encodeURIComponent(user.id)}/reset-password`, {
    method: 'POST',
    body: checked.data,
    fallback: 'Unable to reset this password.',
  });
  busy.value[user.id] = false;
  if (!result.ok) {
    resetError.value = result.fields.password ?? result.error;
    return;
  }
  resetTarget.value = null;
  message.value = `Temporary password set for ${user.email}. They have been signed out everywhere.`;
}

const inputClass = 'w-full rounded-lg border border-hairline bg-white px-3 py-2.5 text-base text-ink focus:border-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-navy/30';
const errorClass = 'mt-1 block text-xs font-medium text-red-700';
</script>

<template>
  <div class="space-y-6">
    <p v-if="message" role="status" class="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ message }}</p>
    <p v-if="errorMessage" role="alert" class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{{ errorMessage }}</p>

    <div class="overflow-hidden rounded-2xl border border-hairline bg-parchment shadow-sm">
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-hairline text-left text-sm text-[#2d2d2d]">
          <thead class="bg-card text-ink">
            <tr>
              <th scope="col" class="px-4 py-3 font-semibold">Name</th>
              <th scope="col" class="px-4 py-3 font-semibold">Access</th>
              <th scope="col" class="px-4 py-3 font-semibold">Status</th>
              <th scope="col" class="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-sand">
            <tr v-for="user in rows" :key="user.id">
              <td class="px-4 py-3">
                <div class="font-semibold text-ink">
                  {{ user.name || user.email }}
                  <span v-if="user.id === currentUserId" class="ml-1 text-xs font-normal text-graphite">(you)</span>
                </div>
                <div class="text-xs text-graphite">{{ user.email }}</div>
              </td>
              <td class="px-4 py-3 text-xs">{{ roleLabel(user.role) }}</td>
              <td class="px-4 py-3">
                <span :class="['inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]', user.banned ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800']">
                  {{ user.banned ? 'Deactivated' : 'Active' }}
                </span>
              </td>
              <td class="px-4 py-3">
                <div class="flex justify-end gap-2">
                  <button type="button" class="whitespace-nowrap rounded-lg border border-hairline bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:bg-linen disabled:opacity-60" :disabled="busy[user.id]" @click="openReset(user)">
                    Reset password
                  </button>
                  <template v-if="user.id !== currentUserId">
                    <button v-if="!user.banned" type="button" class="rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#8e201d] disabled:opacity-60" :disabled="busy[user.id]" @click="pending = { user, action: 'ban' }">
                      Deactivate
                    </button>
                    <button v-else type="button" class="rounded-lg border border-hairline bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:bg-linen disabled:opacity-60" :disabled="busy[user.id]" @click="pending = { user, action: 'unban' }">
                      Reactivate
                    </button>
                  </template>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <form class="rounded-2xl border border-hairline bg-parchment p-6 shadow-sm" novalidate @submit.prevent="createUser">
      <p class="text-xs font-bold uppercase tracking-[0.2em] text-ochre">Add a Chair</p>
      <h2 class="mt-2 text-2xl font-bold text-ink">Create an account</h2>
      <p class="mt-2 text-sm text-soot">There is no public sign-up. Choose an initial password and share it with them securely.</p>

      <div v-if="formError" role="alert" class="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{{ formError }}</div>

      <div class="mt-5 grid gap-4 md:grid-cols-2">
        <label class="block text-sm font-semibold text-ink">
          <span class="mb-2 block">Name</span>
          <input v-model="form.name" autocomplete="off" :class="inputClass" />
          <span v-if="errors.name" :class="errorClass">{{ errors.name }}</span>
        </label>
        <label class="block text-sm font-semibold text-ink">
          <span class="mb-2 block">Access</span>
          <select v-model="form.role" :class="inputClass">
            <option v-for="role in USER_ROLES" :key="role.value" :value="role.value">{{ role.label }}</option>
          </select>
        </label>
        <label class="block text-sm font-semibold text-ink">
          <span class="mb-2 block">Email</span>
          <input v-model="form.email" type="email" autocomplete="off" :class="inputClass" />
          <span v-if="errors.email" :class="errorClass">{{ errors.email }}</span>
        </label>
        <label class="block text-sm font-semibold text-ink">
          <span class="mb-2 block">Initial password</span>
          <input v-model="form.password" type="password" autocomplete="new-password" :class="inputClass" :placeholder="`At least ${MIN_PASSWORD_LENGTH} characters`" />
          <span v-if="errors.password" :class="errorClass">{{ errors.password }}</span>
        </label>
      </div>
      <div class="mt-5 flex justify-end">
        <button type="submit" :disabled="isCreating" class="inline-flex items-center justify-center rounded-lg bg-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-deep disabled:opacity-70">
          {{ isCreating ? 'Creating…' : 'Create account' }}
        </button>
      </div>
    </form>

    <ConfirmDialog
      :open="Boolean(pending)"
      :title="pending?.action === 'ban' ? 'Deactivate account' : 'Reactivate account'"
      :message="pending?.action === 'ban' ? `${pending?.user.email} will be signed out and unable to sign in until reactivated.` : `${pending?.user.email} will be able to sign in again.`"
      :confirm-label="pending?.action === 'ban' ? 'Deactivate' : 'Reactivate'"
      @cancel="pending = null"
      @confirm="performAction"
    />

    <div v-if="resetTarget" class="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/40 px-4" @click.self="resetTarget = null" @keydown.esc="resetTarget = null">
      <form role="dialog" aria-modal="true" aria-labelledby="reset-title" class="w-full max-w-md rounded-2xl border border-hairline bg-parchment p-6 shadow-xl" novalidate @submit.prevent="submitReset">
        <p class="text-xs font-bold uppercase tracking-[0.2em] text-ochre">Reset password</p>
        <h3 id="reset-title" class="mt-2 text-xl font-bold text-ink">{{ resetTarget.email }}</h3>
        <p class="mt-2 text-sm text-soot">Set a temporary password. They will be signed out everywhere and should change it after signing in.</p>
        <label class="mt-4 block text-sm font-semibold text-ink">
          <span class="mb-2 block">Temporary password</span>
          <input v-model="resetPassword" type="password" autocomplete="new-password" autofocus :class="inputClass" />
          <span v-if="resetError" role="alert" :class="errorClass">{{ resetError }}</span>
        </label>
        <div class="mt-6 flex justify-end gap-3">
          <button type="button" class="rounded-lg border border-hairline bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-linen" @click="resetTarget = null">Cancel</button>
          <button type="submit" :disabled="busy[resetTarget.id]" class="rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-deep disabled:opacity-70">Set password</button>
        </div>
      </form>
    </div>
  </div>
</template>
