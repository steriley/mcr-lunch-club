<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { ANCHOR_DISH_MAX, GOLDEN_CUT_SIZE, PUFF_PIECE_MAX } from '@/lib/golden-cut-schema';

interface Entry {
  venueId: string;
  venueName: string;
  puffPiece: string | null;
  anchorDish: string | null;
  notShownReason: string | null;
}

interface ApprovedVenue {
  id: string;
  name: string;
  notShownReason: string | null;
}

/** Drag, or use the move buttons, to order the list; position 1 is the home page hero. */
const props = defineProps<{ entries: Entry[]; approvedVenues: ApprovedVenue[] }>();

const toRow = (entry: Entry) => ({ ...entry, puffPiece: entry.puffPiece ?? '', anchorDish: entry.anchorDish ?? '' });
const rows = ref(props.entries.map(toRow));
const savedSnapshot = ref(JSON.stringify(rows.value));
const isDirty = computed(() => JSON.stringify(rows.value) !== savedSnapshot.value);

const addVenueId = ref('');
const available = computed(() => props.approvedVenues.filter((venue) => !rows.value.some((row) => row.venueId === venue.id)));
const isFull = computed(() => rows.value.length >= GOLDEN_CUT_SIZE);

const busy = ref(false);
const message = ref('');
const errorMessage = ref('');
const dragIndex = ref<number | null>(null);
const dropIndex = ref<number | null>(null);

const position = (index: number) => `#${String(index + 1).padStart(2, '0')}`;

function add() {
  const venue = props.approvedVenues.find((candidate) => candidate.id === addVenueId.value);
  if (!venue || isFull.value) return;
  rows.value.push({ venueId: venue.id, venueName: venue.name, puffPiece: '', anchorDish: '', notShownReason: venue.notShownReason });
  addVenueId.value = '';
  message.value = '';
}

function remove(index: number) {
  rows.value.splice(index, 1);
  message.value = '';
}

function move(from: number, to: number) {
  if (to < 0 || to >= rows.value.length || from === to) return;
  const [row] = rows.value.splice(from, 1);
  rows.value.splice(to, 0, row);
  message.value = `${row.venueName} moved to ${position(to)}.`;
}

function onDragStart(index: number, event: DragEvent) {
  dragIndex.value = index;
  event.dataTransfer?.setData('text/plain', String(index));
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}

function onDrop(index: number) {
  if (dragIndex.value !== null) move(dragIndex.value, index);
  dragIndex.value = null;
  dropIndex.value = null;
}

async function save() {
  message.value = '';
  errorMessage.value = '';
  busy.value = true;
  try {
    const response = await fetch('/api/admin/golden-cut', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entries: rows.value.map(({ venueId, puffPiece, anchorDish }) => ({ venueId, puffPiece, anchorDish })),
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const fieldErrors = result.fields ? Object.values(result.fields).join(' ') : '';
      errorMessage.value = fieldErrors || result.error || 'That did not save. Try again.';
      return;
    }
    rows.value = (result.entries as Entry[]).map(toRow);
    savedSnapshot.value = JSON.stringify(rows.value);
    message.value = 'Saved. The home page shows the new order within about a minute.';
  } catch {
    errorMessage.value = 'That did not save. Try again.';
  } finally {
    busy.value = false;
  }
}

function discard() {
  rows.value = JSON.parse(savedSnapshot.value);
  message.value = 'Changes discarded.';
  errorMessage.value = '';
}

function onBeforeUnload(event: BeforeUnloadEvent) {
  if (!isDirty.value) return;
  event.preventDefault();
  event.returnValue = '';
}

onMounted(() => window.addEventListener('beforeunload', onBeforeUnload));
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload));

const inputClass = 'w-full rounded-lg border border-[#d9cfb8] bg-white px-3 py-2.5 text-base text-[#1a1e24] outline-none focus:border-[#1B2F6B] focus-visible:ring-2 focus-visible:ring-[#1B2F6B]/30';
const labelClass = 'block text-sm font-semibold text-[#1a1e24]';
const smallButton = 'rounded-lg border border-[#d9cfb8] bg-[#f9f7f1] px-3 py-1.5 text-xs font-semibold text-[#1a1e24] hover:bg-[#f5efe5] disabled:cursor-not-allowed disabled:opacity-50';
</script>

