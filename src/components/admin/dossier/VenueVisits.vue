<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue';
import ConfirmDialog from '../ConfirmDialog.vue';
import DossierCard from './DossierCard.vue';
import DossierIcon from './DossierIcon.vue';
import { apiFetch, failureText } from '@/lib/api-fetch';
import { formatDate, formatDateTime } from '@/lib/dates';
import { NOTE_BODY_MAX } from '@/lib/field-notes-schema';
import { useOnline } from '@/lib/pwa/useOnline';
import type { SerializedNote } from '@/lib/field-notes';
import type { SerializedVisit } from '@/lib/visits';

/**
 * Visits and field notes for one venue (Chairs only). Every visit by every Chair, newest first,
 * each with all of its notes: any active Chair reads them all. Only a visit's own Chair sees "Add
 * field note", "Edit" and "Delete" on it (the server checks the same). "Log a visit" records a
 * standalone visit that has no effect on inspections or tiers. `readOnly` shows the list alone, for
 * the evidence behind a tier motion.
 */
const props = defineProps<{
  venueId: string;
  visits: SerializedVisit[];
  /** The signed-in Chair; null when read-only. */
  currentUserId: string | null;
  /** London today (YYYY-MM-DD): the latest day a visit can be logged for. */
  today: string;
  readOnly?: boolean;
  /** Read-only: shown when there are no visits. */
  emptyText?: string;
}>();

const online = useOnline();
const list = ref<SerializedVisit[]>(props.visits.map((visit) => ({ ...visit })));

const logDate = ref(props.today);
const logBusy = ref(false);
const logError = ref('');

/** Visit id -> draft text of a new note. */
const composing = reactive<Record<string, string>>({});
/** Note id -> draft text of an edit. */
const editing = reactive<Record<string, string>>({});
const busy = ref<string | null>(null);
const errors = reactive<Record<string, string>>({});
const deleting = ref<SerializedNote | null>(null);

const isMine = (visit: SerializedVisit) =>
  !props.readOnly && Boolean(props.currentUserId) && visit.visitorId === props.currentUserId;
const totalNotes = computed(() => list.value.reduce((sum, visit) => sum + visit.notes.length, 0));

function sortVisits() {
  list.value.sort(
    (a, b) => b.visitDate.localeCompare(a.visitDate) || b.createdAt.localeCompare(a.createdAt)
  );
}

/** Adds a visit, or updates one already listed (keeping its notes, which the press does not send). */
function upsert(visit: SerializedVisit) {
  const existing = list.value.find((item) => item.id === visit.id);
  if (existing) Object.assign(existing, { ...visit, notes: existing.notes });
  else list.value.push({ ...visit, notes: [...visit.notes] });
  sortVisits();
}

/** Opens the note editor on a visit (after "Visited today") and brings it into view. */
async function openNote(visit: SerializedVisit) {
  upsert(visit);
  composing[visit.id] ??= '';
  await nextTick();
  const field = document.getElementById(`note-new-${visit.id}`);
  field?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  field?.focus({ preventScroll: true });
}

defineExpose({ upsert, openNote });

function tooLong(text: string) {
  return text.trim().length > NOTE_BODY_MAX;
}

async function logVisit() {
  logError.value = '';
  logBusy.value = true;
  const result = await apiFetch<{ visit: SerializedVisit }>(
    `/api/admin/venues/${props.venueId}/visits`,
    { method: 'POST', body: { visitDate: logDate.value }, fallback: 'Could not log that visit.' }
  );
  logBusy.value = false;
  if (!result.ok) {
    logError.value = failureText(result);
    return;
  }
  upsert(result.data.visit);
  composing[result.data.visit.id] ??= '';
}

async function addNote(visit: SerializedVisit) {
  const body = composing[visit.id] ?? '';
  errors[visit.id] = '';
  busy.value = visit.id;
  const result = await apiFetch<{ note: SerializedNote }>(`/api/admin/visits/${visit.id}/notes`, {
    method: 'POST',
    body: { body },
    fallback: 'Could not save that note.',
  });
  busy.value = null;
  if (!result.ok) {
    errors[visit.id] = failureText(result);
    return;
  }
  visit.notes.push(result.data.note);
  delete composing[visit.id];
}

