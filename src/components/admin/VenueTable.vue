<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import TierBadge from './TierBadge.vue';
import { formatDate } from '@/lib/dates';
import { ROUTE_STATUS_LABELS, type RouteStatus } from '@/lib/route-status';
import { TIERS, isTierValue, tierLabel } from '@/lib/tiers';

interface VenueRow {
  id: string;
  name: string;
  slug: string;
  tier: string | null;
  /** From hiddenReason() in src/lib/visibility.ts; null when the venue is public. */
  hiddenReason: 'no_tier' | 'needs_location' | 'closed' | null;
  closed: boolean;
  lastInspectionDate: string | null;
  /** See src/lib/route-status.ts; needs_location already shows as the hidden reason. */
  routeStatus: RouteStatus;
  updatedAt: string;
}

type SortKey = 'name' | 'tier' | 'status' | 'updatedAt';

const HIDDEN_LABELS: Record<NonNullable<VenueRow['hiddenReason']>, string> = {
  no_tier: 'Hidden: no approved verdict',
  needs_location: 'Hidden: needs location',
  closed: 'Hidden: closed',
};

const props = defineProps<{ venues: VenueRow[] }>();

const rows = ref<VenueRow[]>(props.venues.map((venue) => ({ ...venue })));
const query = ref('');
const tierFilter = ref('');
const sortKey = ref<SortKey>('name');
const sortAscending = ref(true);
const message = ref('');

const tierOrder = new Map<string, number>(TIERS.map((tier, index) => [tier.value, index]));

const visibleRows = computed(() => {
  const needle = query.value.trim().toLowerCase();
  const filtered = rows.value.filter((venue) => {
    if (needle && !`${venue.name} ${venue.slug}`.toLowerCase().includes(needle)) return false;
    if (tierFilter.value && venue.tier !== tierFilter.value) return false;
    return true;
  });

  const direction = sortAscending.value ? 1 : -1;
  return filtered.sort((a, b) => {
    let result = 0;
    if (sortKey.value === 'name') result = a.name.localeCompare(b.name, 'en-GB');
    if (sortKey.value === 'tier')
      result = (tierOrder.get(a.tier ?? '') ?? 99) - (tierOrder.get(b.tier ?? '') ?? 99);
    if (sortKey.value === 'status')
      result = (a.hiddenReason ?? '').localeCompare(b.hiddenReason ?? '');
    if (sortKey.value === 'updatedAt') result = a.updatedAt.localeCompare(b.updatedAt);
    return (result || a.name.localeCompare(b.name, 'en-GB')) * direction;
  });
});

function sortBy(key: SortKey) {
  if (sortKey.value === key) {
    sortAscending.value = !sortAscending.value;
  } else {
    sortKey.value = key;
    sortAscending.value = key !== 'updatedAt';
  }
}

function ariaSort(key: SortKey) {
  if (sortKey.value !== key) return 'none';
  return sortAscending.value ? 'ascending' : 'descending';
}

function sortIndicator(key: SortKey) {
  if (sortKey.value !== key) return '↕';
  return sortAscending.value ? '↑' : '↓';
}

// The whole row opens the venue. This is a click handler, not a stretched ::after link:
// browsers that ignore position: relative on <tr> (older WebKit) let every row's overlay
// cover the page, so a tap anywhere (the search box included) opened the last row.
function openRow(event: MouseEvent, venue: VenueRow) {
  if ((event.target as Element).closest('a, button, input, select, textarea, label')) return;
  if (window.getSelection()?.toString()) return;
  const href = `/admin/venues/${venue.id}`;
  if (event.metaKey || event.ctrlKey) window.open(href, '_blank', 'noopener');
  else window.location.assign(href);
}

// Keep filters in the URL so a filtered list can be bookmarked or shared.
onMounted(() => {
  const params = new URLSearchParams(window.location.search);
  query.value = params.get('query') ?? '';
  tierFilter.value = isTierValue(params.get('tier')) ? params.get('tier')! : '';
  if (params.get('deleted') === '1') message.value = 'Venue deleted.';
});

watch([query, tierFilter], () => {
  const params = new URLSearchParams();
  if (query.value.trim()) params.set('query', query.value.trim());
  if (tierFilter.value) params.set('tier', tierFilter.value);
  const search = params.toString();
  window.history.replaceState(null, '', search ? `?${search}` : window.location.pathname);
});