<template>
  <div class="space-y-5">
    <p v-if="message" role="status" class="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{{ message }}</p>
    <p v-if="errorMessage" role="alert" class="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{{ errorMessage }}</p>

    <p v-if="rows.length === 0" class="rounded-2xl border border-dashed border-[#d9cfb8] bg-[#f9f7f1] p-6 text-sm text-[#3d3d3d]">
      The Golden Cut is empty, so the home page shows the nearest Approved venues instead. Add up to {{ GOLDEN_CUT_SIZE }} below.
    </p>

    <ol v-else class="space-y-4" aria-label="The Golden Cut, in order">
      <li
        v-for="(row, index) in rows"
        :key="row.venueId"
        class="rounded-2xl border bg-[#f9f7f1] p-5 shadow-sm transition"
        :class="[
          index === 0 ? 'border-[#c59b27] ring-1 ring-[#c59b27]/40' : 'border-[#d9cfb8]',
          dropIndex === index && dragIndex !== index ? 'ring-2 ring-[#1B2F6B]' : '',
          dragIndex === index ? 'opacity-60' : '',
        ]"
        @dragover.prevent="dropIndex = index"
        @dragleave="dropIndex = dropIndex === index ? null : dropIndex"
        @drop.prevent="onDrop(index)"
      >
        <div class="flex flex-wrap items-center gap-3">
          <span
            class="cursor-grab select-none rounded-md border border-[#d9cfb8] bg-white px-2 py-1 text-base text-[#535353] active:cursor-grabbing"
            draggable="true"
            title="Drag to reorder"
            aria-hidden="true"
            @dragstart="onDragStart(index, $event)"
            @dragend="dragIndex = null; dropIndex = null"
          >⠿</span>
          <span class="rounded-md bg-[#1a1e24] px-2 py-1 font-mono text-xs font-bold text-[#f5c451]">{{ position(index) }}</span>
          <span class="text-base font-semibold text-[#1a1e24]">{{ row.venueName }}</span>
          <span v-if="index === 0" class="rounded-full border border-[#c59b27] bg-[#fff8e6] px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-[#8a5100]">Hero</span>
          <span v-if="row.notShownReason" class="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
            Not on the home page: {{ row.notShownReason }}
          </span>
          <span class="ml-auto flex gap-2">
            <button type="button" :class="smallButton" :disabled="index === 0" :aria-label="`Move ${row.venueName} up`" @click="move(index, index - 1)">↑ Up</button>
            <button type="button" :class="smallButton" :disabled="index === rows.length - 1" :aria-label="`Move ${row.venueName} down`" @click="move(index, index + 1)">↓ Down</button>
            <button type="button" class="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50" :aria-label="`Remove ${row.venueName}`" @click="remove(index)">Remove</button>
          </span>
        </div>

        <div class="mt-4 grid gap-4 md:grid-cols-[2fr_1fr]">
          <label :class="labelClass">
            <span class="mb-2 block">{{ index === 0 ? 'Puff piece (shown in full on the hero)' : 'Hook (one punchy sentence)' }}</span>
            <textarea v-model="row.puffPiece" :rows="index === 0 ? 4 : 2" :maxlength="PUFF_PIECE_MAX" :class="inputClass" placeholder="Leave blank to use the venue's pull quote" />
            <span class="mt-1 block text-xs font-normal text-[#535353]">{{ row.puffPiece.length }} / {{ PUFF_PIECE_MAX }}</span>
          </label>
          <label :class="labelClass">
            <span class="mb-2 block">Anchor dish</span>
            <input v-model="row.anchorDish" type="text" :maxlength="ANCHOR_DISH_MAX" :class="inputClass" placeholder="Leave blank to use the lunch special" />
          </label>
        </div>
      </li>
    </ol>

    <div class="flex flex-wrap items-end gap-3 rounded-2xl border border-[#d9cfb8] bg-[#f9f7f1] p-5">
      <label :class="[labelClass, 'min-w-64 flex-1']">
        <span class="mb-2 block">Add an Approved venue</span>
        <select v-model="addVenueId" :class="inputClass" :disabled="isFull || available.length === 0">
          <option value="">{{ isFull ? `Full: remove a venue to add another` : available.length ? 'Choose a venue' : 'Every Approved venue is already in' }}</option>
          <option v-for="venue in available" :key="venue.id" :value="venue.id">
            {{ venue.name }}{{ venue.notShownReason ? ` (${venue.notShownReason.toLowerCase()})` : '' }}
          </option>
        </select>
      </label>
      <button type="button" :class="smallButton" class="py-2.5 text-sm" :disabled="!addVenueId || isFull" @click="add">Add to The Golden Cut</button>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <button
        type="button"
        :disabled="busy || !isDirty"
        class="rounded-lg bg-[#1B2F6B] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#111E47] disabled:cursor-not-allowed disabled:opacity-70"
        @click="save"
      >
        {{ busy ? 'Saving…' : 'Save The Golden Cut' }}
      </button>
      <button v-if="isDirty" type="button" :disabled="busy" :class="smallButton" class="py-2.5 text-sm" @click="discard">Discard changes</button>
      <span v-if="isDirty" class="text-sm text-amber-800">Unsaved changes</span>
    </div>
  </div>
</template>