async function saveEdit(visit: SerializedVisit, note: SerializedNote) {
  errors[note.id] = '';
  busy.value = note.id;
  const result = await apiFetch<{ note: SerializedNote }>(`/api/admin/notes/${note.id}`, {
    method: 'PATCH',
    body: { body: editing[note.id] ?? '' },
    fallback: 'Could not save that change.',
  });
  busy.value = null;
  if (!result.ok) {
    errors[note.id] = failureText(result);
    return;
  }
  const index = visit.notes.findIndex((item) => item.id === note.id);
  if (index >= 0) visit.notes[index] = result.data.note;
  delete editing[note.id];
}

async function confirmDelete() {
  const note = deleting.value;
  if (!note) return;
  deleting.value = null;
  errors[note.id] = '';
  busy.value = note.id;
  const result = await apiFetch(`/api/admin/notes/${note.id}`, {
    method: 'DELETE',
    fallback: 'Could not delete that note.',
  });
  busy.value = null;
  if (!result.ok) {
    errors[note.id] = result.error;
    return;
  }
  const visit = list.value.find((item) => item.id === note.visitId);
  if (visit) visit.notes = visit.notes.filter((item) => item.id !== note.id);
}

function noteMeta(note: SerializedNote): string {
  const parts = [`Written ${formatDateTime(note.createdAt)}`];
  if (note.daysAfterVisit > 0)
    parts.push(`${note.daysAfterVisit} day${note.daysAfterVisit === 1 ? '' : 's'} after the visit`);
  if (note.editedAt) parts.push(`edited ${formatDateTime(note.editedAt)}`);
  return parts.join(' · ');
}

function statusTone(label: string): string {
  if (label === 'Pending') return 'bg-warning-tint text-warning-ink';
  if (label.startsWith('Confirmed')) return 'bg-success-tint text-success-ink';
  if (label === 'Unconfirmed') return 'bg-[var(--dossier-paper)] text-[var(--dossier-muted)]';
  return 'bg-steel-tint text-steel';
}

const wrapper = computed(() => (props.readOnly ? 'div' : DossierCard));
const wrapperProps = computed(() =>
  props.readOnly
    ? { class: 'space-y-3' }
    : { id: 'visits', title: 'Visits & Field Notes', tag: 'Chairs only', icon: 'feather' }
);
</script>

