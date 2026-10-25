<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import ConfirmDialog from './ConfirmDialog.vue';
import TierBadge from './TierBadge.vue';
import { formatDate } from '@/lib/dates';
import { ROUTE_STATUS_LABELS, type RouteStatus } from '@/lib/route-status';
import { TIERS, isTierValue, tierLabel } from '@/lib/tiers';
import { apiFetch } from '@/lib/api-fetch';

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
  no_tier: 'Hidden: no approved tier',
  needs_location: 'Hidden: needs location',
  closed: 'Hidden: closed',
};

const props = defineProps<{ venues: VenueRow[] }>();

const rows = ref<VenueRow[]>(props.venues.map((venue) => ({ ...venue })));
const query = ref('');
const tierFilter = ref('');
const statusFilter = ref<'' | 'public' | 'hidden'>('');
const sortKey = ref<SortKey>('name');
const sortAscending = ref(true);
const busy = ref<Record<string, boolean>>({});
const pendingDelete = ref<VenueRow | null>(null);
const message = ref('');
const errorMessage = ref('');

const tierOrder = new Map<string, number>(TIERS.map((tier, index) => [tier.value, index]));

const visibleRows = computed(() => {
  const needle = query.value.trim().toLowerCase();
  const filtered = rows.value.filter((venue) => {
    if (needle && !`${venue.name} ${venue.slug}`.toLowerCase().includes(needle)) return false;
    if (tierFilter.value && venue.tier !== tierFilter.value) return false;
    if (statusFilter.value === 'public' && venue.hiddenReason) return false;
    if (statusFilter.value === 'hidden' && !venue.hiddenReason) return false;
    return true;
  });

  const direction = sortAscending.value ? 1 : -1;
  return filtered.sort((a, b) => {
    let result = 0;
    if (sortKey.value === 'name') result = a.name.localeCompare(b.name, 'en-GB');
    if (sortKey.value === 'tier') result = (tierOrder.get(a.tier ?? '') ?? 99) - (tierOrder.get(b.tier ?? '') ?? 99);
    if (sortKey.value === 'status') result = (a.hiddenReason ?? '').localeCompare(b.hiddenReason ?? '');
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

async function performDelete() {
  const venue = pendingDelete.value;
  pendingDelete.value = null;
  if (!venue) return;

  message.value = '';
  errorMessage.value = '';
  busy.value[venue.id] = true;
  const result = await apiFetch(`/api/admin/venues/${venue.id}`, { method: 'DELETE', fallback: 'Could not delete the venue.' });
  busy.value[venue.id] = false;
  if (!result.ok) {
    errorMessage.value = result.error;
    return;
  }
  rows.value = rows.value.filter((row) => row.id !== venue.id);
  message.value = `${venue.name} was deleted.`;
}

// Keep filters in the URL so a filtered list can be bookmarked or shared.
onMounted(() => {
  const params = new URLSearchParams(window.location.search);
  query.value = params.get('query') ?? '';
  tierFilter.value = isTierValue(params.get('tier')) ? params.get('tier')! : '';
  const status = params.get('status');
  statusFilter.value = status === 'public' || status === 'hidden' ? status : '';
  if (params.get('deleted') === '1') message.value = 'Venue deleted.';
});

watch([query, tierFilter, statusFilter], () => {
  const params = new URLSearchParams();
  if (query.value.trim()) params.set('query', query.value.trim());
  if (tierFilter.value) params.set('tier', tierFilter.value);
  if (statusFilter.value) params.set('status', statusFilter.value);
  const search = params.toString();
  window.history.replaceState(null, '', search ? `?${search}` : window.location.pathname);
});

const inputClass = 'w-full rounded-lg border border-hairline bg-white px-3 py-2.5 text-base text-ink outline-none focus:border-navy';
</script>

<template>
  <div class="space-y-4">
    <div class="grid gap-3 rounded-2xl border border-hairline bg-parchment p-5 shadow-sm md:grid-cols-[1fr_220px_180px]">
      <label class="block text-sm font-semibold text-ink">
        <span class="mb-2 block">Search</span>
        <input v-model="query" type="search" placeholder="Search by name or slug" :class="inputClass" />
      </label>
      <label class="block text-sm font-semibold text-ink">
        <span class="mb-2 block">Tier</span>
        <select v-model="tierFilter" :class="inputClass">
          <option value="">All tiers</option>
          <option v-for="tier in TIERS" :key="tier.value" :value="tier.value">{{ tier.label }}</option>
        </select>
      </label>
      <label class="block text-sm font-semibold text-ink">
        <span class="mb-2 block">Status</span>
        <select v-model="statusFilter" :class="inputClass">
          <option value="">All</option>
          <option value="public">Public</option>
          <option value="hidden">Hidden</option>
        </select>
      </label>
    </div>

    <p v-if="message" role="status" class="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ message }}</p>
    <p v-if="errorMessage" role="alert" class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{{ errorMessage }}</p>

    <div class="overflow-hidden rounded-2xl border border-hairline bg-parchment shadow-sm">
      <p class="border-b border-sand px-4 py-2 text-xs text-graphite">
        Showing {{ visibleRows.length }} of {{ rows.length }} venues
        <template v-if="tierFilter && isTierValue(tierFilter)"> in {{ tierLabel(tierFilter) }}</template>
      </p>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-hairline text-left text-sm text-[#2d2d2d]">
          <thead class="bg-card text-ink">
            <tr>
              <th v-for="column in ([['name', 'Venue'], ['tier', 'Tier'], ['status', 'Status'], ['updatedAt', 'Updated']] as const)" :key="column[0]" scope="col" class="px-4 py-3 font-semibold" :aria-sort="ariaSort(column[0])">
                <button type="button" class="inline-flex items-center gap-1 rounded hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-navy" @click="sortBy(column[0])">
                  {{ column[1] }} <span aria-hidden="true" class="text-xs text-ochre">{{ sortIndicator(column[0]) }}</span>
                </button>
              </th>
              <th scope="col" class="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-sand">
            <tr v-if="!visibleRows.length">
              <td colspan="5" class="px-4 py-10 text-center text-soot">No venues match the current filters.</td>
            </tr>
            <tr v-for="venue in visibleRows" :key="venue.id">
              <td class="px-4 py-3">
                <a :href="`/admin/venues/${venue.id}`" class="font-semibold text-ink hover:underline">{{ venue.name }}</a>
                <div class="text-xs text-graphite">{{ venue.slug }}</div>
                <div class="text-xs text-graphite">Last inspected: {{ formatDate(venue.lastInspectionDate, { fallback: 'never' }) }}</div>
              </td>
              <td class="px-4 py-3"><TierBadge :tier="venue.tier" /></td>
              <td class="px-4 py-3">
                <span :class="['inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]', venue.hiddenReason ? 'bg-stone-200 text-stone-700' : 'bg-emerald-100 text-emerald-800']">
                  {{ venue.hiddenReason ? HIDDEN_LABELS[venue.hiddenReason] : 'Public' }}
                </span>
                <span v-if="venue.closed" class="ml-1 inline-flex whitespace-nowrap rounded-full bg-stone-700 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white">
                  Closed
                </span>
                <span
                  v-if="venue.routeStatus === 'route_pending' || venue.routeStatus === 'estimated'"
                  class="ml-1 inline-flex whitespace-nowrap rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-800"
                >
                  {{ ROUTE_STATUS_LABELS[venue.routeStatus] }}
                </span>
              </td>
              <td class="whitespace-nowrap px-4 py-3 text-soot">{{ formatDate(venue.updatedAt) }}</td>
              <td class="px-4 py-3">
                <div class="flex justify-end gap-2">
                  <a :href="`/admin/venues/${venue.id}`" class="rounded-lg border border-hairline bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:bg-linen">Edit</a>
                  <button type="button" class="rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#8e201d] disabled:opacity-60" :disabled="busy[venue.id]" @click="pendingDelete = venue">
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <ConfirmDialog
      :open="Boolean(pendingDelete)"
      title="Delete venue"
      :message="`Delete “${pendingDelete?.name ?? ''}” permanently? This cannot be undone.`"
      confirm-label="Delete venue"
      @cancel="pendingDelete = null"
      @confirm="performDelete"
    />
  </div>
</template>
