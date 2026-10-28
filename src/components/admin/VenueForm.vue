<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import ConfirmDialog from './ConfirmDialog.vue';
import PlaceSearch, { type PlaceCandidate } from './PlaceSearch.vue';
import TierBadge from './TierBadge.vue';
import TierProposalPanel from './TierProposalPanel.vue';
import VenueImages from './VenueImages.vue';
import AuditHistoryDrawer, { type AuditEntry } from './dossier/AuditHistoryDrawer.vue';
import ConcordCard from './dossier/ConcordCard.vue';
import DossierCard from './dossier/DossierCard.vue';
import DossierIcon from './dossier/DossierIcon.vue';
import DossierMap from './dossier/DossierMap.vue';
import GovernanceCard from './dossier/GovernanceCard.vue';
import PublicDocketModal, { type DocketPreview } from './dossier/PublicDocketModal.vue';
import { CUISINES, cuisineLabel, isCuisineValue } from '@/lib/cuisines';
import { formatDate, formatDateTime } from '@/lib/dates';
import { INSPECTION_OUTCOME_LABELS } from '@/lib/inspection-display';
import { routeStatus, type RouteStatus } from '@/lib/route-status';
import { TIERS, isTierValue, tierLabel } from '@/lib/tiers';
import {
  COST_BANDS,
  COST_BAND_LABELS,
  isOutsideUk,
  slugify,
  venueCreateSchema,
  venueInputSchema,
} from '@/lib/venue-schema';
import type { SerializedVenueImage } from '@/lib/image-upload';
import { apiFetch } from '@/lib/api-fetch';
import type { VisitStatus } from '@/lib/inspections';
import type { SuggestionPrefill } from '@/lib/suggestions';
import type { SerializedProposal } from '@/lib/tier-proposals';
import type { SerializedVenue } from '@/lib/venues';
import { hiddenReason } from '@/lib/visibility';

/**
 * The venue dossier: the Chairs' edit page for one venue (and the new-venue
 * form). Field edits are dirty-tracked and saved together from the decree bar;
 * inspections, tier motions and closing act at once in their own cards.
 */

/** Edit mode only: the cards beside the form. */
interface DossierContext {
  currentTier: string | null;
  currentUserId: string;
  currentUserName: string;
  visitStatus: VisitStatus;
  latestVerifiedInspection: string | null;
  pendingMotion: SerializedProposal | null;
  activeAdmins: number;
  closed: boolean;
  /** e.g. "Marked closed on 21st Oct 26 by Sam." */
  closedText: string | null;
  timeline: AuditEntry[];
}

const props = defineProps<{
  mode: 'create' | 'edit';
  venue?: SerializedVenue | null;
  /** Accepting a member's suggestion: only the name and cost band are copied; the rest is reference. */
  suggestion?: SuggestionPrefill | null;
  updatedByName?: string | null;
  uploadsEnabled?: boolean;
  /** Edit mode: the venue's photos, which save through their own requests. */
  images?: SerializedVenueImage[];
  dossier?: DossierContext | null;
  mapApiKey?: string;
}>();

const textFields = [
  'name',
  'slug',
  'address',
  'latitude',
  'longitude',
  'pullQuote',
  'lunchSpecial',
  'websiteUrl',
  'cost',
  'cuisine',
  'mapSearchLink',
] as const;
type FormField = (typeof textFields)[number];

const FIELD_LABELS: Record<FormField, string> = {
  name: 'Name',
  slug: 'Slug',
  address: 'Address',
  latitude: 'Latitude',
  longitude: 'Longitude',
  pullQuote: 'Pull quote',
  lunchSpecial: 'Lunch special',
  websiteUrl: 'Website',
  cost: 'Cost',
  cuisine: 'Cuisine',
  mapSearchLink: 'Map link',
};

function toFormState(venue?: SerializedVenue | null): Record<FormField, string> {
  const state = {} as Record<FormField, string>;
  for (const field of textFields) {
    const value = venue?.[field];
    state[field] = value === null || value === undefined ? '' : String(value);
  }
  if (!venue) {
    state.cost = '££';
    state.cuisine = 'other';
  }
  return state;
}

function applySuggestion(state: Record<FormField, string>, suggestion?: SuggestionPrefill | null) {
  if (!suggestion) return state;
  state.name = suggestion.name;
  state.slug = slugify(suggestion.name);
  if (suggestion.cost) state.cost = suggestion.cost;
  return state;
}

const form = reactive(applySuggestion(toFormState(props.venue), props.suggestion));
const venueId = ref(props.venue?.id ?? '');
const updatedAt = ref(props.venue?.updatedAt ?? null);
const updatedBy = ref(props.updatedByName ?? null);
const savedSnapshot = ref(JSON.stringify(form));
const saved = reactive({ name: props.venue?.name ?? '', slug: props.venue?.slug ?? '' });
const timeline = ref<AuditEntry[]>(props.dossier?.timeline ?? []);
const lastInspection = ref(props.venue?.lastInspectionDate ?? null);
const images = ref<SerializedVenueImage[]>(props.images ?? []);
const primaryImage = computed(() => images.value.find((image) => image.isPrimary) ?? null);

const errors = reactive<Record<string, string>>({});
const isSubmitting = ref(false);
const justSaved = ref(false);
const slugEdited = ref(props.mode === 'edit');
const toast = ref<{ tone: 'success' | 'error'; text: string } | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let savedTimer: ReturnType<typeof setTimeout> | undefined;

