<script setup lang="ts">
import { computed, ref } from 'vue';
import ConfirmDialog from './ConfirmDialog.vue';
import { apiFetch } from '@/lib/api-fetch';
import { formatDate } from '@/lib/dates';
import type { MemberSummary } from '@/lib/members/profiles';

/**
 * The Chairs' Members list (#136): when each member joined, their display name, and the three
 * moderation actions. Every action is logged in member_events.
 */
const props = defineProps<{ members: MemberSummary[] }>();

type Action = 'hide-name' | 'allow-name' | 'ban' | 'unban';

const rows = ref<MemberSummary[]>(props.members.map((member) => ({ ...member })));
const busy = ref<Record<string, boolean>>({});
const pending = ref<{ member: MemberSummary; action: Action } | null>(null);
const message = ref('');
const errorMessage = ref('');

const label = (member: MemberSummary) => member.displayName ?? 'No display name';

async function perform() {
  const target = pending.value;
  pending.value = null;
  if (!target) return;
  message.value = '';
  errorMessage.value = '';
  busy.value[target.member.id] = true;
  const result = await apiFetch<{ member?: MemberSummary } & Partial<MemberSummary>>(
    `/api/admin/members/${encodeURIComponent(target.member.id)}/${target.action}`,
    { method: 'POST', fallback: 'Unable to update this member.' }
  );
  busy.value[target.member.id] = false;
  if (!result.ok) {
    errorMessage.value = result.error;
    return;
  }
  // Hide and allow answer with the member; ban and unban wrap it.
  const updated = result.data.member ?? (result.data as MemberSummary);
  Object.assign(target.member, updated);
  message.value = {
    'hide-name': `“${updated.displayName}” is hidden. The member may choose one new name.`,
    'allow-name': `${label(updated)} may choose a display name again.`,
    ban: `${label(updated)} is banned and has been signed out.`,
    unban: `${label(updated)} may sign in again.`,
  }[target.action];
}

const pendingCopy = computed(() => {
  const target = pending.value;
  if (!target) return { title: '', message: '', confirm: '' };
  const name = label(target.member);
  switch (target.action) {
    case 'hide-name':
      return {
        title: 'Hide display name',
        message: `“${name}” will no longer appear anywhere public and nobody can use it again. The member may choose one new name; if that is hidden too, they can’t set a name until a Chair allows it.`,
        confirm: 'Hide name',
      };
    case 'allow-name':
      return {
        title: 'Allow a new name',
        message:
          'This member may choose a display name again. If it is hidden, they are locked out again.',
        confirm: 'Allow',
      };
    case 'ban':
      return {
        title: 'Ban member',
        message: `${name} will be signed out and unable to sign in. If they delete their account, the ban goes with it.`,
        confirm: 'Ban',
      };
    case 'unban':
      return {
        title: 'Lift ban',
        message: `${name} will be able to sign in again.`,
        confirm: 'Lift ban',
      };
  }
});

const buttonClass =
  'whitespace-nowrap rounded-lg border border-hairline bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-linen disabled:opacity-60';
const badgeClass =
  'inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]';
</script>

<template>
  <div class="space-y-6">
    <p
      v-if="message"
      role="status"
      class="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
    >
      {{ message }}
    </p>
    <p
      v-if="errorMessage"
      role="alert"
      class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {{ errorMessage }}
    </p>

    <p
      v-if="!rows.length"
      class="rounded-2xl border border-hairline bg-parchment p-6 text-sm text-soot shadow-sm"
    >
      Nobody has joined yet.
    </p>

    <div v-else class="overflow-hidden rounded-2xl border border-hairline bg-parchment shadow-sm">
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-hairline text-left text-sm text-coal">
          <thead class="bg-card text-ink">
            <tr>
              <th scope="col" class="px-4 py-3 font-semibold">Display name</th>
              <th scope="col" class="px-4 py-3 font-semibold">Joined</th>
              <th scope="col" class="px-4 py-3 font-semibold">Status</th>
              <th scope="col" class="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-sand">
            <tr v-for="member in rows" :key="member.id" data-testid="member-row">
              <td class="px-4 py-3">
                <span
                  :class="[
                    'font-semibold',
                    member.displayName ? 'text-ink' : 'italic font-normal text-graphite',
                    member.nameHidden && 'line-through',
                  ]"
                  >{{ label(member) }}</span
                >
              </td>
              <td class="whitespace-nowrap px-4 py-3">{{ formatDate(member.joinedAt) }}</td>
              <td class="px-4 py-3">
                <div class="flex flex-wrap gap-1.5">
                  <span v-if="member.banned" :class="[badgeClass, 'bg-red-100 text-red-800']"
                    >Banned</span
                  >
                  <span
                    v-if="member.nameLocked"
                    :class="[badgeClass, 'bg-amber-100 text-amber-900']"
                    >Name locked</span
                  >
                  <span
                    v-else-if="member.nameHidden"
                    :class="[badgeClass, 'bg-amber-100 text-amber-900']"
                    >Name hidden</span
                  >
                  <span
                    v-if="!member.banned && !member.nameHidden"
                    :class="[badgeClass, 'bg-emerald-100 text-emerald-800']"
                    >Active</span
                  >
                </div>
              </td>
              <td class="px-4 py-3">
                <div class="flex justify-end gap-2">
                  <button
                    v-if="member.displayName && !member.nameHidden"
                    type="button"
                    :class="buttonClass"
                    :disabled="busy[member.id]"
                    @click="pending = { member, action: 'hide-name' }"
                  >
                    Hide name
                  </button>
                  <button
                    v-if="member.nameLocked"
                    type="button"
                    :class="buttonClass"
                    :disabled="busy[member.id]"
                    @click="pending = { member, action: 'allow-name' }"
                  >
                    Allow a new name
                  </button>
                  <button
                    v-if="!member.banned"
                    type="button"
                    class="rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-white hover:bg-danger-strong disabled:opacity-60"
                    :disabled="busy[member.id]"
                    @click="pending = { member, action: 'ban' }"
                  >
                    Ban
                  </button>
                  <button
                    v-else
                    type="button"
                    :class="buttonClass"
                    :disabled="busy[member.id]"
                    @click="pending = { member, action: 'unban' }"
                  >
                    Lift ban
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <ConfirmDialog
      :open="Boolean(pending)"
      :title="pendingCopy.title"
      :message="pendingCopy.message"
      :confirm-label="pendingCopy.confirm"
      @cancel="pending = null"
      @confirm="perform"
    />
  </div>
</template>