<template>
  <component :is="wrapper" v-bind="wrapperProps">
    <template v-if="!readOnly">
      <p class="text-[13px] leading-[19px] text-[var(--dossier-muted)]">
        Every visit by every Chair, with their field notes. Notes are for the Chairs only and never
        appear on the public site. You can write about your own visits at any time.
      </p>

      <form
        class="dossier-inset flex flex-wrap items-end gap-2 bg-[var(--dossier-field)]"
        @submit.prevent="logVisit"
      >
        <div class="min-w-0 flex-1">
          <label class="dossier-label" for="log-visit-date">Log a visit</label>
          <input
            id="log-visit-date"
            v-model="logDate"
            type="date"
            required
            :max="today"
            class="dossier-input dossier-figures text-sm"
            :aria-invalid="Boolean(logError)"
          />
        </div>
        <button
          type="submit"
          class="dossier-btn is-primary"
          :disabled="logBusy || !online || !logDate"
        >
          <DossierIcon
            :name="logBusy ? 'refresh' : 'check'"
            :size="16"
            :class="logBusy && 'dossier-spin'"
          />
          {{ logBusy ? 'Logging…' : 'Log visit' }}
        </button>
        <span class="dossier-hint mt-0 w-full"
          >A visit on its own does not start or count towards an inspection and never changes the
          verdict.</span
        >
        <span v-if="logError" role="alert" class="dossier-error mt-0 w-full">{{ logError }}</span>
        <span v-if="!online" class="dossier-hint mt-0 w-full" role="status"
          >You're offline. Visits and notes need a connection.</span
        >
      </form>
    </template>

    <p v-if="!list.length" class="text-[13px] text-[var(--dossier-muted)]">
      {{ emptyText ?? 'No visits recorded yet.' }}
    </p>
    <p v-else-if="!readOnly" class="dossier-overline">
      {{ list.length }} visit{{ list.length === 1 ? '' : 's' }} · {{ totalNotes }} note{{
        totalNotes === 1 ? '' : 's'
      }}
    </p>

    <ol v-if="list.length" class="space-y-3">
      <li
        v-for="visit in list"
        :id="readOnly ? undefined : `visit-${visit.id}`"
        :key="visit.id"
        class="rounded-lg border border-[var(--dossier-border)] bg-[var(--dossier-card)] p-3"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-[13px] font-semibold text-[var(--dossier-ink)]">
            <time class="dossier-figures" :datetime="visit.visitDate">{{
              formatDate(visit.visitDate)
            }}</time>
            · {{ visit.visitorName ?? 'A former Chair'
            }}<span v-if="isMine(visit)" class="font-normal text-[var(--dossier-muted)]">
              (you)</span
            >
          </p>
          <span
            :class="[
              'rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em]',
              statusTone(visit.statusLabel),
            ]"
            >{{ visit.statusLabel }}</span
          >
        </div>

        <ul v-if="visit.notes.length" class="mt-2 space-y-2">
          <li
            v-for="note in visit.notes"
            :key="note.id"
            class="border-l-2 border-[var(--dossier-secondary)] pl-3"
          >
            <template v-if="editing[note.id] !== undefined">
              <label class="sr-only" :for="`note-edit-${note.id}`">Edit field note</label>
              <textarea
                :id="`note-edit-${note.id}`"
                v-model="editing[note.id]"
                rows="4"
                class="dossier-input text-sm"
                :maxlength="NOTE_BODY_MAX"
              />
              <div class="mt-1.5 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  class="dossier-btn is-primary"
                  :disabled="
                    busy === note.id ||
                    !online ||
                    !editing[note.id].trim() ||
                    tooLong(editing[note.id])
                  "
                  @click="saveEdit(visit, note)"
                >
                  {{ busy === note.id ? 'Saving…' : 'Save' }}
                </button>
                <button type="button" class="dossier-link" @click="delete editing[note.id]">
                  Cancel
                </button>
                <span class="dossier-figures ml-auto text-[11px] text-[var(--dossier-muted)]"
                  >{{ editing[note.id].trim().length }} / {{ NOTE_BODY_MAX }}</span
                >
              </div>
            </template>
            <template v-else>
              <p
                class="whitespace-pre-line break-words text-[13px] leading-[19px]"
                v-text="note.body"
              />
              <p class="mt-1 text-[11px] text-[var(--dossier-muted)]">
                {{ noteMeta(note) }}
              </p>
              <div v-if="isMine(visit)" class="mt-1 flex gap-3">
                <button
                  type="button"
                  class="dossier-link text-[12px]"
                  :disabled="!online || busy === note.id"
                  @click="editing[note.id] = note.body"
                >
                  Edit
                </button>
                <button
                  type="button"
                  class="dossier-link is-danger text-[12px]"
                  :disabled="!online || busy === note.id"
                  @click="deleting = note"
                >
                  Delete
                </button>
              </div>
            </template>
            <p v-if="errors[note.id]" role="alert" class="dossier-error mt-1">
              {{ errors[note.id] }}
            </p>
          </li>
        </ul>
        <p
          v-else-if="!isMine(visit) || composing[visit.id] === undefined"
          class="mt-1.5 text-[12px] italic text-[var(--dossier-muted)]"
        >
          No field notes.
        </p>

        <template v-if="isMine(visit)">
          <div v-if="composing[visit.id] !== undefined" class="mt-2">
            <label class="dossier-label" :for="`note-new-${visit.id}`">Field note</label>
            <textarea
              :id="`note-new-${visit.id}`"
              v-model="composing[visit.id]"
              rows="4"
              class="dossier-input text-sm"
              :maxlength="NOTE_BODY_MAX"
              placeholder="Food, service, price, queue, atmosphere: whatever justified the outcome."
            />
            <div class="mt-1.5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                class="dossier-btn is-primary"
                :disabled="
                  busy === visit.id ||
                  !online ||
                  !composing[visit.id].trim() ||
                  tooLong(composing[visit.id])
                "
                @click="addNote(visit)"
              >
                {{ busy === visit.id ? 'Saving…' : 'Save note' }}
              </button>
              <button type="button" class="dossier-link" @click="delete composing[visit.id]">
                Cancel
              </button>
              <span class="dossier-figures ml-auto text-[11px] text-[var(--dossier-muted)]"
                >{{ composing[visit.id].trim().length }} / {{ NOTE_BODY_MAX }}</span
              >
            </div>
          </div>
          <button
            v-else
            type="button"
            class="dossier-link mt-2 text-[12px]"
            :disabled="!online"
            @click="composing[visit.id] = ''"
          >
            Add field note
          </button>
          <p v-if="errors[visit.id]" role="alert" class="dossier-error mt-1">
            {{ errors[visit.id] }}
          </p>
        </template>
      </li>
    </ol>

    <ConfirmDialog
      v-if="!readOnly"
      :open="deleting !== null"
      title="Delete this field note?"
      message="This cannot be undone."
      confirm-label="Delete note"
      @confirm="confirmDelete"
      @cancel="deleting = null"
    />
  </component>
</template>