const showDiscard = ref(false);
const showDocket = ref(false);
const showHistory = ref(false);
const governance = ref<InstanceType<typeof GovernanceCard> | null>(null);

function notify(tone: 'success' | 'error', text: string) {
  toast.value = { tone, text };
  clearTimeout(toastTimer);
  if (tone === 'success') toastTimer = setTimeout(() => (toast.value = null), 5000);
}

// Distance and walking time are worked out by the server from an ORS walking route; shown read-only.
const route = reactive({
  distanceMiles: props.venue?.distanceMiles ?? null,
  walkingTimeMin: props.venue?.walkingTimeMin ?? null,
  routeUpdatedAt: props.venue?.routeUpdatedAt ?? null,
});
const savedLocation = ref({
  latitude: props.venue?.latitude ?? null,
  longitude: props.venue?.longitude ?? null,
});
const savedRouteStatus = computed(() => routeStatus({ ...savedLocation.value, ...route }));
const hasLocation = computed(() => form.latitude !== '' && form.longitude !== '');
const locationChanged = computed(
  () =>
    String(savedLocation.value.latitude ?? '') !== form.latitude ||
    String(savedLocation.value.longitude ?? '') !== form.longitude
);
const manualEntry = ref(false);
const changingLocation = ref(!hasLocation.value);
const isRetrying = ref(false);
const routeMessage = ref('');

const ROUTE_BADGES: Record<RouteStatus, { text: string; tone: string }> = {
  routed: { text: 'Routed & locked', tone: 'bg-success-tint text-success' },
  estimated: { text: 'Estimated, not routed', tone: 'bg-warning-tint text-warning' },
  route_pending: { text: 'Route pending', tone: 'bg-warning-tint text-warning' },
  needs_location: { text: 'Needs location', tone: 'bg-pewter-tint text-pewter' },
};