const inputClass =
  'w-full rounded-lg border border-hairline bg-surface px-3 py-2.5 text-base text-ink outline-none focus:border-navy';
</script>

<template>
  <div class="space-y-4">
    <div
      class="grid gap-3 rounded-2xl border border-hairline bg-parchment p-5 shadow-sm md:grid-cols-[1fr_220px]"
    >
      <label class="block text-sm font-semibold text-ink">
        <span class="mb-2 block">Search</span>
        <input
          v-model="query"
          type="search"
          placeholder="Search by name or slug"
          :class="inputClass"
        />
      </label>
      <label class="block text-sm font-semibold text-ink">
        <span class="mb-2 block">Verdict</span>
        <select v-model="tierFilter" :class="inputClass">
          <option value="">All verdicts</option>
          <option v-for="tier in TIERS" :key="tier.value" :value="tier.value">
            {{ tier.label }}
          </option>
        </select>
      </label>
    </div>

    <p
      v-if="message"
      role="status"
      class="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
    >
      {{ message }}
    </p>

    <div class="overflow-hidden rounded-2xl border border-hairline bg-parchment shadow-sm">
      <p class="border-b border-sand px-4 py-2 text-xs text-graphite">
        Showing {{ visibleRows.length }} of {{ rows.length }} venues
        <template v-if="tierFilter && isTierValue(tierFilter)">
          in {{ tierLabel(tierFilter) }}</template
        >
      </p>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-hairline text-left text-sm text-coal">
          <thead class="bg-card text-ink">
            <tr>
              <th
                v-for="column in [
                  ['name', 'Venue'],
                  ['tier', 'Verdict'],
                  ['status', 'Status'],
                  ['updatedAt', 'Updated'],
                ] as const"
                :key="column[0]"
                scope="col"
                class="px-4 py-3 font-semibold"
                :aria-sort="ariaSort(column[0])"
              >
                <button
                  type="button"
                  class="inline-flex items-center gap-1 rounded hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-navy"
                  @click="sortBy(column[0])"
                >
                  {{ column[1] }}
                  <span aria-hidden="true" class="text-xs text-ochre">{{
                    sortIndicator(column[0])
                  }}</span>
                </button>
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-sand">
            <tr v-if="!visibleRows.length">
              <td colspan="4" class="px-4 py-10 text-center text-soot">
                No venues match the current filters.
              </td>
            </tr>
            <tr
              v-for="venue in visibleRows"
              :key="venue.id"
              class="cursor-pointer transition-colors hover:bg-card focus-within:bg-card"
              @click="openRow($event, venue)"
            >
              <td class="px-4 py-3">
                <a
                  :href="`/admin/venues/${venue.id}`"
                  class="rounded font-semibold text-ink hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-navy"
                  >{{ venue.name }}</a
                >
                <div class="text-xs text-graphite">{{ venue.slug }}</div>
                <div class="text-xs text-graphite">
                  Last inspected: {{ formatDate(venue.lastInspectionDate, { fallback: 'never' }) }}
                </div>
              </td>
              <td class="px-4 py-3"><TierBadge :tier="venue.tier" /></td>
              <td class="px-4 py-3">
                <span
                  :class="[
                    'inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]',
                    venue.hiddenReason
                      ? 'bg-stone-200 text-stone-700'
                      : 'bg-emerald-100 text-emerald-800',
                  ]"
                >
                  {{ venue.hiddenReason ? HIDDEN_LABELS[venue.hiddenReason] : 'Public' }}
                </span>
                <span
                  v-if="venue.closed"
                  class="ml-1 inline-flex whitespace-nowrap rounded-full bg-danger-tint px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-danger"
                >
                  Closed
                </span>
                <span
                  v-if="venue.routeStatus === 'route_pending' || venue.routeStatus === 'estimated'"
                  class="ml-1 inline-flex whitespace-nowrap rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-pending-ink"
                >
                  {{ ROUTE_STATUS_LABELS[venue.routeStatus] }}
                </span>
              </td>
              <td class="whitespace-nowrap px-4 py-3 text-soot">
                {{ formatDate(venue.updatedAt) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
