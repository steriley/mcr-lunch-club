<script setup lang="ts">
import { computed, ref } from 'vue';
import TierChip from '@/components/TierChip.vue';
import { apiFetch } from '@/lib/api-fetch';
import {
  MEMBER_COSTS,
  MEMBER_VERDICT_VOTES,
  VERDICT_VOTE_TIERS,
  type MemberCost,
  type MemberVerdictVote,
} from '@/lib/member-inspection-display';
import {
  DISH_MAX,
  PULL_QUOTE_MAX,
  memberInspectionInputSchema,
  memberInspectionUpdateSchema,
} from '@/lib/member-inspection-rules';
import type { LoggableVenue, MemberInspectionView } from '@/lib/member-inspections';
import { tierInfo } from '@/lib/tiers';

/**
 * "Log a lunch" (#137): one screen, no steps, phone first. The same form edits a log within 24
 * hours of saving it (`existing`); then the venue, the day and the on-site check are fixed. The
 * server applies the one-a-day rule, the venue rule and the profanity filter; this checks only
 * the shape. The location is asked for only if the member ticks the on-site check, read once,
 * sent with the log for the server to compare with the venue, and never stored.
 */
const props = defineProps<{
  venues: LoggableVenue[];
  /** The venue to start with (from /log/<slug> or Near Me). */
  venueId?: string | null;
  /** The days a lunch may be logged for (Europe/London). */
  dates: { min: string; max: string };
  /** Editing this log instead of adding one. */
  existing?: MemberInspectionView | null;
}>();

const editing = computed(() => Boolean(props.existing));

const venueId = ref(props.existing?.venue.id ?? props.venueId ?? '');
const visitDate = ref(props.existing?.visitDate ?? props.dates.max);
const dish = ref(props.existing?.dish ?? '');
const cost = ref<MemberCost | ''>(props.existing?.cost ?? '');
const verdictVote = ref<MemberVerdictVote | ''>(props.existing?.verdictVote ?? '');
const pullQuote = ref(props.existing?.pullQuote ?? '');
const checkOnSite = ref(false);

const fieldErrors = ref<Record<string, string>>({});
const errorMessage = ref('');
const isSaving = ref(false);
const statusText = ref('');

/** The browser's position once, or null if it can't or won't give one in time. */
function currentPosition(): Promise<{ lat: number; lng: number } | null> {
  if (!('geolocation' in navigator)) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 }
    );
  });
}

function draft() {
  return {
    dish: dish.value,
    cost: cost.value || undefined,
    verdictVote: verdictVote.value || undefined,
    pullQuote: pullQuote.value,
  };
}

async function submit() {
  fieldErrors.value = {};
  errorMessage.value = '';
  const fields = draft();
  const checked = editing.value
    ? memberInspectionUpdateSchema.safeParse(fields)
    : memberInspectionInputSchema.safeParse({
        ...fields,
        venueId: venueId.value,
        visitDate: visitDate.value,
        position: null,
      });
  if (!checked.success) {
    const errors: Record<string, string> = {};
    for (const issue of checked.error.issues) {
      const field = String(issue.path[0] ?? 'form');
      errors[field] ??= issue.message;
    }
    fieldErrors.value = errors;
    errorMessage.value = 'Please correct the highlighted fields.';
    return;
  }

  isSaving.value = true;
  let body: Record<string, unknown> = checked.data;
  if (!editing.value && checkOnSite.value) {
    statusText.value = 'Checking you’re there…';
    body = { ...body, position: await currentPosition() };
  }
  statusText.value = 'Saving…';
  const result = await apiFetch<MemberInspectionView>(
    editing.value
      ? `/api/member/inspections/${encodeURIComponent(props.existing!.id)}`
      : '/api/member/inspections',
    {
      method: editing.value ? 'PATCH' : 'POST',
      body,
      fallback: 'Unable to save your lunch.',
      offline: 'You’re offline. Your lunch wasn’t saved; try again when you’re back online.',
    }
  );
  isSaving.value = false;
  statusText.value = '';
  if (!result.ok) {
    fieldErrors.value = result.fields;
    errorMessage.value = result.error;
    return;
  }
  const saved = result.data;
  const notes = [
    editing.value ? 'updated' : 'saved',
    !editing.value && saved.verifiedOnSite ? 'verified' : '',
  ].filter(Boolean);
  window.location.assign(`/members/me/inspections?${notes.join('&')}`);
}

/** Each vote reads as the verdict tier it points at, so the buttons carry the club's own wording, colour and mark. */
const VOTE_OPTIONS = MEMBER_VERDICT_VOTES.map((vote) => ({
  vote,
  tier: tierInfo(VERDICT_VOTE_TIERS[vote]),
}));

const inputClass =
  'w-full rounded-lg border border-hairline bg-surface px-3 py-2.5 text-base text-ink outline-none focus:border-navy disabled:opacity-60';
const labelClass = 'mb-2 block text-sm font-semibold text-ink';
const errorClass = 'mt-1 block text-xs font-medium text-red-700';
const choiceClass =
  'flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-hairline bg-surface px-3 text-sm font-semibold text-ink has-[:checked]:border-navy has-[:checked]:bg-navy-fixed has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-navy';
</script>

