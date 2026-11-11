<script setup lang="ts">
import { computed, ref } from 'vue';
import { apiFetch } from '@/lib/api-fetch';
import {
  MEMBER_VERDICT_VOTES,
  VERDICT_VOTE_LABELS,
  type MemberVerdictVote,
} from '@/lib/member-inspection-display';
import {
  DISH_MAX,
  PULL_QUOTE_MAX,
  memberInspectionInputSchema,
  memberInspectionUpdateSchema,
  parsePounds,
} from '@/lib/member-inspection-rules';
import type { LoggableVenue, MemberInspectionView } from '@/lib/member-inspections';

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
const price = ref(
  props.existing?.pricePaidPence != null ? (props.existing.pricePaidPence / 100).toFixed(2) : ''
);
const qualityScore = ref(props.existing?.qualityScore ?? 0);
const valueScore = ref(props.existing?.valueScore ?? 0);
const wouldReturn = ref<boolean | null>(props.existing?.wouldReturn ?? null);
const verdictVote = ref<MemberVerdictVote | ''>(props.existing?.verdictVote ?? '');
const pullQuote = ref(props.existing?.pullQuote ?? '');
const checkOnSite = ref(false);

const fieldErrors = ref<Record<string, string>>({});
const errorMessage = ref('');
const isSaving = ref(false);
const statusText = ref('');

const STARS = [1, 2, 3, 4, 5] as const;
type ScoreKey = 'qualityScore' | 'valueScore';
const SCORE_ROWS: { key: ScoreKey; label: string }[] = [
  { key: 'qualityScore', label: 'The food' },
  { key: 'valueScore', label: 'Value for money' },
];
const scoreRefs = { qualityScore, valueScore };
const scoreOf = (key: ScoreKey) => scoreRefs[key].value;
const setScore = (key: ScoreKey, stars: number) => {
  scoreRefs[key].value = stars;
};

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
  const pence = parsePounds(price.value);
  return {
    dish: dish.value,
    // Anything the pound parser can't read goes through as a string, so the schema names the field.
    pricePaidPence: pence === null || Number.isFinite(pence) ? pence : price.value,
    qualityScore: qualityScore.value || undefined,
    valueScore: valueScore.value || undefined,
    wouldReturn: wouldReturn.value ?? undefined,
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

    <div class="grid gap-4 sm:grid-cols-[2fr_1fr]">
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

    <div class="grid gap-4 sm:grid-cols-[2fr_1fr]">
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
      <label class="block">
        <span :class="labelClass"
          >Price paid <span class="font-normal text-soot">(optional)</span></span
        >
        <input
          v-model="price"
          name="price"
          inputmode="decimal"
          autocomplete="off"
          :class="inputClass"
          placeholder="£8.50"
          :aria-invalid="Boolean(fieldErrors.pricePaidPence)"
        />
        <span v-if="fieldErrors.pricePaidPence" role="alert" :class="errorClass">{{
          fieldErrors.pricePaidPence
        }}</span>
      </label>
    </div>

    <fieldset v-for="row in SCORE_ROWS" :key="row.key">
      <legend :class="labelClass">{{ row.label }}</legend>
      <div class="flex gap-1">
        <label
          v-for="star in STARS"
          :key="star"
          class="star-choice"
          :class="{ 'is-lit': star <= scoreOf(row.key) }"
        >
          <input
            type="radio"
            class="sr-only"
            :name="row.key"
            :value="star"
            :checked="scoreOf(row.key) === star"
            @change="setScore(row.key, star)"
          />
          <span aria-hidden="true">★</span>
          <span class="sr-only">{{ star }} {{ star === 1 ? 'star' : 'stars' }}</span>
        </label>
      </div>
      <span v-if="fieldErrors[row.key]" role="alert" :class="errorClass">{{
        fieldErrors[row.key]
      }}</span>
    </fieldset>

    <fieldset>
      <legend :class="labelClass">Would you go back?</legend>
      <div class="grid grid-cols-2 gap-2 sm:max-w-xs">
        <label :class="choiceClass">
          <input
            v-model="wouldReturn"
            class="sr-only"
            type="radio"
            name="wouldReturn"
            :value="true"
          />
          Yes
        </label>
        <label :class="choiceClass">
          <input
            v-model="wouldReturn"
            class="sr-only"
            type="radio"
            name="wouldReturn"
            :value="false"
          />
          No
        </label>
      </div>
      <span v-if="fieldErrors.wouldReturn" role="alert" :class="errorClass">{{
        fieldErrors.wouldReturn
      }}</span>
    </fieldset>

    <fieldset>
      <legend :class="labelClass">Your verdict</legend>
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label v-for="vote in MEMBER_VERDICT_VOTES" :key="vote" :class="choiceClass">
          <input
            v-model="verdictVote"
            class="sr-only"
            type="radio"
            name="verdictVote"
            :value="vote"
          />
          {{ VERDICT_VOTE_LABELS[vote] }}
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

    <div class="flex flex-wrap items-center gap-3 border-t border-hairline pt-5">
      <button
        type="submit"
        data-testid="log-lunch-save"
        :disabled="isSaving"
        class="inline-flex min-h-11 items-center justify-center rounded-lg bg-navy-fixed px-5 py-2.5 text-sm font-semibold text-white hover:bg-deep disabled:opacity-70"
      >
        {{ isSaving ? statusText || 'Saving…' : editing ? 'Save changes' : 'Log this lunch' }}
      </button>
      <a
        href="/members/me/inspections"
        class="inline-flex min-h-11 items-center rounded-lg border border-hairline bg-surface px-4 text-sm font-semibold text-ink hover:bg-linen"
        >Your lunches</a
      >
    </div>
  </form>
</template>

<style scoped>
.star-choice {
  display: inline-grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  cursor: pointer;
  color: var(--ledger-border);
  font-size: 28px;
  line-height: 1;
}

.star-choice.is-lit {
  color: var(--color-gold);
}

.star-choice:has(:focus-visible) {
  outline: 2px solid var(--color-navy);
  outline-offset: 2px;
}
</style>
