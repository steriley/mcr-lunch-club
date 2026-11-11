<script setup lang="ts">
import { ref } from 'vue';
import { apiFetch } from '@/lib/api-fetch';
import { authClient } from '@/lib/auth-client';
import { DISPLAY_NAME_MAX, displayNameSchema } from '@/lib/members/display-name';
import type { MemberProfileView } from '@/lib/members/profiles';

/**
 * The member's own profile (#136): display name and whether it is shown publicly. The server
 * applies the uniqueness, profanity and hidden-name rules; this checks only the shape.
 */
const props = defineProps<{ profile: MemberProfileView }>();

const profile = ref<MemberProfileView>({ ...props.profile });
const name = ref(props.profile.displayName ?? '');
const nameError = ref('');
const message = ref('');
const errorMessage = ref('');
const isSaving = ref(false);
const isSigningOut = ref(false);

async function save(update: { displayName?: string; showPublicly?: boolean }, done: string) {
  message.value = '';
  errorMessage.value = '';
  nameError.value = '';
  isSaving.value = true;
  const result = await apiFetch<MemberProfileView>('/api/member/profile', {
    method: 'PATCH',
    body: update,
    fallback: 'Unable to save your profile.',
  });
  isSaving.value = false;
  if (!result.ok) {
    if (result.fields.displayName) nameError.value = result.fields.displayName;
    else errorMessage.value = result.error;
    return false;
  }
  profile.value = result.data;
  name.value = result.data.displayName ?? '';
  message.value = done;
  return true;
}

async function saveName() {
  const checked = displayNameSchema.safeParse(name.value);
  if (!checked.success) {
    nameError.value = checked.error.issues[0]?.message ?? 'Choose another name.';
    return;
  }
  await save({ displayName: checked.data }, 'Display name saved.');
}

async function togglePublic(event: Event) {
  const showPublicly = (event.target as HTMLInputElement).checked;
  const saved = await save(
    { showPublicly },
    showPublicly ? 'Your name can now appear publicly.' : 'Your name is now private.'
  );
  if (!saved) (event.target as HTMLInputElement).checked = !showPublicly;
}

async function signOut() {
  isSigningOut.value = true;
  try {
    await authClient.signOut();
  } finally {
    window.location.assign('/');
  }
}

const inputClass =
  'w-full rounded-lg border border-hairline bg-surface px-3 py-2.5 text-base text-ink outline-none focus:border-navy disabled:opacity-60';
</script>

<template>
  <section
    class="space-y-5 rounded-2xl border border-hairline bg-parchment p-6 shadow-sm"
    data-testid="member-profile"
  >
    <div>
      <p class="text-xs font-bold uppercase tracking-[0.2em] text-ochre">Your profile</p>
      <h2 class="mt-2 text-2xl font-bold text-ink">Display name</h2>
      <p class="mt-2 text-sm text-soot">
        The name the club shows next to anything you add. Nobody else can use the same one.
      </p>
    </div>

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

    <div
      v-if="profile.nameHidden"
      role="note"
      class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
    >
      <template v-if="profile.canChangeName">
        The Chairs have hidden “{{ profile.displayName }}”, so it isn’t shown anywhere. You can
        choose one new name; if that is hidden too, you won’t be able to set a name.
      </template>
      <template v-else>
        The Chairs have hidden your name again, so you can’t set one for now.
      </template>
    </div>

    <form class="space-y-3" novalidate @submit.prevent="saveName">
      <label class="block text-sm font-semibold text-ink">
        <span class="mb-2 block">Display name</span>
        <input
          v-model="name"
          name="displayName"
          autocomplete="nickname"
          :maxlength="DISPLAY_NAME_MAX + 10"
          :disabled="!profile.canChangeName"
          :class="inputClass"
          placeholder="e.g. Pie Inspector"
        />
        <span v-if="nameError" role="alert" class="mt-1 block text-xs font-medium text-red-700">{{
          nameError
        }}</span>
      </label>
      <button
        type="submit"
        data-testid="member-save-name"
        :disabled="isSaving || !profile.canChangeName"
        class="inline-flex min-h-11 items-center justify-center rounded-lg bg-navy-fixed px-4 py-2.5 text-sm font-semibold text-white hover:bg-deep disabled:opacity-70"
      >
        {{ isSaving ? 'Saving…' : 'Save name' }}
      </button>
    </form>

    <label class="flex items-start gap-3 rounded-xl border border-hairline bg-surface p-4">
      <input
        type="checkbox"
        name="showPublicly"
        class="mt-1 size-4"
        :checked="profile.showPublicly"
        :disabled="isSaving"
        data-testid="member-show-publicly"
        @change="togglePublic"
      />
      <span>
        <span class="block text-sm font-semibold text-ink">Show my name publicly</span>
        <span class="block text-sm text-soot">
          Off by default. While it’s off, anything you add appears without your name.
        </span>
      </span>
    </label>

    <div class="flex flex-wrap gap-3 border-t border-hairline pt-5">
      <a
        href="/members/me/data"
        class="inline-flex min-h-11 items-center rounded-lg border border-hairline bg-surface px-4 text-sm font-semibold text-ink hover:bg-linen"
        >Your data</a
      >
      <button
        type="button"
        data-testid="member-sign-out"
        :disabled="isSigningOut"
        class="inline-flex min-h-11 items-center rounded-lg border border-hairline bg-surface px-4 text-sm font-semibold text-ink hover:bg-linen disabled:opacity-60"
        @click="signOut"
      >
        Sign out
      </button>
    </div>
  </section>
</template>