<template>
  <form
    class="space-y-5 rounded-2xl border border-hairline bg-parchment p-5 shadow-sm sm:p-6"
    novalidate
    data-testid="log-lunch-form"
    @submit.prevent="submit"
  >
    <p
      v-if="errorMessage"
      role="alert"
      class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {{ errorMessage }}
    </p>

    <div class="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <label class="block">
        <span :class="labelClass">Venue</span>
        <select
          v-model="venueId"
          name="venueId"
          :disabled="editing"
          :class="inputClass"
          :aria-invalid="Boolean(fieldErrors.venueId)"
        >
          <option value="" disabled>Choose a venue</option>
          <option v-for="venue in venues" :key="venue.id" :value="venue.id">
            {{ venue.name }}
          </option>
        </select>
        <span v-if="fieldErrors.venueId" role="alert" :class="errorClass">{{
          fieldErrors.venueId
        }}</span>
      </label>
      <label class="block">
        <span :class="labelClass">Date</span>
        <input
          v-model="visitDate"
          type="date"
          name="visitDate"
          :min="dates.min"
          :max="dates.max"
          :disabled="editing"
          :class="inputClass"
          :aria-invalid="Boolean(fieldErrors.visitDate)"
        />
        <span v-if="fieldErrors.visitDate" role="alert" :class="errorClass">{{
          fieldErrors.visitDate
        }}</span>
      </label>
    </div>

    <label class="block">
      <span :class="labelClass">What you ate</span>
      <input
        v-model="dish"
        name="dish"
        autocomplete="off"
        :maxlength="DISH_MAX + 10"
        :class="inputClass"
        placeholder="e.g. Steak pie, chips and gravy"
        :aria-invalid="Boolean(fieldErrors.dish)"
      />
      <span v-if="fieldErrors.dish" role="alert" :class="errorClass">{{ fieldErrors.dish }}</span>
    </label>

    <fieldset>
      <legend :class="labelClass">What it cost</legend>
      <div class="grid grid-cols-3 gap-2">
        <label v-for="option in MEMBER_COSTS" :key="option" :class="choiceClass">
          <input v-model="cost" class="sr-only" type="radio" name="cost" :value="option" />
          {{ option }}
        </label>
      </div>
      <span v-if="fieldErrors.cost" role="alert" :class="errorClass">{{ fieldErrors.cost }}</span>
    </fieldset>

    <fieldset>
      <legend :class="labelClass">Your verdict</legend>
      <div class="grid gap-2 sm:grid-cols-3">
        <label
          v-for="{ vote, tier } in VOTE_OPTIONS"
          :key="vote"
          class="flex min-h-11 cursor-pointer rounded-lg [&_.is-static]:cursor-pointer [&_.ledger-tier-chip]:h-full [&_.ledger-tier-chip]:min-h-11 [&_.ledger-tier-chip]:w-full [&_.ledger-tier-chip]:justify-center [&_.ledger-tier-chip]:rounded-lg [&_.ledger-tier-chip]:px-3 [&_.ledger-tier-chip]:py-2.5 [&_.ledger-tier-chip]:text-base has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-navy has-[:focus-visible]:ring-offset-2"
        >
          <input
            v-model="verdictVote"
            class="sr-only"
            type="radio"
            name="verdictVote"
            :value="vote"
          />
          <TierChip
            is-static
            show-check
            :name="tier.label"
            :color="tier.color"
            :glyph="tier.glyph"
            :selected="verdictVote === vote"
          />
        </label>
      </div>
      <span v-if="fieldErrors.verdictVote" role="alert" :class="errorClass">{{
        fieldErrors.verdictVote
      }}</span>
    </fieldset>

    <label class="block">
      <span :class="labelClass"
        >One line for the ledger <span class="font-normal text-soot">(optional)</span></span
      >
      <input
        v-model="pullQuote"
        name="pullQuote"
        autocomplete="off"
        :maxlength="PULL_QUOTE_MAX + 10"
        :class="inputClass"
        placeholder="e.g. The gravy alone deserves a tier of its own."
        :aria-invalid="Boolean(fieldErrors.pullQuote)"
      />
      <span class="mt-1 block text-xs text-soot"
        >{{ pullQuote.length }} / {{ PULL_QUOTE_MAX }}</span
      >
      <span v-if="fieldErrors.pullQuote" role="alert" :class="errorClass">{{
        fieldErrors.pullQuote
      }}</span>
    </label>

    <label
      v-if="!editing"
      class="flex items-start gap-3 rounded-xl border border-hairline bg-surface p-4"
    >
      <input v-model="checkOnSite" type="checkbox" name="checkOnSite" class="mt-1 size-4" />
      <span>
        <span class="block text-sm font-semibold text-ink">I’m at the venue now: verify it</span>
        <span class="block text-sm text-soot">
          Uses your location once, when you save. The club checks you’re within 150&nbsp;m and keeps
          only “verified”, never where you were.
        </span>
      </span>
    </label>
    <p v-else-if="existing?.verifiedOnSite" class="text-sm text-soot">Verified on site.</p>

    <div class="border-t border-hairline pt-5">
      <button
        type="submit"
        data-testid="log-lunch-save"
        :disabled="isSaving"
        class="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-navy-fixed px-5 py-2.5 text-sm font-semibold text-white hover:bg-deep disabled:opacity-70"
      >
        {{ isSaving ? statusText || 'Saving…' : editing ? 'Save changes' : 'Log this lunch' }}
      </button>
    </div>
  </form>
</template>