const mapPoint = computed(() => {
  const lat = Number(form.latitude);
  const lng = Number(form.longitude);
  return hasLocation.value && Number.isFinite(lat) && Number.isFinite(lng)
    ? { lat, lng }
    : { lat: null, lng: null };
});
const mapLink = computed(() => {
  if (/^https?:\/\//.test(form.mapSearchLink)) return form.mapSearchLink;
  if (mapPoint.value.lat !== null)
    return `https://www.google.com/maps/search/?api=1&query=${mapPoint.value.lat.toFixed(6)}%2C${mapPoint.value.lng!.toFixed(6)}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${form.name || 'Spinningfields'} Manchester`)}`;
});

function pickPlace(candidate: PlaceCandidate) {
  form.address = candidate.address;
  form.latitude = candidate.lat.toFixed(6);
  form.longitude = candidate.lng.toFixed(6);
  changingLocation.value = false;
  manualEntry.value = false;
}

function clearLocation() {
  form.address = '';
  form.latitude = '';
  form.longitude = '';
  changingLocation.value = true;
}

function applySavedVenue(venue: SerializedVenue) {
  route.distanceMiles = venue.distanceMiles;
  route.walkingTimeMin = venue.walkingTimeMin;
  route.routeUpdatedAt = venue.routeUpdatedAt ?? null;
  savedLocation.value = { latitude: venue.latitude, longitude: venue.longitude };
  form.latitude = venue.latitude === null ? '' : String(venue.latitude);
  form.longitude = venue.longitude === null ? '' : String(venue.longitude);
  saved.name = venue.name;
  saved.slug = venue.slug;
}

async function retryRoute() {
  routeMessage.value = '';
  isRetrying.value = true;
  const result = await apiFetch<{ venue: SerializedVenue }>(
    `/api/admin/venues/${venueId.value}/recompute-route`,
    {
      method: 'POST',
      fallback: 'Could not work out the walking route. Try again later.',
    }
  );
  isRetrying.value = false;
  if (!result.ok) {
    routeMessage.value = result.error;
    return;
  }
  const { venue } = result.data;
  route.distanceMiles = venue.distanceMiles;
  route.walkingTimeMin = venue.walkingTimeMin;
  route.routeUpdatedAt = venue.routeUpdatedAt;
  updatedAt.value = venue.updatedAt;
  routeMessage.value = 'Walking route updated.';
}

// New venues only: the tier to propose. It takes effect once a different admin approves it.
const proposedTier = ref(props.mode === 'create' ? 'to_be_assessed' : '');
const fromSuggestion = props.suggestion?.id ?? null;
const proposableTiers = TIERS.filter((tier) => tier.value !== 'approved');

const isDirty = computed(() => JSON.stringify(form) !== savedSnapshot.value);
const coordinateWarning = computed(() => {
  const lat = form.latitude === '' ? null : Number(form.latitude);
  const lng = form.longitude === '' ? null : Number(form.longitude);
  if (lat === null || lng === null || Number.isNaN(lat) || Number.isNaN(lng)) return '';
  return isOutsideUk(lat, lng)
    ? 'These coordinates are outside the UK and will not be accepted.'
    : '';
});

// Masthead: a short registry code from the id, and the postcode district when the address has one.
const registryCode = computed(() =>
  venueId.value ? `REG-${venueId.value.slice(0, 6).toUpperCase()}` : 'New entry'
);
const district = computed(
  () => /\b([A-Z]{1,2}\d[A-Z\d]?)\s*\d[A-Z]{2}\b/i.exec(form.address)?.[1]?.toUpperCase() ?? ''
);
const currentCuisine = computed(() =>
  isCuisineValue(form.cuisine) ? cuisineLabel(form.cuisine) : 'Other'
);
// The shared visibility rule, so a closed Gone But Not Forgotten venue counts as public here too.
const hidden = computed(() =>
  hiddenReason({
    tier: props.dossier?.currentTier ?? null,
    latitude: savedLocation.value.latitude,
    longitude: savedLocation.value.longitude,
    closedAt: props.venue?.closedAt ?? null,
  })
);
const isPublic = computed(() => props.mode === 'edit' && hidden.value === null);
const visibilityText = computed(() => {
  if (props.mode === 'create')
    return 'New ledger entry. It stays hidden from the public site until a different Chair approves its verdict.';
  if (props.dossier?.closed) return props.dossier.closedText ?? 'Permanently closed.';
  if (hidden.value === 'no_tier') return 'Hidden from the public site: no approved verdict yet.';
  if (hidden.value === 'needs_location') return 'Hidden from the public site: needs a location.';
  return `Public at /venues/${saved.slug}.`;
});

const docketPreview = computed<DocketPreview>(() => ({
  name: form.name,
  tierLabel: isTierValue(props.dossier?.currentTier) ? tierLabel(props.dossier!.currentTier) : null,
  cuisineLabel: currentCuisine.value,
  cost: form.cost,
  address: form.address,
  walkingTimeMin: route.walkingTimeMin,
  distanceMiles: route.distanceMiles,
  pullQuote: form.pullQuote,
  lunchSpecial: form.lunchSpecial,
  image: primaryImage.value
    ? {
        url: primaryImage.value.fullUrl,
        alt: primaryImage.value.caption || form.name,
        focalX: primaryImage.value.focalX,
        focalY: primaryImage.value.focalY,
      }
    : null,
  lastInspection: formatDate(lastInspection.value, { fallback: 'Awaiting assessment' }),
  publicUrl: isPublic.value ? `/venues/${saved.slug}` : null,
  hiddenText: isPublic.value ? null : visibilityText.value,
}));

watch(
  () => form.name,
  (name) => {
    if (!slugEdited.value) form.slug = slugify(name);
  }
);

// A field's error clears as soon as it is edited.
for (const field of textFields) {
  watch(
    () => form[field],
    () => {
      delete errors[field];
    }
  );
}

function onSlugInput() {
  slugEdited.value = form.slug.trim() !== '';
}

function clearErrors() {
  for (const key of Object.keys(errors)) delete errors[key];
}

function changedFields(): string[] {
  const before = JSON.parse(savedSnapshot.value) as Record<FormField, string>;
  return textFields
    .filter((field) => before[field] !== form[field])
    .map((field) => FIELD_LABELS[field]);
}

async function save() {
  clearErrors();

  const body =
    props.mode === 'create'
      ? { ...form, proposedTier: proposedTier.value, fromSuggestion }
      : { ...form };
  const checked = (props.mode === 'create' ? venueCreateSchema : venueInputSchema).safeParse(body);
  if (!checked.success) {
    for (const issue of checked.error.issues) {
      const field = String(issue.path[0] ?? 'form');
      errors[field] ??= issue.message;
    }
    notify('error', 'Please correct the highlighted fields.');
    return;
  }

  isSubmitting.value = true;
  try {
    const changes = changedFields();
    const isNew = props.mode === 'create' && !venueId.value;
    const response = await apiFetch<{ venue: SerializedVenue; routeWarning?: string | null }>(
      isNew ? '/api/admin/venues' : `/api/admin/venues/${venueId.value}`,
      {
        method: isNew ? 'POST' : 'PUT',
        body,
        fallback: 'Unable to save this venue right now.',
      }
    );

    if (!response.ok) {
      Object.assign(errors, response.fields);
      notify('error', response.error);
      return;
    }

    const result = response.data;
    updatedAt.value = result.venue.updatedAt;
    applySavedVenue(result.venue);
    savedSnapshot.value = JSON.stringify(form);

    if (props.mode === 'create') {
      window.location.assign(`/admin/venues/${result.venue.id}?saved=1`);
      return;
    }
    const me = props.dossier?.currentUserName ?? 'you';
    updatedBy.value = me;
    timeline.value = [
      {
        id: `local-${result.venue.updatedAt}`,
        kind: 'amendment',
        when: formatDateTime(result.venue.updatedAt),
        text: changes.length
          ? `Amended by ${me}: ${changes.join(', ')}`
          : `Saved by ${me} with no field changes`,
      },
      ...timeline.value,
    ];
    justSaved.value = true;
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => (justSaved.value = false), 2000);
    notify('success', result.routeWarning ?? 'Decree saved. All changes ratified and archived.');
  } catch (error) {
    console.error('Venue save failed', error);
    notify('error', 'Unable to save this venue right now.');
  } finally {
    isSubmitting.value = false;
  }
}

function discard() {
  showDiscard.value = false;
  Object.assign(form, JSON.parse(savedSnapshot.value));
  clearErrors();
  manualEntry.value = false;
  changingLocation.value = !hasLocation.value;
  slugEdited.value = props.mode === 'edit';
  notify('success', 'Edits discarded. Back to the last saved version.');
}

function onConcordConfirmed(status: VisitStatus) {
  if (!status.confirmed) return;
  lastInspection.value = status.today;
  timeline.value = [
    {
      id: `local-inspection-${status.today}`,
      kind: 'inspection',
      when: formatDateTime(status.confirmed.confirmedAt ?? new Date()),
      text: `Inspection of ${formatDate(status.today)}: Verified by ${status.confirmed.firstAdminName} and ${status.confirmed.secondAdminName}${
        status.confirmed.outcome
          ? `, ${INSPECTION_OUTCOME_LABELS[status.confirmed.outcome].toLowerCase()}`
          : ''
      }`,
    },
    ...timeline.value,
  ];
}

function onExpunged() {
  savedSnapshot.value = JSON.stringify(form);
  window.location.assign('/admin/venues?deleted=1');
}

function onBeforeUnload(event: BeforeUnloadEvent) {
  if (!isDirty.value) return;
  event.preventDefault();
  event.returnValue = '';
}

onMounted(() => {
  window.addEventListener('beforeunload', onBeforeUnload);
  if (new URLSearchParams(window.location.search).get('saved') === '1')
    notify('success', 'Venue created and filed in the ledger.');
});
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', onBeforeUnload);
  clearTimeout(toastTimer);
  clearTimeout(savedTimer);
});

// Literal class names so Tailwind generates them. On phones the two columns interleave in this order.
const MOBILE_ORDER = [
  'order-0 lg:order-none',
  'order-1 lg:order-none',
  'order-2 lg:order-none',
  'order-3 lg:order-none',
  'order-4 lg:order-none',
  'order-5 lg:order-none',
  'order-6 lg:order-none',
  'order-7 lg:order-none',
];
const mobileOrder = (n: number) => MOBILE_ORDER[n];
</script>

<template>
  <div class="dossier pb-32">
    <!-- Masthead -->
    <header class="mb-8 border-b border-[var(--dossier-border)] pb-6">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <nav
          class="dossier-overline flex min-w-0 flex-wrap items-center gap-1.5"
          aria-label="Breadcrumb"
        >
          <a href="/admin/venues" class="hover:text-[var(--dossier-primary)]">Venues ledger</a>
          <span class="text-[var(--dossier-border)]" aria-hidden="true">/</span>
          <span class="truncate text-[var(--dossier-secondary)]">{{
            saved.name || (suggestion ? `Accept “${suggestion.name}”` : 'New venue')
          }}</span>
          <span class="text-[var(--dossier-border)]" aria-hidden="true">/</span>
          <span class="dossier-figures font-semibold"
            >{{ registryCode }}{{ district ? ` · ${district}` : '' }}</span
          >
        </nav>
        <p
          v-if="updatedAt"
          class="flex items-center gap-1.5 text-[13px] text-[var(--dossier-muted)]"
        >
          <DossierIcon name="feather" :size="14" class="text-[var(--dossier-secondary)]" />
          <span
            >Last amended
            <strong class="text-[var(--dossier-ink)]">{{ formatDateTime(updatedAt) }}</strong
            ><template v-if="updatedBy"> by {{ updatedBy }}</template></span
          >
        </p>
      </div>

      <div class="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div class="min-w-0 space-y-2">
          <div class="flex flex-wrap items-center gap-3">
            <h1
              class="text-[32px] font-bold leading-[38px] tracking-[-0.01em] text-[var(--dossier-primary)] sm:text-[44px] sm:leading-[52px]"
            >
              {{ saved.name || (suggestion ? `Accept “${suggestion.name}”` : 'New venue') }}
            </h1>
            <TierBadge v-if="mode === 'edit'" :tier="dossier?.currentTier" />
            <span
              class="rounded border border-[var(--dossier-border)] bg-[var(--dossier-card)] px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--dossier-muted)]"
            >
              {{ currentCuisine }}
            </span>
            <span
              v-if="dossier?.closed"
              class="rounded border border-pewter/50 bg-pewter-tint px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-pewter"
              >Permanently closed</span
            >
          </div>
          <p class="max-w-3xl text-[15px] leading-[23px] text-[var(--dossier-muted)]">
            {{ visibilityText }}
          </p>
        </div>

        <div v-if="mode === 'edit'" class="flex shrink-0 flex-wrap gap-2">
          <button type="button" class="dossier-btn" @click="showDocket = true">
            <DossierIcon name="external" :size="16" /> View public docket
          </button>
          <button
            type="button"
            class="dossier-btn text-[var(--dossier-ink)]"
            @click="showHistory = true"
          >
            <DossierIcon name="receipt" :size="16" /> Audit history
            <span
              class="dossier-figures rounded-full bg-[var(--dossier-card)] px-1.5 py-0.5 text-[11px]"
              >{{ timeline.length }}</span
            >
          </button>
          <button type="button" class="dossier-btn is-danger" @click="governance?.openClose()">
            <DossierIcon name="door" :size="16" />
            {{ dossier?.closed ? 'Reopen venue' : 'Mark permanently closed' }}
          </button>
        </div>
      </div>
    </header>

    <form
      novalidate
      class="flex flex-col gap-6 lg:grid lg:grid-cols-12 lg:items-start lg:gap-9"
      @submit.prevent="save()"
    >
      <!-- Left column: the primary dossier. On phones the columns interleave (see mobileOrder). -->
      <div class="contents lg:col-span-8 lg:flex lg:min-w-0 lg:flex-col lg:gap-9">
        <aside
          v-if="suggestion"
          :class="['dossier-inset space-y-2 border-dashed text-sm', mobileOrder(0)]"
          aria-label="The member's suggestion"
        >
          <p class="dossier-overline text-[var(--dossier-secondary)]">
            Suggested by {{ suggestion.submitterName || 'a member' }} · for reference, not copied
            onto the site
          </p>
          <p><span class="font-semibold">Address given:</span> {{ suggestion.searchQuery }}</p>
          <p v-if="suggestion.recommendedOrder">
            <span class="font-semibold">Recommended order:</span> {{ suggestion.recommendedOrder }}
          </p>
          <p class="whitespace-pre-line">
            <span class="font-semibold">Why:</span> {{ suggestion.rationale }}
          </p>
        </aside>

        <DossierCard
          id="basics"
          title="Venue Basics"
          tag="Section I · Registry metadata"
          icon="building"
          :class="mobileOrder(3)"
        >
          <div>
            <label class="dossier-label" for="venue-name"
              >Venue legal/public title <span class="text-danger-ink">*</span></label
            >
            <input
              id="venue-name"
              v-model="form.name"
              type="text"
              required
              class="dossier-input"
              :aria-invalid="Boolean(errors.name)"
            />
            <span v-if="errors.name" class="dossier-error">{{ errors.name }}</span>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="dossier-label" for="venue-cuisine">Cuisine tradition</label>
              <select
                id="venue-cuisine"
                v-model="form.cuisine"
                class="dossier-input text-sm"
                :aria-invalid="Boolean(errors.cuisine)"
              >
                <option v-for="cuisine in CUISINES" :key="cuisine.value" :value="cuisine.value">
                  {{ cuisine.label }}
                </option>
              </select>
              <span v-if="errors.cuisine" class="dossier-error">{{ errors.cuisine }}</span>
              <span v-if="suggestion?.cuisineHint" class="dossier-hint"
                >Suggested by the member: “{{ suggestion.cuisineHint }}” (for reference only)</span
              >
            </div>
            <div>
              <label class="dossier-label" for="venue-cost">Cost grade assessment</label>
              <select id="venue-cost" v-model="form.cost" class="dossier-input text-sm">
                <option v-for="band in COST_BANDS" :key="band" :value="band">
                  {{ COST_BAND_LABELS[band] }}
                </option>
              </select>
              <span v-if="errors.cost" class="dossier-error">{{ errors.cost }}</span>
            </div>
          </div>
          <div>
            <label class="dossier-label" for="venue-slug">Canonical URL slug</label>
            <div
              class="flex overflow-hidden rounded-lg border border-[var(--dossier-border)] focus-within:border-[var(--dossier-primary-container)]"
            >
              <span
                class="dossier-figures flex items-center border-r border-[var(--dossier-border)] bg-[var(--dossier-paper)] px-3 text-[13px] text-[var(--dossier-muted)]"
                >/venues/</span
              >
              <input
                id="venue-slug"
                v-model="form.slug"
                type="text"
                class="dossier-input dossier-figures rounded-none border-0 focus:shadow-none"
                :aria-invalid="Boolean(errors.slug)"
                @input="onSlugInput"
              />
            </div>
            <span class="dossier-hint"
              >The public address. Changing it breaks existing links, printed slips and
              bookmarks.</span
            >
            <span v-if="errors.slug" class="dossier-error">{{ errors.slug }}</span>
          </div>
        </DossierCard>

        <DossierCard
          id="editorial"
          title="Editorial & Public Proclamations"
          tag="Committee endorsements"
          icon="newspaper"
          :class="mobileOrder(5)"
        >
          <div class="dossier-inset bg-[var(--dossier-field)]">
            <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
              <label
                class="dossier-label mb-0 flex items-center gap-1.5 text-[var(--dossier-primary)]"
                for="venue-lunch"
              >
                <DossierIcon name="utensils" :size="14" class="text-[var(--dossier-secondary)]" />
                Lunch special — “Eat like us” prescription
              </label>
              <span
                class="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--dossier-secondary)]"
                >Priority gazette directive</span
              >
            </div>
            <textarea
              id="venue-lunch"
              v-model="form.lunchSpecial"
              rows="3"
              maxlength="1000"
              class="dossier-input"
              :aria-invalid="Boolean(errors.lunchSpecial)"
            ></textarea>
            <div class="mt-1.5 flex items-start justify-between gap-3">
              <span class="dossier-hint mt-0"
                >The prescribed order or set deal, shown prominently on the public docket.</span
              >
              <span
                class="dossier-figures shrink-0 text-[11px] font-bold text-[var(--dossier-muted)]"
                >{{ form.lunchSpecial.length }} chars</span
              >
            </div>
            <span v-if="errors.lunchSpecial" class="dossier-error">{{ errors.lunchSpecial }}</span>
          </div>
          <div>
            <label class="dossier-label" for="venue-quote">Editorial pull quote</label>
            <div class="relative">
              <span
                class="dossier-serif pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-2xl font-bold text-[var(--dossier-secondary)]"
                aria-hidden="true"
                >“</span
              >
              <input
                id="venue-quote"
                v-model="form.pullQuote"
                type="text"
                maxlength="400"
                class="dossier-input dossier-serif pl-9 text-[17px] font-semibold italic text-[var(--dossier-primary)]"
                placeholder="Leave blank for no pull quote"
                :aria-invalid="Boolean(errors.pullQuote)"
              />
            </div>
            <span class="dossier-hint"
              >Shown in broadsheet serif near the top of the venue page.</span
            >
            <span v-if="errors.pullQuote" class="dossier-error">{{ errors.pullQuote }}</span>
          </div>
        </DossierCard>

        <DossierCard
          id="media"
          title="Media & Archival Records"
          tag="Plate & telemetry"
          icon="image"
          :class="mobileOrder(6)"
        >
          <div>
            <label class="dossier-label" for="venue-website"
              >Website / official registry link</label
            >
            <div class="flex gap-2">
              <input
                id="venue-website"
                v-model="form.websiteUrl"
                type="url"
                class="dossier-input dossier-figures text-[13px]"
                placeholder="https://…"
                :aria-invalid="Boolean(errors.websiteUrl)"
              />
              <a
                :href="/^https?:\/\//.test(form.websiteUrl) ? form.websiteUrl : undefined"
                target="_blank"
                rel="noopener noreferrer"
                :aria-disabled="!/^https?:\/\//.test(form.websiteUrl)"
                :class="[
                  'dossier-btn px-3',
                  !/^https?:\/\//.test(form.websiteUrl) && 'pointer-events-none opacity-50',
                ]"
                aria-label="Open the website in a new tab"
              >
                <DossierIcon name="external" :size="16" />
              </a>
            </div>
            <span class="dossier-hint">Menu, map portal or licensing page.</span>
            <span v-if="errors.websiteUrl" class="dossier-error">{{ errors.websiteUrl }}</span>
          </div>
          <VenueImages
            v-if="mode === 'edit' && venueId"
            v-model:images="images"
            :venue-id="venueId"
            :venue-name="saved.name"
            :uploads-enabled="Boolean(uploadsEnabled)"
          />
          <p v-else class="flex items-center gap-1.5 text-[13px] text-[var(--dossier-muted)]">
            <DossierIcon name="image" :size="15" /> Photos can be added once the venue has been
            created.
          </p>
        </DossierCard>

        <GovernanceCard
          v-if="mode === 'edit' && dossier"
          ref="governance"
          :venue-id="venueId"
          :venue-name="saved.name"
          :closed="dossier.closed"
          :is-gone-but-not-forgotten="dossier.currentTier === 'gone_but_not_forgotten'"
          :class="mobileOrder(7)"
          @expunged="onExpunged"
        />
      </div>

      <!-- Right column: Chair actions and telemetry. -->
      <div class="contents lg:col-span-4 lg:flex lg:min-w-0 lg:flex-col lg:gap-9">
        <ConcordCard
          v-if="mode === 'edit' && dossier"
          :venue-id="venueId"
          :initial-status="dossier.visitStatus"
          :latest-verified-inspection="dossier.latestVerifiedInspection"
          :class="mobileOrder(1)"
          @confirmed="onConcordConfirmed"
        />

        <TierProposalPanel
          v-if="mode === 'edit' && dossier"
          :venue-id="venueId"
          :current-tier="dossier.currentTier"
          :pending="dossier.pendingMotion"
          :current-user-id="dossier.currentUserId"
          :active-admins="dossier.activeAdmins"
          :class="mobileOrder(2)"
        />
        <DossierCard
          v-else
          id="tier-decree"
          title="Verdict Decree"
          tag="Judicial bench"
          icon="scale"
          :class="mobileOrder(2)"
        >
          <div v-if="fromSuggestion">
            <span class="dossier-label">Proposed verdict</span>
            <p class="dossier-input text-sm">To Be Assessed</p>
            <span class="dossier-hint"
              >Accepted suggestions are always proposed as To Be Assessed. The venue stays hidden
              until a different Chair approves.</span
            >
          </div>
          <div v-else>
            <label class="dossier-label" for="venue-proposed-tier">Propose verdict motion</label>
            <select
              id="venue-proposed-tier"
              v-model="proposedTier"
              class="dossier-input text-sm"
              :aria-invalid="Boolean(errors.proposedTier)"
            >
              <option value="">Don't propose a verdict yet</option>
              <option v-for="tier in proposableTiers" :key="tier.value" :value="tier.value">
                {{ tier.label }}
              </option>
            </select>
            <span class="dossier-hint"
              >The venue stays hidden until a different Chair approves this. Approved needs a
              verified inspection first.</span
            >
            <span v-if="errors.proposedTier" class="dossier-error">{{ errors.proposedTier }}</span>
          </div>
        </DossierCard>

        <DossierCard
          id="location"
          title="Location & Isochrone"
          tag="Crown Sq pivot"
          icon="footprints"
          :class="mobileOrder(4)"
        >
          <div
            v-if="hasLocation && !changingLocation"
            class="dossier-inset flex items-start justify-between gap-3 bg-[var(--dossier-field)]"
          >
            <div class="min-w-0 text-sm">
              <p class="flex items-start gap-1.5 font-semibold">
                <DossierIcon name="pin" :size="16" class="mt-0.5 text-[var(--dossier-secondary)]" />
                <span class="break-words">{{ form.address || 'No address recorded' }}</span>
              </p>
              <p class="dossier-figures mt-1 text-[12px] text-[var(--dossier-muted)]">
                {{ Number(form.latitude).toFixed(6) }} N, {{ Number(form.longitude).toFixed(6) }}
              </p>
            </div>
            <div class="flex shrink-0 flex-col items-end gap-1.5">
              <button type="button" class="dossier-link" @click="changingLocation = true">
                Change
              </button>
              <button type="button" class="dossier-link is-danger" @click="clearLocation">
                Remove
              </button>
            </div>
          </div>

          <PlaceSearch
            v-if="changingLocation && !manualEntry"
            :initial-query="suggestion?.searchQuery || form.address || form.name"
            @pick="pickPlace"
          />

          <label class="flex items-center gap-2 text-[13px] font-semibold">
            <input
              v-model="manualEntry"
              type="checkbox"
              class="h-4 w-4 rounded border-[var(--dossier-border)] accent-[var(--dossier-primary-container)]"
              @change="manualEntry && (changingLocation = true)"
            />
            Enter manually (when geocoding stalls)
          </label>

          <template v-if="manualEntry">
            <div>
              <label class="dossier-label" for="venue-address">Address</label>
              <input
                id="venue-address"
                v-model="form.address"
                type="text"
                autocomplete="off"
                class="dossier-input"
              />
              <span v-if="errors.address" class="dossier-error">{{ errors.address }}</span>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="dossier-label" for="venue-lat">Latitude</label>
                <input
                  id="venue-lat"
                  v-model="form.latitude"
                  type="number"
                  step="0.000001"
                  inputmode="decimal"
                  class="dossier-input dossier-figures text-[13px]"
                  :aria-invalid="Boolean(errors.latitude)"
                  placeholder="53.479850"
                />
              </div>
              <div>
                <label class="dossier-label" for="venue-lng">Longitude</label>
                <input
                  id="venue-lng"
                  v-model="form.longitude"
                  type="number"
                  step="0.000001"
                  inputmode="decimal"
                  class="dossier-input dossier-figures text-[13px]"
                  :aria-invalid="Boolean(errors.longitude)"
                  placeholder="-2.251050"
                />
              </div>
            </div>
          </template>
          <span v-if="errors.address && !manualEntry" class="dossier-error mt-0">{{
            errors.address
          }}</span>
          <span v-if="errors.latitude || errors.longitude" class="dossier-error mt-0">{{
            errors.latitude || errors.longitude
          }}</span>
          <p
            v-if="!hasLocation"
            class="rounded-lg border border-warning/40 bg-warning-tint px-3 py-2 text-[13px] text-warning-ink"
          >
            Without a location the venue is saved but stays hidden from the public site (“Needs
            location”).
          </p>
          <p
            v-if="coordinateWarning"
            class="rounded-lg border border-warning/40 bg-warning-tint px-3 py-2 text-[13px] text-warning-ink"
          >
            {{ coordinateWarning }}
          </p>

          <div class="dossier-inset space-y-3 bg-[var(--dossier-field)]">
            <div class="flex items-center justify-between gap-2">
              <span class="dossier-overline flex items-center gap-1.5"
                ><DossierIcon name="footprints" :size="14" /> Walk from Spinningfields</span
              >
              <span
                v-if="!(locationChanged && hasLocation)"
                :class="[
                  'rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]',
                  ROUTE_BADGES[savedRouteStatus].tone,
                ]"
              >
                {{ ROUTE_BADGES[savedRouteStatus].text }}
              </span>
            </div>
            <p
              v-if="locationChanged && hasLocation"
              class="text-[13px] text-[var(--dossier-muted)]"
            >
              Worked out from a walking route when you save.
            </p>
            <div v-else class="flex items-end justify-between gap-3">
              <p>
                <span
                  class="dossier-serif text-[32px] font-bold leading-none text-[var(--dossier-primary)]"
                  >{{ route.walkingTimeMin ?? '—' }}</span
                >
                <span class="dossier-serif ml-1 text-lg font-bold text-[var(--dossier-primary)]"
                  >min</span
                >
                <span
                  v-if="route.distanceMiles !== null"
                  class="ml-2 text-[13px] text-[var(--dossier-muted)]"
                  >· {{ route.distanceMiles.toFixed(2) }} mi pedestrian route</span
                >
              </p>
              <button
                v-if="savedRouteStatus !== 'needs_location' && mode === 'edit'"
                type="button"
                class="dossier-btn is-small"
                :disabled="isRetrying"
                @click="retryRoute"
              >
                <DossierIcon name="refresh" :size="14" :class="isRetrying && 'dossier-spin'" />
                {{
                  isRetrying
                    ? 'Re-routing…'
                    : savedRouteStatus === 'route_pending'
                      ? 'Retry'
                      : 'Re-route'
                }}
              </button>
            </div>
            <p class="text-[12px] leading-[17px] text-[var(--dossier-muted)]">
              <template v-if="savedRouteStatus === 'routed'"
                >From an OpenRouteService walking route. Not editable.</template
              >
              <template v-else-if="savedRouteStatus === 'estimated'"
                >An old straight-line estimate from before walking routes. Re-route replaces
                it.</template
              >
              <template v-else-if="savedRouteStatus === 'route_pending'"
                >The walking route could not be fetched yet. The venue still shows, listed
                last.</template
              >
              <template v-else>Add a location to work out the walk.</template>
            </p>
            <p
              v-if="routeMessage"
              role="status"
              class="text-[12px] font-semibold text-[var(--dossier-primary-container)]"
            >
              {{ routeMessage }}
            </p>
            <DossierMap
              :lat="mapPoint.lat"
              :lng="mapPoint.lng"
              :map-link="mapLink"
              :api-key="mapApiKey"
            />
          </div>

          <details
            class="rounded-lg border border-[var(--dossier-border)] bg-[var(--dossier-field)] [&_summary::-webkit-details-marker]:hidden"
            :open="Boolean(errors.mapSearchLink)"
          >
            <summary
              class="dossier-overline flex cursor-pointer items-center justify-between gap-2 px-4 py-3 text-[var(--dossier-ink)]"
            >
              Advanced coordinate link <DossierIcon name="chevronDown" :size="16" />
            </summary>
            <div class="border-t border-[var(--dossier-border)] p-4">
              <label class="dossier-label" for="venue-map-link">Custom Google Maps link</label>
              <input
                id="venue-map-link"
                v-model="form.mapSearchLink"
                type="url"
                class="dossier-input dossier-figures text-[12px]"
                placeholder="https://www.google.com/maps/…"
                :aria-invalid="Boolean(errors.mapSearchLink)"
              />
              <span class="dossier-hint">Leave blank to link to the coordinates.</span>
              <span v-if="errors.mapSearchLink" class="dossier-error">{{
                errors.mapSearchLink
              }}</span>
            </div>
          </details>
        </DossierCard>
      </div>

      <!-- The decree bar: dirty state and the save/discard actions for the fields above. -->
      <div class="dossier-bar">
        <div
          class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8"
        >
          <p class="flex min-w-0 items-center gap-2 text-[13px]" role="status">
            <span
              :class="[
                'h-2.5 w-2.5 shrink-0 rounded-full',
                isDirty ? 'dossier-pulse bg-[var(--dossier-amber)]' : 'bg-[var(--dossier-green)]',
              ]"
              aria-hidden="true"
            />
            <strong class="hidden sm:inline">Docket status:</strong>
            <span
              :class="[
                'truncate',
                isDirty ? 'font-medium text-[var(--dossier-secondary)]' : 'text-success-ink',
              ]"
            >
              {{
                isDirty
                  ? 'Unsaved committee edits present'
                  : mode === 'create'
                    ? 'New entry, not yet filed'
                    : 'All changes ratified & archived'
              }}
            </span>
          </p>
          <div class="flex flex-wrap items-center gap-2">
            <a
              href="/admin/venues"
              class="dossier-btn hidden text-[var(--dossier-ink)] sm:inline-flex"
              ><DossierIcon name="arrowLeft" :size="16" /> Return to registry</a
            >
            <button
              type="button"
              class="dossier-btn is-quiet text-[var(--dossier-ink)]"
              :disabled="!isDirty || isSubmitting"
              @click="showDiscard = true"
            >
              Discard edits
            </button>
            <button
              type="submit"
              class="dossier-btn is-primary px-5 py-2.5"
              :disabled="isSubmitting"
            >
              <DossierIcon
                :name="isSubmitting ? 'refresh' : justSaved ? 'check' : 'save'"
                :size="16"
                :class="isSubmitting && 'dossier-spin'"
              />
              {{
                isSubmitting
                  ? 'Preserving…'
                  : justSaved
                    ? 'Decree saved'
                    : mode === 'create'
                      ? 'File venue'
                      : 'Save changes'
              }}
            </button>
          </div>
        </div>
      </div>
    </form>

    <div
      v-if="toast"
      :role="toast.tone === 'error' ? 'alert' : 'status'"
      :class="[
        'fixed bottom-24 right-4 z-50 flex max-w-sm items-start gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg',
        toast.tone === 'error'
          ? 'border-[var(--dossier-danger)]/40 bg-[var(--dossier-danger-bg)] text-danger-ink'
          : 'border-[var(--dossier-green)]/40 bg-success-tint text-success-ink',
      ]"
    >
      <DossierIcon
        :name="toast.tone === 'error' ? 'alert' : 'checkCircle'"
        :size="16"
        class="mt-0.5"
      />
      <span class="flex-1">{{ toast.text }}</span>
      <button
        type="button"
        class="opacity-70 hover:opacity-100"
        aria-label="Dismiss"
        @click="toast = null"
      >
        <DossierIcon name="x" :size="14" />
      </button>
    </div>

    <ConfirmDialog
      :open="showDiscard"
      title="Discard edits"
      :message="`Discard the unsaved committee edits to “${saved.name || form.name || 'this venue'}”? The form goes back to the last saved version.`"
      confirm-label="Discard edits"
      cancel-label="Keep editing"
      @cancel="showDiscard = false"
      @confirm="discard"
    />
    <template v-if="mode === 'edit'">
      <PublicDocketModal
        :open="showDocket"
        :preview="docketPreview"
        :unsaved="isDirty"
        @close="showDocket = false"
      />
      <AuditHistoryDrawer
        :open="showHistory"
        :entries="timeline"
        :history-url="`/admin/venues/${venueId}/history`"
        @close="showHistory = false"
      />
    </template>
  </div>
</template>
